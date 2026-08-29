# WebAssembly build of the Xtensa toolchain (proof of concept)

`build.sh` compiles Espressif's clang (Xtensa backend only), `ld.lld` and `llvm-ar`
to WebAssembly with Emscripten. The resulting modules run inside Node.js, so a
BlueScript CLI that bundles them needs neither ESP-IDF nor a native clang.

Measured with `esp-21.1.3_20260408` (MinSizeRel):

| Module | Size | Time for a REPL-sized fragment |
| :--- | :--- | :--- |
| `clang.wasm` | 42.8 MB | 0.96 s (compile) |
| `lld.wasm` | 23.7 MB | 0.20 s (link with the BlueScript linker script) |
| `llvm-ar.wasm` | 3.3 MB | — |

The output is identical in layout to the native clang + lld build (`.iflash`/`.dram`/`.dflash`
sizes and entry-point symbols match).

## Running a tool

`run-wasm-tool.js` mounts the host filesystem at `/host` and rewrites absolute
paths in the arguments. Paths inside files (e.g. `INCLUDE` in linker scripts)
must carry the `/host` prefix themselves.

```bash
WASM_TOOL_JS=build-wasm/bin/clang.js node run-wasm-tool.js \
  --target=xtensa-esp-elf -mcpu=esp32s3 -resource-dir build-wasm/lib/clang/21 \
  -ffreestanding -nostdlib -O2 -c foo.c -o foo.o
WASM_TOOL_JS=build-wasm/bin/lld.js node run-wasm-tool.js -flavor gnu -o out.elf -T link.ld --gc-sections
```

## Notes

* `-sNODERAWFS` cannot be used: `fstat` on stdio fails inside the Emscripten
  runtime, hence the NODEFS mount in the wrapper.
* The clang driver runs `cc1` in-process, so no `fork`/`exec` is needed.
* Threads are disabled; `lld` therefore links single-threaded.
* Integration into the CLI (a `toolchainType: 'wasm'` next to `esp-idf` and `clang`)
  is straightforward: `Esp32ClangToolchain` only needs the three command paths
  replaced by `node run-wasm-tool.js` invocations and the `/host` path mapping.
