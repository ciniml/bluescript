import os from 'os';
import * as path from 'path';
import * as fs from '../../../src/core/fs';
import { mockedExecShell, mockedExecWithLog, mockedSimpleExec, mockedInquirer, mockedLogger } from '../mock-helpers';
import {
    deleteGlobalEnv, getGlobalConfig, setupGlobalEnv, setupEmpyGlobalEnv, spyGlobalSettings,
    getTestRuntimeDir, DUMMY_VM_VERSION,
} from '../global-env-helper';
import { GLOBAL_SETTINGS } from '../../../src/config/constants';
import { ClangEnv, espClangArchiveName } from '../../../src/platforms/board-env/clang-env';
import { handleSetupLiteCommand } from '../../../src/commands/board/setup-lite';
import { handleFlashRuntimeCommand } from '../../../src/commands/board/flash-runtime';
import { handleBuildRuntimeCommand } from '../../../src/commands/board/build-runtime';
import { handleRemoveCommand } from '../../../src/commands/board/remove';
import { getCompilerAdapter } from '../../../src/platforms/compiler';
import { Esp32ClangCompilerAdapter } from '../../../src/platforms/compiler/esp32-clang-compiler-adapter';
import { Esp32CompilerAdapter } from '../../../src/platforms/compiler/esp32-compiler-adapter';
import { GlobalConfigHandler } from '../../../src/config/global-config';
import { ProjectConfigHandler } from '../../../src/config/project-config';

jest.mock('serialport', () => ({ SerialPort: { list: jest.fn(async () => []) } }));
jest.mock('os', () => ({ ...jest.requireActual('os'), platform: jest.fn(() => 'linux') }));
jest.mock('../../../src/platforms/runtime-bundle', () => ({
    createRuntimeBundle: jest.fn(() => '/mock/bundle-esp32s3'),
}));

const mockedDownloadFile = fs.downloadFile as jest.Mock;

function makeBundle(dir: string, target = 'esp32s3', vmVersion = DUMMY_VM_VERSION) {
    fs.makeDir(path.join(dir, 'include'));
    fs.makeDir(path.join(dir, 'flash'));
    fs.makeDir(path.join(dir, 'rom-ld'));
    fs.writeFile(path.join(dir, 'bundle.json'), JSON.stringify({ target, vmVersion, ldFiles: ['esp32s3.rom.ld'] }));
    fs.writeFile(path.join(dir, 'bluescript.elf'), '');
    fs.writeFile(path.join(dir, 'std-module.bs'), '');
    fs.writeFile(path.join(dir, 'include/c-runtime.h'), '');
    fs.writeFile(path.join(dir, 'flash/flash_args'), '0x0 bootloader.bin');
    fs.writeFile(path.join(dir, 'rom-ld/esp32s3.rom.ld'), '');
}

// Simulates the tar extraction by creating the clang binaries.
function fakeClangInstall(env: ClangEnv) {
    fs.makeDir(env.clangBinDir);
    for (const b of ['clang', 'llvm-ar', 'xtensa-esp-elf-ld']) {
        fs.writeFile(path.join(env.clangBinDir, b), '');
    }
}

function setupGlobalEnvWithClangEsp32s3() {
    const env = new ClangEnv();
    fakeClangInstall(env);
    makeBundle(env.bundleDir('esp32s3'));
    setupGlobalEnv({
        version: DUMMY_VM_VERSION,
        runtimeDir: getTestRuntimeDir(),
        boards: {
            esp32s3: {
                toolchainType: 'clang',
                clangVersion: env.clangVersion,
                rootDir: env.clangRootDir,
                bundleDir: env.bundleDir('esp32s3'),
                toolchain: { clang: env.clangFile, ar: env.arFile, ld: path.join(env.clangBinDir, 'xtensa-esp-elf-ld') },
            },
        },
    });
    fs.makeDir(getTestRuntimeDir());
    return env;
}

describe('clang toolchain (setup-lite)', () => {
    beforeAll(() => { spyGlobalSettings('clang'); });
    beforeEach(() => { deleteGlobalEnv(); jest.clearAllMocks(); });
    afterAll(() => { deleteGlobalEnv(); });

    it('maps platforms to Espressif clang archives', () => {
        expect(espClangArchiveName('linux', 'x64')).toMatch(/^clang-esp-.*-x86_64-linux-gnu\.tar\.xz$/);
        expect(espClangArchiveName('darwin', 'arm64')).toMatch(/aarch64-apple-darwin\.tar\.xz$/);
        expect(espClangArchiveName('win32', 'x64')).toMatch(/x86_64-w64-mingw32\.tar\.xz$/);
        expect(() => espClangArchiveName('freebsd', 'x64')).toThrow();
    });

    it('downloads clang, installs the bundle and writes the board config', async () => {
        setupEmpyGlobalEnv();
        const env = new ClangEnv();
        const source = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'source-bundle');
        makeBundle(source);
        mockedInquirer.prompt.mockResolvedValue({ proceed: true });
        mockedSimpleExec.mockResolvedValue('');   // `which tar`
        mockedDownloadFile.mockImplementation(async (_url, dest) => { fs.writeFile(dest, ''); });
        mockedExecWithLog.mockImplementation(async (cmd) => { if (cmd === 'tar') fakeClangInstall(env); return ''; });

        await handleSetupLiteCommand('esp32s3', { bundle: source });

        expect(mockedDownloadFile).toHaveBeenCalledWith(expect.stringContaining('llvm-project/releases/download'), expect.any(String));
        expect(mockedExecWithLog).toHaveBeenCalledWith('tar', expect.arrayContaining(['-xJf']));
        const config = getGlobalConfig();
        expect(config.boards.esp32s3.toolchainType).toBe('clang');
        expect(config.boards.esp32s3.bundleDir).toBe(env.bundleDir('esp32s3'));
        expect(config.boards.esp32s3.toolchain.ld).toBe(path.join(env.clangBinDir, 'xtensa-esp-elf-ld'));
        expect(fs.exists(path.join(env.bundleDir('esp32s3'), 'bluescript.elf'))).toBe(true);
        expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('skips the download when clang is already installed', async () => {
        setupEmpyGlobalEnv();
        const env = new ClangEnv();
        fakeClangInstall(env);
        const source = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'source-bundle');
        makeBundle(source);
        mockedInquirer.prompt.mockResolvedValue({ proceed: true });

        await handleSetupLiteCommand('esp32s3', { bundle: source });

        expect(mockedDownloadFile).not.toHaveBeenCalled();
        expect(getGlobalConfig().boards.esp32s3.toolchainType).toBe('clang');
    });

    it('rejects a bundle for another target', async () => {
        setupEmpyGlobalEnv();
        const source = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'source-bundle');
        makeBundle(source, 'esp32');
        mockedInquirer.prompt.mockResolvedValue({ proceed: true });
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        await handleSetupLiteCommand('esp32s3', { bundle: source });

        expect(mockedLogger.error).toHaveBeenCalledWith('Failed to set up esp32s3');
        expect(mockedDownloadFile).not.toHaveBeenCalled();
        exitSpy.mockRestore();
    });

    it('flashes the bundle with esptool instead of idf.py', async () => {
        setupGlobalEnvWithClangEsp32s3();
        mockedSimpleExec.mockImplementation(async (cmd, args) => {
            if (cmd === 'python3' && args[1] === 'esptool') return 'esptool.py v4';
            throw new Error('not found');
        });
        mockedExecShell.mockResolvedValue(undefined as never);

        await handleFlashRuntimeCommand('esp32s3', { port: '/dev/ttyACM0' });

        const cmds = mockedExecShell.mock.calls.map(c => c[0]);
        expect(cmds[0]).toContain('python3 -m esptool --chip esp32s3 -p /dev/ttyACM0 erase_flash');
        expect(cmds[1]).toContain('write_flash @flash_args');
        expect(cmds.join(' ')).not.toContain('idf.py');
        expect(mockedExecShell.mock.calls[1][1]).toEqual({ cwd: expect.stringContaining(path.join('bundles', 'esp32s3', 'flash')) });
        expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('cannot build the runtime without ESP-IDF', async () => {
        setupGlobalEnvWithClangEsp32s3();
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        await handleBuildRuntimeCommand('esp32s3', {});

        expect(mockedLogger.error).toHaveBeenCalledWith('Failed to build the runtime for esp32s3');
        expect(mockedExecShell).not.toHaveBeenCalled();
        exitSpy.mockRestore();
    });

    it('selects the clang compiler adapter for a clang-configured board', () => {
        setupGlobalEnvWithClangEsp32s3();
        const global = GlobalConfigHandler.load();
        const projectRoot = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'proj');
        fs.makeDir(projectRoot);
        const project = ProjectConfigHandler.createTemplate('proj', 'esp32s3', projectRoot);

        expect(getCompilerAdapter('esp32s3', global, project)).toBeInstanceOf(Esp32ClangCompilerAdapter);
        expect(() => new Esp32CompilerAdapter(global, project, 'esp32s3')).toThrow(/ESP-IDF environment/);
    });

    it('removes the bundle and clang when the last clang board is removed', async () => {
        const env = setupGlobalEnvWithClangEsp32s3();
        mockedInquirer.prompt.mockResolvedValue({ proceed: true });

        await handleRemoveCommand('esp32s3', {});

        expect(fs.exists(env.bundleDir('esp32s3'))).toBe(false);
        expect(fs.exists(env.clangRootDir)).toBe(false);
        expect(Object.keys(getGlobalConfig().boards)).not.toContain('esp32s3');
    });
});
