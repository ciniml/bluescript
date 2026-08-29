// BlueScript → C → Xtensa object → linked memory image, entirely in the browser.
// Mirrors lang's TranspilerSession + Esp32ClangToolchain for a REPL session
// (one fragment at a time), with files kept in memory.
import { Buffer } from 'buffer';
import { transpile } from '../../lang/src/transpiler/code-generator/code-generator';
import { GlobalVariableNameTable } from '../../lang/src/transpiler/code-generator/variables';
import { ShadowMemory, MemoryImage, MemoryLayout } from '../../lang/src/compiler/board-toolchain/board-toolchain';
import { ElfReader } from '../../lang/src/compiler/board-toolchain/tools/elf-reader';
import generateLinkerScript from '../../lang/src/compiler/board-toolchain/tools/linker-script';
import { ToolchainClient } from './toolchain-client';

export type RuntimeBundle = {
  target: string;
  elf: Uint8Array;
  stdModule: string;
  headers: { [name: string]: string };   // c-runtime.h and friends
  romLd: { [name: string]: string };     // in include order
  ldOrder: string[];
  flash: { address: number, name: string, data: Uint8Array }[];
};

export async function loadRuntimeBundle(baseUrl: string): Promise<RuntimeBundle> {
  const text = async (p: string) => { const r = await fetch(baseUrl + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };
  const bin = async (p: string) => { const r = await fetch(baseUrl + p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
  const manifest = JSON.parse(await text('bundle.json')) as { target: string, ldFiles: string[] };
  const romLd: { [n: string]: string } = {};
  for (const f of manifest.ldFiles) romLd[f] = await text(`rom-ld/${f}`);
  const headers: { [n: string]: string } = {};
  for (const h of ['c-runtime.h']) headers[h] = await text(`include/${h}`);
  const flashArgs = await text('flash/flash_args');
  const flash: RuntimeBundle['flash'] = [];
  for (const line of flashArgs.split('\n')) {
    const m = line.trim().match(/^(0x[0-9a-fA-F]+)\s+(\S+)$/);
    if (m) flash.push({ address: parseInt(m[1], 16), name: m[2], data: await bin(`flash/${m[2]}`) });
  }
  return { target: manifest.target, elf: await bin('bluescript.elf'), stdModule: await text('std-module.bs'), headers, romLd, ldOrder: manifest.ldFiles, flash };
}

const WORK = '/work';

export class BrowserCompiler {
  private globalNames: GlobalVariableNameTable;
  private sessionId = 0;
  private codeId = 0;
  private memory?: ShadowMemory;
  private definedSymbols = new Map<string, { name: string, address: number }>();
  private toolchainHeaders: { [name: string]: string } = {};

  // The built-in module was compiled into the firmware as session 0
  // (its global root set is `global_rootset0`); fragments start at 1.
  private static readonly BUILTIN_SESSION_ID = 0;

  constructor(private bundle: RuntimeBundle, private tools: ToolchainClient) {
    this.globalNames = transpile(BrowserCompiler.BUILTIN_SESSION_ID, bundle.stdModule).names;
    this.sessionId = BrowserCompiler.BUILTIN_SESSION_ID + 1;
    const elf = ElfReader.fromBuffer(Buffer.from(bundle.elf), 'bluescript.elf');
    for (const s of elf.readAllSymbols()) this.definedSymbols.set(s.name, s);
  }

  async loadToolchainHeaders(baseUrl: string) {
    for (const h of ['stdint.h', 'stdbool.h', 'stddef.h', 'stdarg.h']) {
      const r = await fetch(`${baseUrl}include/${h}`);
      if (r.ok) this.toolchainHeaders[h] = await r.text();
    }
  }

  // Called after the device reported its memory layout (RESET).
  reset(layout: MemoryLayout) {
    this.memory = new ShadowMemory(layout);
    // Symbols of previous fragments are gone from the device.
    this.definedSymbols.clear();
    const elf = ElfReader.fromBuffer(Buffer.from(this.bundle.elf), 'bluescript.elf');
    for (const s of elf.readAllSymbols()) this.definedSymbols.set(s.name, s);
    this.globalNames = transpile(BrowserCompiler.BUILTIN_SESSION_ID, this.bundle.stdModule).names;
    this.sessionId = BrowserCompiler.BUILTIN_SESSION_ID + 1;
    this.codeId = 0;
  }

  get cProlog() { return '\n#include <stdint.h>\n#include "c-runtime.h"\n'; }

  async compileFragment(src: string, log: (s: string) => void = () => {}): Promise<MemoryImage> {
    if (!this.memory) throw new Error('Not connected: memory layout unknown.');
    const id = this.codeId++;
    const result = transpile(this.sessionId++, src, this.globalNames, (name: string) => {
      throw new Error(`import is not supported in the browser REPL: ${name}`);
    });
    this.globalNames = result.names;
    const cSource = this.cProlog + result.code;
    const enc = new TextEncoder();

    // 1. clang
    const cPath = `${WORK}/src/bs_${id}.c`, oPath = `${WORK}/build/bs_${id}.o`;
    const files: { [p: string]: Uint8Array } = { [cPath]: enc.encode(cSource) };
    for (const [n, t] of Object.entries(this.bundle.headers)) files[`${WORK}/include/${n}`] = enc.encode(t);
    for (const [n, t] of Object.entries(this.toolchainHeaders)) files[`${WORK}/res/include/${n}`] = enc.encode(t);
    const t0 = performance.now();
    const cc = await this.tools.run('clang', [
      '-resource-dir', `${WORK}/res`, '--target=xtensa-esp-elf', `-mcpu=${this.bundle.target}`,
      '-ffreestanding', '-nostdlib', '-O2', '-w', '-fno-common',
      '-ffunction-sections', '-fdata-sections', '-mtext-section-literals', '-mlongcalls', '-fno-zero-initialized-in-bss',
      `-I${WORK}/include`, '-c', cPath, '-o', oPath,
    ], files, [oPath]);
    if (cc.code !== 0 || !cc.outputs[oPath]) throw new Error(`clang failed:\n${cc.stderr}${cc.error ?? ''}`);
    const t1 = performance.now();

    // 2. lld
    const ldPath = `${WORK}/build/link.ld`, elfPath = `${WORK}/build/out.elf`;
    const script = generateLinkerScript(
      [oPath], this.memory, Array.from(this.definedSymbols.values()), result.main, [],
      this.bundle.ldOrder.map(n => `${WORK}/rom-ld/${n}`),
    );
    const ldFiles: { [p: string]: Uint8Array } = { [oPath]: cc.outputs[oPath], [ldPath]: enc.encode(script) };
    for (const [n, t] of Object.entries(this.bundle.romLd)) ldFiles[`${WORK}/rom-ld/${n}`] = enc.encode(t);
    const ld = await this.tools.run('lld', ['-flavor', 'gnu', '-o', elfPath, '-T', ldPath, '--gc-sections'], ldFiles, [elfPath]);
    if (ld.code !== 0 || !ld.outputs[elfPath]) throw new Error(`lld failed:\n${ld.stderr}${ld.error ?? ''}`);
    const t2 = performance.now();
    log(`compiled in ${(t1 - t0).toFixed(0)} ms, linked in ${(t2 - t1).toFixed(0)} ms`);

    // 3. extract the memory image
    const elf = ElfReader.fromBuffer(Buffer.from(ld.outputs[elfPath]), 'out.elf');
    const sec = (name: string) => elf.readSectionByName(name);
    const sections = { iram: sec('.iram'), dram: sec('.dram'), iflash: sec('.iflash'), dflash: sec('.dflash') };
    this.memory.addUsage(sections.iram?.size, sections.dram?.size, sections.iflash?.size, sections.dflash?.size);
    for (const s of elf.readDefinedSymbols()) this.definedSymbols.set(s.name, s);
    const entry = this.definedSymbols.get(result.main);
    if (!entry) throw new Error(`entry point ${result.main} not found`);
    const conv = (s?: { address: number, value: Buffer }) => s ? { address: s.address, data: s.value } : undefined;
    return { iram: conv(sections.iram), dram: conv(sections.dram), iflash: conv(sections.iflash), dflash: conv(sections.dflash), entryPoints: [{ isMain: true, address: entry.address }] };
  }
}
