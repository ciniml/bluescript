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

Open `http://localhost:8000/?selftest` to compile two fragments without a board
(uses a dummy memory layout; results are printed in the output pane).

## How it maps to the CLI

| CLI | Browser |
| :--- | :--- |
| `TranspilerSession` (files on disk) | `BrowserCompiler` (strings in memory), `transpile()` from `lang` |
| `Esp32ClangToolchain` + `run-wasm-tool.js` (NODEFS) | `toolchain-worker.ts` (MEMFS, one module instance per invocation) |
| `ElfReader(path)` | `ElfReader.fromBuffer()` |
| noble / node-ble transport | `WebBluetoothDevice` (`navigator.bluetooth`) |
| `idf.py flash` / `esptool.py` | `flashRuntime()` with esptool-js |

Limitations of the proof of concept: single-file fragments only (no `import`), no
packages, no profiler-driven recompilation.
