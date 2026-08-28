import * as path from "path";
import * as fs from "fs";
import { PackageForEsp32 } from "../package";
import { Project } from "../project";
import { BoardToolchain, MemoryImage, MemoryLayout, ShadowMemory } from "./board-toolchain";
import { executeCommand, getErrorMessage } from "../utils";
import { ElfReader } from "./tools/elf-reader";
import generateLinkerScript from "./tools/linker-script";
import { Esp32Target } from "./esp32-toolchain";


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

export type RuntimeBundleManifest = {
    target: Esp32Target,
    vmVersion: string,
    // Linker scripts under rom-ld/, in the order they must be included.
    ldFiles: string[],
};

export function readRuntimeBundleManifest(bundleDir: string): RuntimeBundleManifest {
    const manifestPath = path.join(bundleDir, RUNTIME_BUNDLE_MANIFEST);
    try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as RuntimeBundleManifest;
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
        ld: string,      // GNU ld for xtensa (bundled with esp-clang)
    },
};

// Clang-based toolchain for the ESP32 family. Unlike Esp32Toolchain it needs
// neither ESP-IDF nor its component archives: every runtime symbol is resolved
// against the firmware ELF in the bundle, so only projects that do not use
// espIdfComponents are supported.
export class Esp32ClangToolchain implements BoardToolchain<PackageForEsp32, MemoryImage> {
    public memory: ShadowMemory;

    private config: Esp32ClangToolchainConfig;
    private manifest: RuntimeBundleManifest;
    private compiledPackages = new Set<string>();
    private definedSymbols: Map<string, { name: string; address: number }>;

    get cProlog() {
        return `
#include <stdint.h>
#include "${this.cRuntimeH}"
`;
    }
    get bundleDir() { return this.config.bundleDir; }
    get runtimeElf() { return path.join(this.bundleDir, 'bluescript.elf'); }
    get includeDir() { return path.join(this.bundleDir, 'include'); }
    get cRuntimeH() { return path.join(this.includeDir, 'c-runtime.h'); }
    get builtinModulePath() { return path.join(this.bundleDir, 'std-module.bs'); }
    get ldFiles() { return this.manifest.ldFiles.map(f => path.join(this.bundleDir, 'rom-ld', f)); }
    get target() { return this.config.target; }

    constructor(config: Esp32ClangToolchainConfig, memoryLayout: MemoryLayout) {
        this.config = config;
        this.memory = new ShadowMemory(memoryLayout);
        this.manifest = readRuntimeBundleManifest(config.bundleDir);
        if (this.manifest.target !== config.target) {
            throw new Error(
                `The runtime bundle ${config.bundleDir} is for ${this.manifest.target}, not for ${config.target}.`);
        }
        const elfReader = new ElfReader(this.runtimeElf);
        this.definedSymbols = new Map(elfReader.readAllSymbols().map(s => [s.name, s]));
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

    // Flags passed to clang. They mirror the GCC flags used by Esp32Toolchain.
    get compileFlags(): string[] {
        return [
            '--target=xtensa-esp-elf', `-mcpu=${this.target}`,
            '-ffreestanding', '-nostdlib',
            '-O2', '-w', '-fno-common',
            '-ffunction-sections', '-fdata-sections',
            '-mtext-section-literals', '-mlongcalls',
            '-fno-zero-initialized-in-bss',
        ];
    }

    private async compilePackage(pkg: PackageForEsp32): Promise<void> {
        if (pkg.espIdfComponents.length > 0) {
            throw new Error(
                `Package ${pkg.name} uses ESP-IDF components (${pkg.espIdfComponents.join(', ')}), ` +
                `which are not available with the clang toolchain. ` +
                `Set up the full ESP-IDF environment with 'bscript board setup ${this.target}'.`);
        }
        try {
            const archivePath = pkg.archiveFile;
            if (fs.existsSync(archivePath)) {
                fs.rmSync(archivePath, { force: true });
            }
            pkg.copyNativeFilesToDist();
            pkg.ensureBuildDirs();

            const includeFlags = [pkg.resolvedDistDir, pkg.resolvedBuildDir, this.includeDir].map(d => `-I${d}`);
            const objectFiles: string[] = [];
            for (const source of this.sourceFiles(pkg)) {
                const object = pkg.objectFileOf(source);
                await executeCommand(
                    this.config.toolchain.clang,
                    [...this.compileFlags, ...includeFlags, '-c', source, '-o', object],
                    pkg.resolvedDistDir,
                );
                objectFiles.push(object);
            }
            await executeCommand(this.config.toolchain.ar, ['rcs', archivePath, ...objectFiles], pkg.resolvedBuildDir);
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
            const archives = [
                project.mainPackage.archiveFile,
                ...project.usedDependencies.map(pkg => pkg.archiveFile).reverse(),
            ];
            const linkerscript = generateLinkerScript(
                archives.map(ar => path.relative(cwd, ar)),
                this.memory,
                Array.from(this.definedSymbols.values()),
                entryPoints.at(-1)!,
                entryPoints.slice(0, -1),
                this.ldFiles,
            );
            const linkerScriptPath = project.mainPackage.writeLinkerScript(linkerscript);
            await executeCommand(this.config.toolchain.ld, ['-o', elfPath, '-T', linkerScriptPath, '--gc-sections'], cwd);
            return elfPath;
        } catch (error) {
            throw new Error(`Failed to link: ${getErrorMessage(error)}`, {cause: error});
        }
    }

    private extractBinary(elfPath: string, entryPoints: string[]): MemoryImage {
        const elf = new ElfReader(elfPath);
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
