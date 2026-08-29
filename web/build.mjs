// Bundles the browser app with esbuild and copies the static assets
// (WebAssembly toolchain and runtime bundle) into dist/.
//
//   WASM_TOOLCHAIN_DIR  directory with bin/{clang,lld,llvm-ar}.{js,wasm} and lib/clang/<ver>/include
//   RUNTIME_BUNDLE_DIR  runtime bundle created by `bscript board build-runtime <board>`
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const serve = process.argv.includes('--serve');

const toolchainDir = process.env.WASM_TOOLCHAIN_DIR ?? path.join(root, '../wasm-toolchain');
const bundleDir = process.env.RUNTIME_BUNDLE_DIR ?? path.join(root, '../microcontroller/ports/esp32/bundle-esp32s3');

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
  // Runtime bundle.
  const bOut = path.join(dist, 'bundle');
  fs.rmSync(bOut, { recursive: true, force: true });
  fs.cpSync(bundleDir, bOut, { recursive: true });
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
await ctxMain.rebuild();
await ctxWorker.rebuild();
if (serve) {
  // The runtime bundle is not part of the esbuild graph: re-copy it when it changes
  // (e.g. after `bscript board build-runtime`).
  // Watch the parent directory (non-recursively): the bundle directory itself is
  // deleted and recreated by build-runtime, which breaks a recursive watcher.
  // Debounce so that the copy happens once the regeneration has settled.
  let timer;
  fs.watch(path.dirname(bundleDir), () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        if (fs.existsSync(path.join(bundleDir, 'bundle.json'))) { copyAssets(); console.log('[assets] runtime bundle updated'); }
      } catch (e) { console.error('[assets] update failed:', e.message); }
    }, 3000);
  });
  await ctxMain.watch();
  await ctxWorker.watch();
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
}
