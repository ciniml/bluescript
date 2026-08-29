import { rewriteWasmArg, toWasmPath, WASM_HOST_ROOT } from '../../../src/compiler/board-toolchain/tools/wasm-tool';

describe('wasm tool path mapping', () => {
  test('absolute paths are prefixed with the host root', () => {
    expect(toWasmPath('/a/b.c')).toBe(`${WASM_HOST_ROOT}/a/b.c`);
    expect(toWasmPath('b.c')).toBe('b.c');
  });

  test('arguments with absolute paths are rewritten', () => {
    expect(rewriteWasmArg('/a/b.o')).toBe('/host/a/b.o');
    expect(rewriteWasmArg('-I/a/inc')).toBe('-I/host/a/inc');
    expect(rewriteWasmArg('-T/a/link.ld')).toBe('-T/host/a/link.ld');
    expect(rewriteWasmArg('--sysroot=/a/sys')).toBe('--sysroot=/host/a/sys');
  });

  test('other arguments are untouched', () => {
    expect(rewriteWasmArg('-O2')).toBe('-O2');
    expect(rewriteWasmArg('--target=xtensa-esp-elf')).toBe('--target=xtensa-esp-elf');
    expect(rewriteWasmArg('rel/path.c')).toBe('rel/path.c');
    expect(rewriteWasmArg('-flavor')).toBe('-flavor');
  });
});
