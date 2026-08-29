import * as path from 'path';
import * as fs from '../../core/fs';
import { GLOBAL_SETTINGS } from '../../config/constants';
import { execWithLog } from '../../core/command-exec';

// WebAssembly build of clang/lld/llvm-ar (see tools/wasm-toolchain in the repository).
export const WASM_TOOLCHAIN_VERSION = 'esp-21.1.3';
export const WASM_TOOLCHAIN_ARCHIVE = `bluescript-wasm-toolchain-${WASM_TOOLCHAIN_VERSION}.tar.xz`;
export const WASM_TOOLCHAIN_URL =
    `https://github.com/ciniml/bluescript/releases/download/wasm-toolchain-${WASM_TOOLCHAIN_VERSION}/${WASM_TOOLCHAIN_ARCHIVE}`;

type ToolchainManifest = { name: string, llvm: string, clangResourceDir: string };

export class WasmToolchainEnv {
    get rootDir() { return path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'wasm-toolchain'); }
    get binDir() { return path.join(this.rootDir, 'bin'); }
    get manifestFile() { return path.join(this.rootDir, 'toolchain.json'); }
    get version() { return WASM_TOOLCHAIN_VERSION; }
    get downloadUrl() { return WASM_TOOLCHAIN_URL; }
    get clangFile() { return path.join(this.binDir, 'clang.js'); }
    get arFile() { return path.join(this.binDir, 'llvm-ar.js'); }
    get ldFile() { return path.join(this.binDir, 'lld.js'); }

    isInstalled(): boolean {
        return fs.exists(this.manifestFile) && fs.exists(this.clangFile) && fs.exists(this.ldFile) && fs.exists(this.arFile);
    }

    readManifest(): ToolchainManifest {
        return JSON.parse(fs.readFile(this.manifestFile)) as ToolchainManifest;
    }

    get resourceDir() {
        return path.join(this.rootDir, this.readManifest().clangResourceDir);
    }

    // Install from a URL, a local .tar.xz, or a local directory.
    async install(source?: string) {
        if (fs.exists(this.rootDir)) {
            fs.removeDir(this.rootDir);
        }
        fs.makeDir(this.rootDir);
        const src = source ?? this.downloadUrl;
        if (/^https?:\/\//.test(src)) {
            const archive = path.join(this.rootDir, WASM_TOOLCHAIN_ARCHIVE);
            await fs.downloadFile(src, archive);
            await this.extract(archive);
            fs.removeFile(archive);
        } else if (fs.exists(src) && src.endsWith('.tar.xz')) {
            await this.extract(path.resolve(src));
        } else if (fs.exists(src)) {
            fs.removeDir(this.rootDir);
            fs.copyDir(path.resolve(src), this.rootDir);
        } else {
            throw new Error(`WebAssembly toolchain not found: ${src}`);
        }
        if (!this.isInstalled()) {
            throw new Error(`The WebAssembly toolchain at ${src} is incomplete (bin/clang.js, bin/lld.js, bin/llvm-ar.js and toolchain.json are required).`);
        }
    }

    private async extract(archive: string) {
        await execWithLog('tar', ['-xJf', archive, '-C', this.rootDir]);
    }

    remove() {
        if (fs.exists(this.rootDir)) {
            fs.removeDir(this.rootDir);
        }
    }
}
