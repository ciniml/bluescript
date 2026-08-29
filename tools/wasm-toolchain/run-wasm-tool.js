#!/usr/bin/env node
// Wrapper that runs a WebAssembly build of an LLVM tool (clang, lld, llvm-ar) with the host filesystem
// mounted at /host. Absolute paths in arguments are rewritten accordingly.
const path = require('path');
const createClang = require(path.resolve(process.env.WASM_TOOL_JS || path.join(__dirname, 'dist/bin/clang.js')));

(async () => {
  const m = await createClang({
    noInitialRun: true,
    print: (s) => process.stdout.write(s + '\n'),
    printErr: (s) => process.stderr.write(s + '\n'),
  });
  m.FS.mkdir('/host');
  m.FS.mount(m.NODEFS, { root: '/' }, '/host');
  m.FS.chdir('/host' + process.cwd());
  const args = process.argv.slice(2).map((a) => a.replace(/(^|=)(\/)/, '$1/host/'));
  const code = m.callMain(args);
  process.exit(code);
})().catch((e) => { console.error(e); process.exit(1); });
