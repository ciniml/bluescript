import * as os from 'os';
import * as path from 'path';
import * as fs from '../../core/fs';
import { GLOBAL_SETTINGS } from '../../config/constants';
import { execWithLog } from '../../core/command-exec';
import { Esp32FamilyBoardName } from '../../config/board-utils';

// Espressif LLVM release used by `bscript board setup-lite`.
// https://github.com/espressif/llvm-project/releases
export const ESP_CLANG_RELEASE = 'esp-21.1.3_20260408';
export const ESP_CLANG_RELEASE_URL = 'https://github.com/espressif/llvm-project/releases/download';

export function espClangArchiveName(platform: NodeJS.Platform = os.platform(), arch: string = os.arch()): string {
    const triple = (() => {
        if (platform === 'linux' && arch === 'x64') return 'x86_64-linux-gnu';
        if (platform === 'linux' && arch === 'arm64') return 'aarch64-linux-gnu';
        if (platform === 'linux' && arch === 'arm') return 'arm-linux-gnueabihf';
        if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
        if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
        if (platform === 'win32' && arch === 'x64') return 'x86_64-w64-mingw32';
        throw new Error(`No prebuilt Espressif clang is available for ${platform}/${arch}.`);
    })();
    return `clang-${ESP_CLANG_RELEASE}-${triple}.tar.xz`;
}

// Manages the Espressif clang installation shared by all boards set up with setup-lite,
// and the runtime bundles installed per board.
export class ClangEnv {
    get clangRootDir() { return path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'clang'); }
    // The tarball extracts into an `esp-clang` directory.
    get clangDir() { return path.join(this.clangRootDir, 'esp-clang'); }
    get clangBinDir() { return path.join(this.clangDir, 'bin'); }
    get bundlesRootDir() { return path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'bundles'); }
    get clangVersion() { return ESP_CLANG_RELEASE; }
    get archiveName() { return espClangArchiveName(); }
    get downloadUrl() { return `${ESP_CLANG_RELEASE_URL}/${ESP_CLANG_RELEASE}/${this.archiveName}`; }

    bundleDir(board: Esp32FamilyBoardName) { return path.join(this.bundlesRootDir, board); }

    private exe(name: string) { return os.platform() === 'win32' ? `${name}.exe` : name; }
    get clangFile() { return path.join(this.clangBinDir, this.exe('clang')); }
    get arFile() { return path.join(this.clangBinDir, this.exe('llvm-ar')); }

    // GNU ld for xtensa is bundled with esp-clang. Its name differs between releases.
    ldFile(board: Esp32FamilyBoardName): string {
        const candidates = ['xtensa-esp-elf-ld', `xtensa-${board}-elf-ld`, 'ld.lld'].map(n => path.join(this.clangBinDir, this.exe(n)));
        const found = candidates.find(c => fs.exists(c));
        if (!found) {
            throw new Error(`Cannot find a linker for ${board} in ${this.clangBinDir}.`);
        }
        return found;
    }

    isClangInstalled(): boolean {
        return fs.exists(this.clangFile);
    }

    async downloadClang() {
        fs.makeDir(this.clangRootDir);
        const archivePath = path.join(this.clangRootDir, this.archiveName);
        await fs.downloadFile(this.downloadUrl, archivePath);
        try {
            // tar with xz support is available on Linux, macOS and Windows 10+.
            await execWithLog('tar', ['-xJf', archivePath, '-C', this.clangRootDir]);
        } finally {
            fs.removeFile(archivePath);
        }
        if (!this.isClangInstalled()) {
            throw new Error(`clang was not found at ${this.clangFile} after extracting ${this.archiveName}.`);
        }
    }

    removeClang() {
        if (fs.exists(this.clangRootDir)) {
            fs.removeDir(this.clangRootDir);
        }
    }

    installBundle(board: Esp32FamilyBoardName, sourceDir: string) {
        const dest = this.bundleDir(board);
        if (fs.exists(dest)) {
            fs.removeDir(dest);
        }
        fs.makeDir(this.bundlesRootDir);
        fs.copyDir(sourceDir, dest);
        return dest;
    }

    removeBundle(board: Esp32FamilyBoardName) {
        const dir = this.bundleDir(board);
        if (fs.exists(dir)) {
            fs.removeDir(dir);
        }
    }
}
