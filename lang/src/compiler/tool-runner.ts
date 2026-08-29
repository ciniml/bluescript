// Runs external tools (compiler, archiver, linker). The Node implementation
// spawns processes; a browser provides its own (e.g. WebAssembly builds).
import { executeCommand } from "./utils";
import { wasmToolRunnerScript, toWasmPath } from "./board-toolchain/tools/wasm-tool";

export type ToolRunOptions = {
    // `tool` is an Emscripten module (*.js) rather than a native executable.
    wasm?: boolean,
};

export interface ToolRunner {
    run(tool: string, args: string[], cwd: string, options?: ToolRunOptions): Promise<void>;
    // How a host path is spelled inside files the tool reads (e.g. linker scripts).
    pathInTool?(p: string, options?: ToolRunOptions): string;
}

// Spawns native tools directly and WebAssembly tools through run-wasm-tool.js.
export class NodeToolRunner implements ToolRunner {
    pathInTool(p: string, options: ToolRunOptions = {}) {
        return options.wasm ? toWasmPath(p) : p;
    }

    async run(tool: string, args: string[], cwd: string, options: ToolRunOptions = {}) {
        if (options.wasm) {
            await executeCommand(process.execPath, [wasmToolRunnerScript(), tool, ...args], cwd);
        } else {
            await executeCommand(tool, args, cwd);
        }
    }
}

export const nodeToolRunner: ToolRunner = new NodeToolRunner();
