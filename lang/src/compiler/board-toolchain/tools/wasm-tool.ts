// Support for LLVM tools (clang, lld, llvm-ar) built as WebAssembly modules
// with Emscripten (see tools/wasm-toolchain in the repository). The modules are
// MODULARIZE'd; `runWasmToolMain` loads one, mounts the host filesystem at
// WASM_HOST_ROOT and runs its main() with the given arguments.
import * as path from "path";

// Mount point of the host filesystem inside the WebAssembly module.
export const WASM_HOST_ROOT = '/host';

// Rewrite an absolute host path so that it is visible inside the module.
export function toWasmPath(p: string): string {
    return path.isAbsolute(p) ? WASM_HOST_ROOT + p.replace(/\\/g, '/') : p;
}

// Rewrite the absolute paths in a command line argument. Handles bare paths
// (`/a/b`), glued single-letter flags (`-I/a/b`, `-T/a/b`) and `key=/a/b`.
export function rewriteWasmArg(arg: string): string {
    if (arg.startsWith('/')) {
        return WASM_HOST_ROOT + arg;
    }
    const glued = arg.match(/^(-[A-Za-z])(\/.*)$/);
    if (glued) {
        return glued[1] + WASM_HOST_ROOT + glued[2];
    }
    const keyValue = arg.match(/^([^=]+=)(\/.*)$/);
    if (keyValue) {
        return keyValue[1] + WASM_HOST_ROOT + keyValue[2];
    }
    return arg;
}

// Path of the runner script, used by toolchains to spawn `node <runner> <tool.js> args...`.
export function wasmToolRunnerScript(): string {
    return path.join(__dirname, 'run-wasm-tool.js');
}

export async function runWasmToolMain(toolJs: string, args: string[]): Promise<number> {
    const createModule = require(path.resolve(toolJs));
    const m = await createModule({
        noInitialRun: true,
        // argv[0]: llvm-ar (and lld) derive their behaviour from the program name.
        thisProgram: path.basename(toolJs, '.js'),
        print: (s: string) => process.stdout.write(s + '\n'),
        printErr: (s: string) => process.stderr.write(s + '\n'),
    });
    m.FS.mkdir(WASM_HOST_ROOT);
    m.FS.mount(m.NODEFS, { root: '/' }, WASM_HOST_ROOT);
    m.FS.chdir(toWasmPath(process.cwd()));
    return m.callMain(args.map(rewriteWasmArg));
}
