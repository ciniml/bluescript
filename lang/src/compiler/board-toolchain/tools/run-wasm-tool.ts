#!/usr/bin/env node
// Usage: node run-wasm-tool.js <tool.js> [args...]
import { runWasmToolMain } from './wasm-tool';

const [toolJs, ...args] = process.argv.slice(2);
if (!toolJs) {
    console.error('usage: run-wasm-tool <tool.js> [args...]');
    process.exit(2);
}
runWasmToolMain(toolJs, args)
    .then(code => process.exit(code))
    .catch(e => { console.error(e); process.exit(1); });
