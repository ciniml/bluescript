// Web Worker that runs the WebAssembly builds of clang, lld and llvm-ar.
// Each request creates a fresh module instance (the tools are not re-entrant)
// from a cached compiled WebAssembly.Module, populates MEMFS with the input
// files, runs main() and returns the requested output files.

export type ToolName = 'clang' | 'lld' | 'llvm-ar';

export type ToolRequest = {
  id: number;
  tool: ToolName;
  args: string[];
  files: { [path: string]: Uint8Array };
  outputs: string[];
};

export type ToolResponse = {
  id: number;
  code: number;
  stdout: string;
  stderr: string;
  outputs: { [path: string]: Uint8Array };
  error?: string;
};

declare function importScripts(...urls: string[]): void;

const factories = new Map<ToolName, (opts: object) => Promise<any>>();
const modules = new Map<ToolName, Promise<WebAssembly.Module>>();
const base = new URL('./toolchain/bin/', self.location.href).href;

function factoryOf(tool: ToolName) {
  let f = factories.get(tool);
  if (!f) {
    importScripts(`${base}${tool}.js`);
    f = (self as any).createTool;
    delete (self as any).createTool;
    factories.set(tool, f!);
  }
  return f!;
}

function moduleOf(tool: ToolName) {
  let m = modules.get(tool);
  if (!m) {
    m = WebAssembly.compileStreaming(fetch(`${base}${tool}.wasm`));
    modules.set(tool, m);
  }
  return m;
}

function mkdirTree(FS: any, dir: string) {
  const parts = dir.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    try { FS.mkdir(cur); } catch { /* exists */ }
  }
}

async function run(req: ToolRequest): Promise<ToolResponse> {
  const wasmModule = await moduleOf(req.tool);
  let stdout = '', stderr = '';
  const m = await factoryOf(req.tool)({
    noInitialRun: true,
    thisProgram: req.tool,
    print: (s: string) => { stdout += s + '\n'; },
    printErr: (s: string) => { stderr += s + '\n'; },
    instantiateWasm: (imports: WebAssembly.Imports, cb: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) => {
      WebAssembly.instantiate(wasmModule, imports).then(inst => cb(inst, wasmModule));
      return {};
    },
  });
  for (const [p, data] of Object.entries(req.files)) {
    mkdirTree(m.FS, p.slice(0, p.lastIndexOf('/')));
    m.FS.writeFile(p, data);
  }
  for (const p of req.outputs) mkdirTree(m.FS, p.slice(0, p.lastIndexOf('/')));
  let code: number;
  try {
    code = m.callMain(req.args);
  } catch (e: any) {
    code = typeof e?.status === 'number' ? e.status : 1;
    if (typeof e?.status !== 'number') stderr += String(e) + '\n';
  }
  const outputs: { [path: string]: Uint8Array } = {};
  for (const p of req.outputs) {
    try { outputs[p] = m.FS.readFile(p); } catch { /* not produced */ }
  }
  return { id: req.id, code, stdout, stderr, outputs };
}

self.onmessage = async (ev: MessageEvent<ToolRequest | { id: number, warmup: ToolName[] }>) => {
  const msg = ev.data;
  if ('warmup' in msg) {
    await Promise.all(msg.warmup.map(t => moduleOf(t)));
    msg.warmup.forEach(t => factoryOf(t));
    (self as any).postMessage({ id: msg.id, code: 0, stdout: '', stderr: '', outputs: {} });
    return;
  }
  try {
    const res = await run(msg);
    (self as any).postMessage(res, Object.values(res.outputs).map(u => u.buffer));
  } catch (e: any) {
    (self as any).postMessage({ id: msg.id, code: 1, stdout: '', stderr: '', outputs: {}, error: String(e?.stack ?? e) });
  }
};
