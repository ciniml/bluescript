// Bundles the browser app with esbuild and copies the static assets
// (WebAssembly toolchain and runtime bundle) into dist/.
//
//   WASM_TOOLCHAIN_DIR  directory with bin/{clang,lld,llvm-ar}.{js,wasm} and lib/clang/<ver>/include
//   RUNTIME_BUNDLE_DIRS colon-separated runtime bundles created by `bscript board build-runtime <board>`
//                       (default: every bundle-* directory under microcontroller/ports/esp32)
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const serve = process.argv.includes('--serve');

const toolchainDir = process.env.WASM_TOOLCHAIN_DIR ?? path.join(root, '../wasm-toolchain');
const portDir = path.join(root, '../microcontroller/ports/esp32');
function bundleDirs() {
  if (process.env.RUNTIME_BUNDLE_DIRS) return process.env.RUNTIME_BUNDLE_DIRS.split(':').filter(Boolean);
  if (process.env.RUNTIME_BUNDLE_DIR) return [process.env.RUNTIME_BUNDLE_DIR];
  if (!fs.existsSync(portDir)) return [];
  return fs.readdirSync(portDir).filter(d => d.startsWith('bundle-') && fs.existsSync(path.join(portDir, d, 'bundle.json'))).map(d => path.join(portDir, d));
}

function copyAssets() {
  fs.mkdirSync(dist, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'public'))) {
    fs.copyFileSync(path.join(root, 'public', f), path.join(dist, f));
  }
  // Toolchain: the wasm modules and the two headers freestanding code needs.
  const tcOut = path.join(dist, 'toolchain');
  fs.mkdirSync(path.join(tcOut, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(tcOut, 'include'), { recursive: true });
  for (const f of ['clang.js', 'clang.wasm', 'lld.js', 'lld.wasm', 'llvm-ar.js', 'llvm-ar.wasm']) {
    fs.copyFileSync(path.join(toolchainDir, 'bin', f), path.join(tcOut, 'bin', f));
  }
  // clang's own headers (freestanding C subset: std*.h and their helpers).
  const resDir = fs.readdirSync(path.join(toolchainDir, 'lib/clang')).map(v => path.join(toolchainDir, 'lib/clang', v, 'include'))[0];
  const headerPattern = /^(std[a-z]*\.h|__std[a-z_]*\.h|limits\.h|float\.h|inttypes\.h|iso646\.h|varargs\.h|tgmath\.h|unwind\.h)$/;
  const headers = fs.readdirSync(resDir).filter(f => headerPattern.test(f));
  for (const h of headers) fs.copyFileSync(path.join(resDir, h), path.join(tcOut, 'include', h));
  fs.writeFileSync(path.join(tcOut, 'include', 'files.json'), JSON.stringify(headers));
  // Runtime bundles, one per board, listed in bundles/index.json.
  const bOut = path.join(dist, 'bundles');
  fs.rmSync(bOut, { recursive: true, force: true });
  const index = [];
  for (const dir of bundleDirs()) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf-8'));
    const board = manifest.board ?? manifest.target;
    fs.cpSync(dir, path.join(bOut, board), { recursive: true });
    index.push({ board, target: manifest.target, version: manifest.firmware?.version ?? '', buildTime: manifest.firmware?.buildTime ?? '' });
  }
  fs.mkdirSync(bOut, { recursive: true });
  fs.writeFileSync(path.join(bOut, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`[assets] bundles: ${index.map(b => b.board).join(', ') || 'none'}`);
}

const common = {
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
  // Node-only modules referenced by the shared TypeScript sources.
  alias: { 'node:buffer': 'buffer', 'fs': path.join(root, 'src/shims/fs.ts'), 'path': path.join(root, 'src/shims/path.ts'), 'child_process': path.join(root, 'src/shims/child_process.ts') },
  inject: [path.join(root, 'src/shims/buffer.ts'), path.join(root, 'src/shims/process.ts')],
};

copyAssets();
const ctxMain = await esbuild.context({ ...common, entryPoints: [path.join(root, 'src/main.ts')], outfile: path.join(dist, 'main.js') });
const ctxWorker = await esbuild.context({ ...common, entryPoints: [path.join(root, 'src/toolchain-worker.ts')], outfile: path.join(dist, 'toolchain-worker.js') });
// The notebook UI (React, from notebook/src) with the in-browser backend.
const ctxNotebook = await esbuild.context({
  ...common, jsx: 'automatic', loader: { '.module.css': 'local-css', '.css': 'css' },
  entryPoints: [path.join(root, 'src/notebook-main.tsx')], outfile: path.join(dist, 'notebook-main.js'),
});
await ctxMain.rebuild();
await ctxWorker.rebuild();
await ctxNotebook.rebuild();
if (serve) {
  // The runtime bundle is not part of the esbuild graph: re-copy it when it changes
  // (e.g. after `bscript board build-runtime`).
  // Watch the parent directory (non-recursively): the bundle directory itself is
  // deleted and recreated by build-runtime, which breaks a recursive watcher.
  // Debounce so that the copy happens once the regeneration has settled.
  let timer;
  if (fs.existsSync(portDir)) fs.watch(portDir, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { copyAssets(); console.log('[assets] runtime bundles updated'); } catch (e) { console.error('[assets] update failed:', e.message); }
    }, 3000);
  });
  await ctxMain.watch();
  await ctxWorker.watch();
  await ctxNotebook.watch();
  // HOST/PORT select the bind address; KEYFILE/CERTFILE enable HTTPS (Web Bluetooth /
  // Web Serial require a secure context: localhost or HTTPS).
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8000);
  const tls = process.env.KEYFILE && process.env.CERTFILE ? { keyfile: process.env.KEYFILE, certfile: process.env.CERTFILE } : {};
  await ctxMain.serve({ servedir: dist, host, port, ...tls });
  console.log(`Serving ${tls.keyfile ? 'https' : 'http'}://${host}:${port}/  (Web Bluetooth / Web Serial need Chrome or Edge)`);
} else {
  await ctxMain.dispose();
  await ctxWorker.dispose();
  await ctxNotebook.dispose();
}
