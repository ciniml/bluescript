import * as path from "path";
import { FileSystem, nodeFileSystem } from "../file-system";
import { ToolRunner, nodeToolRunner } from "../tool-runner";
import { PackageForEsp32 } from "../package";
import { Project } from "../project";
import { BoardToolchain, MemoryImage, MemoryLayout, ShadowMemory } from "./board-toolchain";
import { getErrorMessage } from "../utils";
import { ElfReader } from "./tools/elf-reader";
import generateLinkerScript from "./tools/linker-script";
import { Esp32Target } from "./esp32-toolchain";
import { EspAppDesc, assertFirmwareMatches } from "./tools/firmware-id";


// Layout of a runtime bundle. A bundle holds everything that is needed to
// compile and link BlueScript programs against a prebuilt runtime firmware,
// without an ESP-IDF installation:
//
//   <bundle>/bundle.json        metadata (see RuntimeBundleManifest)
//   <bundle>/bluescript.elf     firmware ELF (symbol addresses)
//   <bundle>/std-module.bs      built-in module declarations
//   <bundle>/include/*.h        c-runtime.h and its dependencies
//   <bundle>/rom-ld/*.ld        ROM / peripheral linker scripts
//   <bundle>/flash/*            flash images and flash_args (for esptool)
export const RUNTIME_BUNDLE_MANIFEST = 'bundle.json';

export type RuntimeBundleComponent = {
    archive: string,        // relative to the bundle
    includeDirs: string[],  // relative to the bundle
    requires: string[],     // transitive requirements (component names)
};

export type RuntimeBundleManifest = {
    target: Esp32Target,
    // Board variant the firmware was built for (defaults to the target).
    board?: string,
    vmVersion: string,
    // Linker scripts under rom-ld/, in the order they must be included.
    ldFiles: string[],
    // ESP-IDF components packaged with the bundle (optional).
    components?: { [name: string]: RuntimeBundleComponent },
    // Directories (relative to the bundle) needed to compile against ESP-IDF headers.
    sysrootIncludeDir?: string,   // newlib headers
    sdkconfigDir?: string,        // sdkconfig.h
    // Preprocessor definitions used to build the firmware.
    defines?: string[],
    // Application descriptor of the packaged firmware (bluescript.bin).
    firmware?: EspAppDesc,
};

export function readRuntimeBundleManifest(bundleDir: string, fs: FileSystem = nodeFileSystem): RuntimeBundleManifest {
    const manifestPath = path.join(bundleDir, RUNTIME_BUNDLE_MANIFEST);
    try {
        return JSON.parse(fs.readTextFile(manifestPath)) as RuntimeBundleManifest;
    } catch (error) {
        throw new Error(`Failed to read the runtime bundle manifest: ${manifestPath}`, { cause: error });
    }
}

export type Esp32ClangToolchainConfig = {
    // Directory of the runtime bundle.
    bundleDir: string,
    target: Esp32Target,
    toolchain: {
        clang: string,   // Espressif clang
        ar: string,      // llvm-ar
        ld: string,      // GNU ld for xtensa (bundled with esp-clang) or ld.lld
    },
    // 'native': the toolchain entries are executables.
    // 'wasm':   they are Emscripten modules (*.js) run through node.
    runner?: 'native' | 'wasm',
    // Directory holding lib/clang/<version>/include of the wasm toolchain.
    // Passed to clang as -resource-dir.
    resourceDir?: string,
};

// Clang-based toolchain for the ESP32 family. Unlike Esp32Toolchain it needs
// neither ESP-IDF nor its component archives: every runtime symbol is resolved
// against the firmware ELF in the bundle, so only projects that do not use
// espIdfComponents are supported.
export class Esp32ClangToolchain implements BoardToolchain<PackageForEsp32, MemoryImage> {
    public memory: ShadowMemory;

    private config: Esp32ClangToolchainConfig;
    private manifest: RuntimeBundleManifest;
    private fs: FileSystem;
    private runner: ToolRunner;
    private compiledPackages = new Set<string>();
    private definedSymbols: Map<string, { name: string; address: number }>;

    // The bundle's include directory is passed with -I, so the header is
    // referenced by name. (An absolute path would not be visible inside the
    // WebAssembly toolchain's filesystem.)
    get cProlog() {
        return `
#include <stdint.h>
#include "c-runtime.h"
`;
    }
    get bundleDir() { return this.config.bundleDir; }
    get runtimeElf() { return path.join(this.bundleDir, 'bluescript.elf'); }
    get includeDir() { return path.join(this.bundleDir, 'include'); }
    get cRuntimeH() { return path.join(this.includeDir, 'c-runtime.h'); }
    get builtinModulePath() { return path.join(this.bundleDir, 'std-module.bs'); }
    get ldFiles() { return this.manifest.ldFiles.map(f => path.join(this.bundleDir, 'rom-ld', f)); }
    get target() { return this.config.target; }
    get isWasm() { return this.config.runner === 'wasm'; }

    constructor(config: Esp32ClangToolchainConfig, memoryLayout: MemoryLayout,
                deps: { fs?: FileSystem, runner?: ToolRunner } = {}) {
        this.config = config;
        this.fs = deps.fs ?? nodeFileSystem;
        this.runner = deps.runner ?? nodeToolRunner;
        this.memory = new ShadowMemory(memoryLayout);
        this.manifest = readRuntimeBundleManifest(config.bundleDir, this.fs);
        if (this.manifest.target !== config.target) {
            throw new Error(
                `The runtime bundle ${config.bundleDir} is for ${this.manifest.target}, not for ${config.target}.`);
        }
        const elfReader = ElfReader.fromBuffer(this.fs.readFile(this.runtimeElf), this.runtimeElf);
        this.definedSymbols = new Map(elfReader.readAllSymbols().map(s => [s.name, s]));
        assertFirmwareMatches(memoryLayout, this.manifest.firmware, this.definedSymbols);
    }

    async compileAndLink(project: Project<PackageForEsp32>, entryPoints: string[]): Promise<MemoryImage> {
        for (const pkg of project.usedDependencies) {
            await this.compilePackage(pkg);
            this.compiledPackages.add(pkg.name);
        }
        await this.compilePackage(project.mainPackage);
        const elfPath = await this.link(project, entryPoints);
        return this.extractBinary(elfPath, entryPoints);
    }

    async additionalCompileAndLink(project: Project<PackageForEsp32>, entryPoints: string[]): Promise<MemoryImage> {
        for (const pkg of project.usedDependencies) {
            if (!this.compiledPackages.has(pkg.name)) {
                await this.compilePackage(pkg);
                this.compiledPackages.add(pkg.name);
            }
        }
        await this.compilePackage(project.mainPackage);
        const elfPath = await this.link(project, entryPoints);
        return this.extractBinary(elfPath, entryPoints);
    }

    // Run one of the toolchain commands, either natively or as a WebAssembly module.
    private async runTool(tool: string, args: string[], cwd: string): Promise<void> {
        await this.runner.run(tool, args, cwd, { wasm: this.isWasm });
    }

    // Flags passed to clang. They mirror the GCC flags used by Esp32Toolchain.
    get compileFlags(): string[] {
        return [
            ...(this.config.resourceDir ? ['-resource-dir', this.config.resourceDir] : []),
            '--target=xtensa-esp-elf', `-mcpu=${this.target}`,
            '-ffreestanding', '-nostdlib',
            '-O2', '-w', '-fno-common',
            '-ffunction-sections', '-fdata-sections',
            '-mtext-section-literals', '-mlongcalls',
            '-fno-zero-initialized-in-bss',
        ];
    }

    // Bundled ESP-IDF components needed by `names`, including transitive requirements.
    // Components that are part of the runtime firmware itself; their symbols are
    // always resolvable, so packages may list them without the bundle carrying them.
    private static readonly FIRMWARE_COMPONENTS = new Set(['core', 'main']);

    private bundledComponents(rawNames: string[]): { name: string, info: RuntimeBundleComponent }[] {
        const names = rawNames.filter(n => !Esp32ClangToolchain.FIRMWARE_COMPONENTS.has(n));
        const available = this.manifest.components ?? {};
        const missing = names.filter(n => !available[n]);
        if (missing.length > 0) {
            throw new Error(
                `ESP-IDF components ${missing.join(', ')} are not included in the runtime bundle ` +
                `(available: ${Object.keys(available).join(', ') || 'none'}). ` +
                `Rebuild the bundle with 'bscript board build-runtime ${this.target} --components ${names.join(',')}' ` +
                `or set up the full ESP-IDF environment with 'bscript board setup ${this.target}'.`);
        }
        const closure = new Set<string>();
        for (const n of names) {
            closure.add(n);
            available[n].requires.forEach(r => closure.add(r));
        }
        return Array.from(closure).filter(n => available[n]).map(name => ({ name, info: available[name] }));
    }

    private componentIncludeFlags(names: string[]): string[] {
        if (names.length === 0) return [];
        const flags: string[] = [];
        if (this.manifest.sysrootIncludeDir) flags.push('-isystem', path.join(this.bundleDir, this.manifest.sysrootIncludeDir));
        if (this.manifest.sdkconfigDir) flags.push(`-I${path.join(this.bundleDir, this.manifest.sdkconfigDir)}`);
        for (const { info } of this.bundledComponents(names)) {
            for (const d of info.includeDirs) flags.push(`-I${path.join(this.bundleDir, d)}`);
        }
        flags.push(...(this.manifest.defines ?? []));
        return flags;
    }

    private componentArchives(names: string[]): string[] {
        return this.bundledComponents(names).map(({ info }) => path.join(this.bundleDir, info.archive));
    }

    private async compilePackage(pkg: PackageForEsp32): Promise<void> {
        try {
            const archivePath = pkg.archiveFile;
            this.fs.rm(archivePath);
            pkg.copyNativeFilesToDist();
            pkg.ensureBuildDirs();

            const includeFlags = [
                ...[pkg.resolvedDistDir, pkg.resolvedBuildDir, this.includeDir].map(d => `-I${d}`),
                ...this.componentIncludeFlags(pkg.espIdfComponents),
            ];
            const objectFiles: string[] = [];
            for (const source of this.sourceFiles(pkg)) {
                const object = pkg.objectFileOf(source);
                await this.runTool(
                    this.config.toolchain.clang,
                    [...this.compileFlags, ...includeFlags, '-c', source, '-o', object],
                    pkg.resolvedDistDir,
                );
                objectFiles.push(object);
            }
            await this.runTool(this.config.toolchain.ar, ['rcs', archivePath, ...objectFiles], pkg.resolvedBuildDir);
        } catch (error) {
            throw new Error(`Failed to compile package ${pkg.name}: ${getErrorMessage(error)}`, {cause: error});
        }
    }

    private sourceFiles(pkg: PackageForEsp32): string[] {
        return pkg.cFilesInDist;
    }

    private async link(project: Project<PackageForEsp32>, entryPoints: string[]): Promise<string> {
        try {
            const cwd = process.cwd();
            const elfPath = project.mainPackage.elfFile;
            const componentNames = new Set<string>();
            [project.mainPackage, ...project.usedDependencies].forEach(p => p.espIdfComponents.forEach(c => componentNames.add(c)));
            const archives = [
                project.mainPackage.archiveFile,
                ...project.usedDependencies.map(pkg => pkg.archiveFile).reverse(),
                ...this.componentArchives(Array.from(componentNames)),
            ];
            const linkerscript = generateLinkerScript(
                archives.map(ar => path.relative(cwd, ar)),
                this.memory,
                Array.from(this.definedSymbols.values()),
                entryPoints.at(-1)!,
                entryPoints.slice(0, -1),
                this.ldFiles,
                (p: string) => this.runner.pathInTool?.(p, { wasm: this.isWasm }) ?? p,
            );
            const linkerScriptPath = project.mainPackage.writeLinkerScript(linkerscript);
            // ld.lld needs the flavor when it is not invoked through an ld.lld symlink,
            // and must not try to spawn threads in a WebAssembly build.
            const ldArgs = this.isWasm ? ['-flavor', 'gnu', '--threads=1'] : [];
            await this.runTool(this.config.toolchain.ld, [...ldArgs, '-o', elfPath, '-T', linkerScriptPath, '--gc-sections'], cwd);
            return elfPath;
        } catch (error) {
            throw new Error(`Failed to link: ${getErrorMessage(error)}`, {cause: error});
        }
    }

    private extractBinary(elfPath: string, entryPoints: string[]): MemoryImage {
        const elf = ElfReader.fromBuffer(this.fs.readFile(elfPath), elfPath);
        const sections = {
            iram: elf.readSectionByName(this.memory.iram.name),
            dram: elf.readSectionByName(this.memory.dram.name),
            iflash: elf.readSectionByName(this.memory.iflash.name),
            dflash: elf.readSectionByName(this.memory.dflash.name),
        };
        this.memory.addUsage(sections.iram?.size, sections.dram?.size, sections.iflash?.size, sections.dflash?.size);

        const newSymbols = elf.readDefinedSymbols();
        newSymbols.forEach(s => this.definedSymbols.set(s.name, s));

        const resolvedEntryPoints = entryPoints.map((name, i) => {
            const symbol = this.definedSymbols.get(name);
            if (symbol) {
                return {isMain: i === entryPoints.length - 1, address: symbol.address};
            }
            throw new Error(`Cannot find entry point: ${name}`);
        });

        return {
            iram: sections.iram ? {address: sections.iram.address, data: sections.iram.value} : undefined,
            dram: sections.dram ? {address: sections.dram.address, data: sections.dram.value} : undefined,
            iflash: sections.iflash ? {address: sections.iflash.address, data: sections.iflash.value} : undefined,
            dflash: sections.dflash ? {address: sections.dflash.address, data: sections.dflash.value} : undefined,
            entryPoints: resolvedEntryPoints
        }
    }
}
