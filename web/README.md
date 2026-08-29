# BlueScript in the browser

A proof of concept that runs the whole BlueScript development loop in a browser tab:

* **Compile** — the BlueScript transpiler (TypeScript) plus WebAssembly builds of
  Espressif's clang and lld run in a Web Worker. No ESP-IDF, no native compiler.
* **Load and run** — machine code is sent to the board over **Web Bluetooth**
  using the same protocol as the CLI; the firmware is unchanged.
* **Flash the runtime** — the prebuilt firmware from a runtime bundle is written
  over **Web Serial** with [esptool-js](https://github.com/espressif/esptool-js).

Chrome or Edge is required (Web Bluetooth / Web Serial). The page must be served
from `localhost` or HTTPS.

## Pages

* `index.html` — project editor (files, packages) plus a REPL box.
* `notebook.html` — the BlueScript notebook UI (`notebook/src`, React) with the
  in-browser backend: cells are compiled in the page and run over Web Bluetooth.
  The notebook's `ReplProvider` takes the backend through `setReplClientFactory`;
  `BrowserReplClient` implements the `WebSocketClient` interface it expects.

A build is published at https://ciniml.github.io/bluescript/ (project editor) and
https://ciniml.github.io/bluescript/notebook.html (notebook). Prebuilt toolchains and
the ESP32-S3 runtime bundle are on the
[wasm-toolchain-esp-21.1.3 release](https://github.com/ciniml/bluescript/releases/tag/wasm-toolchain-esp-21.1.3).

## Build

```bash
npm install
WASM_TOOLCHAIN_DIR=<browser build of the wasm toolchain> \
RUNTIME_BUNDLE_DIR=../microcontroller/ports/esp32/bundle-esp32s3 \
npm run serve          # http://localhost:8000/
```

* `WASM_TOOLCHAIN_DIR` must contain `bin/{clang,lld,llvm-ar}.{js,wasm}` linked with
  `-sENVIRONMENT=web,worker -sMODULARIZE=1 -sEXPORT_NAME=createTool` (see
  `tools/wasm-toolchain/build.sh`; the Node build uses NODEFS and does not run in a browser)
  and `lib/clang/<ver>/include`.
* `RUNTIME_BUNDLE_DIR` is a bundle produced by `bscript board build-runtime <board>`.

`npm run build` writes a static site to `dist/` (about 82 MB, of which 70 MB are the
wasm modules; they are cached by the browser after the first load).

Open `http://localhost:8000/?selftest` to build the default project and a few REPL
fragments without a board (uses a dummy memory layout; results are printed in the
output pane).

## Projects

The page holds a small project (`src/index.bs` plus any files you add) in
`localStorage`. `index.bs` is the entry; other files are reached with `import`, e.g.
`import { fib } from "./fib";`. "Build & run project" compiles all of it with lang's
`CompilerSession`; the REPL box then compiles fragments against that session, so the
project's variables and functions are available there. Packages
(`bsconfig.json` dependencies) cannot be installed in the browser yet.

## How it maps to the CLI

| CLI | Browser |
| :--- | :--- |
| `NodeFileSystem` (files on disk) | `MemoryFileSystem` (lang) |
| `NodeToolRunner` (processes; wasm via `run-wasm-tool.js`) | `BrowserToolRunner` → `toolchain-worker.ts` (MEMFS, one module instance per invocation; bundle files registered once) |
| `CompilerSession` + `Esp32ClangToolchain` | the same classes, with the two dependencies above |
| `ElfReader(path)` | `ElfReader.fromBuffer()` |
| noble / node-ble transport | `WebBluetoothDevice` (`navigator.bluetooth`) |
| `idf.py flash` / `esptool.py` | `flashRuntime()` with esptool-js |

ESP-IDF components packaged in the bundle (`bscript board build-runtime <board> --components ...`)
are available to inline C: their headers are mounted lazily into the toolchain's
filesystem (fetched on demand with synchronous XHR in the worker) and their archives are
fetched once at start-up and linked with every fragment.

Limitations: no packages (`bsconfig.json` dependencies) and no profiler-driven
recompilation yet.
