// Runs lang's CompilerSession in the browser: the project and the runtime
// bundle live in a MemoryFileSystem, and the tools run as WebAssembly modules
// in a worker (see toolchain-worker.ts).
import { Buffer } from 'buffer';
import { MemoryFileSystem } from '../../lang/src/compiler/file-system';
import type { ToolRunner } from '../../lang/src/compiler/tool-runner';
import { CompilerSession } from '../../lang/src/compiler/compiler-session';
import { Project } from '../../lang/src/compiler/project';
import { PackageForEsp32 } from '../../lang/src/compiler/package';
import { Esp32ClangToolchain } from '../../lang/src/compiler/board-toolchain/esp32-clang-toolchain';
import { MemoryImage, MemoryLayout } from '../../lang/src/compiler/board-toolchain/board-toolchain';
import { checkFirmwareIdentity, EspAppDesc } from '../../lang/src/compiler/board-toolchain/tools/firmware-id';
import { ElfReader } from '../../lang/src/compiler/board-toolchain/tools/elf-reader';
import { ToolchainClient } from './toolchain-client';
import type { ToolName } from './toolchain-worker';

export const BUNDLE_DIR = '/bundle';
export const PROJECT_DIR = '/project';
export const PROJECT_NAME = 'app';

export type BundleInfo = {
  baseUrl: string;
  target: string;
  firmware?: EspAppDesc;
  components: string[];
  files: string[];
  flash: { address: number, name: string, data: Uint8Array }[];
};

// Fetch the runtime bundle into the memory filesystem. Component headers are
// not fetched: the worker mounts them lazily by URL when a tool opens them.
export async function loadBundle(baseUrl: string, fs: MemoryFileSystem): Promise<BundleInfo> {
  const bin = async (p: string) => { const r = await fetch(baseUrl + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
  const put = async (p: string) => { fs.writeFile(`${BUNDLE_DIR}/${p}`, Buffer.from(await bin(p))); };
  await put('bundle.json');
  const manifest = JSON.parse(fs.readTextFile(`${BUNDLE_DIR}/bundle.json`));
  const files: string[] = await fetch(baseUrl + 'files.json').then(r => r.ok ? r.json() : []).catch(() => []);
  const eager = ['bluescript.elf', 'std-module.bs', ...files.filter(f => f.startsWith('include/') || f.startsWith('rom-ld/')),
                 ...Object.values(manifest.components ?? {}).map((c: any) => c.archive as string)];
  await Promise.all(eager.map(put));
  const flash: BundleInfo['flash'] = [];
  const flashArgs = new TextDecoder().decode(await bin('flash/flash_args'));
  for (const line of flashArgs.split('\n')) {
    const m = line.trim().match(/^(0x[0-9a-fA-F]+)\s+(\S+)$/);
    if (m) flash.push({ address: parseInt(m[1], 16), name: m[2], data: await bin(`flash/${m[2]}`) });
  }
  return { baseUrl, target: manifest.target, firmware: manifest.firmware, components: Object.keys(manifest.components ?? {}), files, flash };
}

// ToolRunner that ships the memory filesystem to the worker and merges the outputs back.
export class BrowserToolRunner implements ToolRunner {
  private registered = false;

  constructor(private fs: MemoryFileSystem, private tools: ToolchainClient, private bundle: BundleInfo, private resourceDir: string) {}

  // The bundle and the compiler headers never change: register them with the worker once.
  private async registerStaticFiles() {
    if (this.registered) return;
    const files: { [p: string]: Uint8Array } = {};
    for (const prefix of [BUNDLE_DIR, this.resourceDir]) {
      for (const [p, data] of this.fs.entries(prefix)) files[p] = new Uint8Array(data);
    }
    await this.tools.registerFiles(files);
    this.registered = true;
  }

  async run(tool: string, args: string[], cwd: string): Promise<void> {
    const name = tool as ToolName;   // clang | lld | llvm-ar (always the wasm modules here)
    await this.registerStaticFiles();
    const files: { [p: string]: Uint8Array } = {};
    for (const [p, data] of this.fs.entries(PROJECT_DIR)) files[p] = new Uint8Array(data);   // copies: transferred to the worker
    // Component headers etc. that are not in memory: mount lazily by URL.
    const lazy: { [p: string]: string } = {};
    for (const f of this.bundle.files) {
      const p = `${BUNDLE_DIR}/${f}`;
      if (!this.fs.exists(p)) lazy[p] = new URL(this.bundle.baseUrl + f, location.href).href;
    }
    const res = await this.tools.run(name, args, files, [`${PROJECT_DIR}/dist`], lazy, cwd, this.fs.directories());
    for (const [p, data] of Object.entries(res.outputs)) this.fs.writeFile(p, Buffer.from(data));
    if (res.code !== 0) {
      throw new Error(`${tool} failed (exit ${res.code}):\n${res.stderr}${res.error ?? ''}`);
    }
  }
}

export type CompileTimings = { compileMs: number };

export class BrowserCompiler {
  readonly fs = new MemoryFileSystem();
  private session?: CompilerSession<PackageForEsp32, MemoryImage>;
  private layout?: MemoryLayout;
  private bundle?: BundleInfo;
  private runner?: BrowserToolRunner;
  private toolchainHeaders: { [name: string]: string } = {};

  constructor(private tools: ToolchainClient) {}

  async load(bundleUrl: string, toolchainUrl: string) {
    this.bundle = await loadBundle(bundleUrl, this.fs);
    const list: string[] = await fetch(`${toolchainUrl}include/files.json`).then(r => r.json());
    await Promise.all(list.map(async h => {
      const r = await fetch(`${toolchainUrl}include/${h}`);
      if (r.ok) this.fs.writeFile(`/res/include/${h}`, Buffer.from(new Uint8Array(await r.arrayBuffer())));
    }));
    this.runner = new BrowserToolRunner(this.fs, this.tools, this.bundle, '/res');
    // An empty project skeleton.
    this.fs.mkdir(`${PROJECT_DIR}/src`);
  }

  get target() { return this.bundle!.target; }
  get firmwareDesc() { return this.bundle?.firmware; }
  get flashFiles() { return this.bundle!.flash; }
  get componentNames() { return this.bundle!.components; }

  // Source files of the project (relative to src/).
  listSources(): string[] {
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of this.fs.readdir(dir)) {
        if (e.isDirectory) walk(`${dir}/${e.name}`, `${rel}${e.name}/`);
        else out.push(`${rel}${e.name}`);
      }
    };
    if (this.fs.exists(`${PROJECT_DIR}/src`)) walk(`${PROJECT_DIR}/src`, '');
    return out.sort();
  }
  readSource(name: string) { return this.fs.readTextFile(`${PROJECT_DIR}/src/${name}`); }
  writeSource(name: string, text: string) { this.fs.writeFile(`${PROJECT_DIR}/src/${name}`, text); }
  removeSource(name: string) { this.fs.rm(`${PROJECT_DIR}/src/${name}`); }

  // Verify that the board runs the bundled firmware (throws on mismatch unless ignored).
  checkFirmware(layout: MemoryLayout, ignore = false): string | undefined {
    const elf = ElfReader.fromBuffer(this.fs.readFile(`${BUNDLE_DIR}/bluescript.elf`), 'bluescript.elf');
    const symbols = new Map(elf.readAllSymbols().map(s => [s.name, s]));
    const r = checkFirmwareIdentity(layout, this.bundle!.firmware, symbols);
    if (!r.ok && !ignore) throw new Error(r.message);
    return r.ok ? r.message : `WARNING (ignored): ${r.message}`;
  }

  // Start a session for a freshly reset board.
  reset(layout: MemoryLayout) {
    this.layout = layout;
    this.session = undefined;
  }

  private newProject(): Project<PackageForEsp32> {
    return Project.load<PackageForEsp32>(PROJECT_NAME, (name) => {
      if (name !== PROJECT_NAME) throw new Error(`Package ${name} is not available in the browser (packages cannot be installed yet).`);
      return new PackageForEsp32(name, {
        rootDir: PROJECT_DIR, entry: 'src/index.bs', sourceDir: 'src', distDir: 'dist', buildDir: 'dist/build', packageDir: 'packages',
      }, [], this.componentNames, this.fs);
    });
  }

  private newSession(): CompilerSession<PackageForEsp32, MemoryImage> {
    if (!this.layout) throw new Error('Not connected: memory layout unknown.');
    const toolchain = new Esp32ClangToolchain({
      bundleDir: BUNDLE_DIR, target: this.bundle!.target as any,
      toolchain: { clang: 'clang', ar: 'llvm-ar', ld: 'lld' }, runner: 'wasm', resourceDir: '/res',
    }, this.layout, { fs: this.fs, runner: this.runner! });
    return new CompilerSession(toolchain, this.fs);
  }

  // Build and load the whole project (src/index.bs and its imports).
  async buildProject(): Promise<MemoryImage> {
    if (!this.fs.exists(`${PROJECT_DIR}/src/index.bs`)) throw new Error('The project needs a src/index.bs.');
    this.session = this.newSession();
    return this.session.buildProject(this.newProject());
  }

  // Compile a REPL fragment against the current session (builds an empty project first if needed).
  async compileFragment(src: string): Promise<MemoryImage> {
    if (!this.session) {
      if (!this.fs.exists(`${PROJECT_DIR}/src/index.bs`)) this.writeSource('index.bs', '');
      await this.buildProject();
    }
    return this.session!.compileFragment(src);
  }
}
