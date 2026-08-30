import { Command } from "commander";
import inquirer from 'inquirer';
import chalk from "chalk";
import * as path from 'path';
import * as fs from '../../core/fs';
import { logger, runStep, skip } from "../../core/logger";
import { CommandHandlerWithUpdateCheck } from "../command";
import { Esp32FamilyBoardName, isEsp32FamilyBoard } from "../../config/board-utils";
import { ClangEnv } from "../../platforms/board-env/clang-env";
import { WasmToolchainEnv } from "../../platforms/board-env/wasm-toolchain-env";
import { readRuntimeBundleManifest } from "@bscript/lang";
import { GLOBAL_SETTINGS } from "../../config/constants";
import { isPackageInstalledOnUnix, isPackageInstalledOnWindows } from "../../platforms/board-env/common-env";
import { installSerialUdevRule, installNodeBleDbusPolicy, SERIAL_RULE_FILE, NODE_BLE_DBUS_CONFIG_FILE } from "../../platforms/board-env/linux-permissions";
import * as os from 'os';


// Sets up a board with the Espressif clang toolchain and a prebuilt runtime bundle.
// No ESP-IDF installation is needed; the bundle is produced by
// `bscript board build-runtime <board>` on a machine that has ESP-IDF.
export type LiteToolchainType = 'clang' | 'wasm';

export class SetupLiteHandler extends CommandHandlerWithUpdateCheck {
    readonly boardName: Esp32FamilyBoardName;
    readonly clangEnv = new ClangEnv();
    readonly wasmEnv = new WasmToolchainEnv();
    private bundleSourceDir: string;
    private toolchainType: LiteToolchainType;
    private wasmSource?: string;

    constructor(boardName: Esp32FamilyBoardName, bundleSourceDir: string, toolchainType: LiteToolchainType = 'clang', wasmSource?: string) {
        super();
        this.boardName = boardName;
        this.bundleSourceDir = bundleSourceDir;
        this.toolchainType = toolchainType;
        this.wasmSource = wasmSource;
    }

    needSetup() {
        return !this.globalConfigHandler.isBoardSetup(this.boardName);
    }

    getSetupPlan(): string[] {
        const toolchainStep = this.toolchainType === 'wasm'
            ? `Install the WebAssembly toolchain ${this.wasmEnv.version} from ${this.wasmSource ?? this.wasmEnv.downloadUrl} into ${this.wasmEnv.rootDir}, if needed.`
            : `Download Espressif clang ${this.clangEnv.clangVersion} (${this.clangEnv.downloadUrl}) into ${this.clangEnv.clangRootDir}, if needed.`;
        return [
            `Verify the runtime bundle at ${this.bundleSourceDir}.`,
            toolchainStep,
            `Install the runtime bundle into ${this.clangEnv.bundleDir(this.boardName)}.`,
            ...(os.platform() === 'linux' ? [
                `Write ${SERIAL_RULE_FILE} to configure access permissions for the serial device (sudo).`,
                `Install D-Bus policy (${NODE_BLE_DBUS_CONFIG_FILE}) so BLE works with BlueZ without root (sudo).`,
            ] : []),
        ];
    }

    async setup() {
        fs.makeDir(GLOBAL_SETTINGS.BLUESCRIPT_DIR);
        await runStep('Verifying the runtime bundle...', async () => this.verifyBundle());
        if (this.toolchainType === 'wasm') {
            await this.setupWasm();
        } else {
            await this.setupClang();
        }
        if (os.platform() === 'linux') {
            await runStep(`Writing ${SERIAL_RULE_FILE}...`, async () => {
                if (fs.exists(SERIAL_RULE_FILE)) return skip('already installed.');
                await installSerialUdevRule();
            });
            await runStep('Installing D-Bus policy for Bluetooth...', async () => {
                if (fs.exists(NODE_BLE_DBUS_CONFIG_FILE)) return skip('already installed.');
                await installNodeBleDbusPolicy();
            });
        }
        if (!this.globalConfigHandler.isRuntimeSetup()) {
            // The runtime sources are not needed with a prebuilt bundle, but
            // other commands expect a runtime directory. Point it at the bundle.
            this.globalConfigHandler.setRuntimeDir(this.clangEnv.bundleDir(this.boardName));
        }
        this.globalConfigHandler.save();
    }

    private async setupWasm() {
        await runStep('Installing the WebAssembly toolchain...', async () => {
            if (this.wasmEnv.isInstalled() && !this.wasmSource) {
                return skip('already installed.');
            }
            if (!await this.isTarAvailable()) {
                throw new Error('Cannot find the tar command (with xz support). Please install it and try again.');
            }
            await this.wasmEnv.install(this.wasmSource);
        });
        await runStep('Installing the runtime bundle...', async () => {
            this.clangEnv.installBundle(this.boardName, this.bundleSourceDir);
        });
        this.globalConfigHandler.setBoardConfig(this.boardName, {
            toolchainType: 'wasm',
            toolchainVersion: this.wasmEnv.version,
            rootDir: this.wasmEnv.rootDir,
            bundleDir: this.clangEnv.bundleDir(this.boardName),
            resourceDir: this.wasmEnv.resourceDir,
            toolchain: {
                clang: this.wasmEnv.clangFile,
                ar: this.wasmEnv.arFile,
                ld: this.wasmEnv.ldFile,
            },
        });
    }

    private async setupClang() {
        await runStep('Downloading Espressif clang... It may take a while.', async () => {
            if (this.clangEnv.isClangInstalled()) {
                return skip('already installed.');
            }
            if (!await this.isTarAvailable()) {
                throw new Error('Cannot find the tar command (with xz support). Please install it and try again.');
            }
            await this.clangEnv.downloadClang();
        });
        await runStep('Installing the runtime bundle...', async () => {
            this.clangEnv.installBundle(this.boardName, this.bundleSourceDir);
        });
        this.globalConfigHandler.setBoardConfig(this.boardName, {
            toolchainType: 'clang',
            clangVersion: this.clangEnv.clangVersion,
            rootDir: this.clangEnv.clangRootDir,
            bundleDir: this.clangEnv.bundleDir(this.boardName),
            toolchain: {
                clang: this.clangEnv.clangFile,
                ar: this.clangEnv.arFile,
                ld: this.clangEnv.ldFile(this.boardName),
            },
        });
    }

    private verifyBundle() {
        if (!fs.exists(this.bundleSourceDir)) {
            throw new Error(`Runtime bundle not found: ${this.bundleSourceDir}`);
        }
        const manifest = readRuntimeBundleManifest(this.bundleSourceDir);
        const bundleBoard = manifest.board ?? manifest.target;
        if (bundleBoard !== this.boardName) {
            throw new Error(`The runtime bundle is for ${bundleBoard}, not for ${this.boardName}.`);
        }
        if (manifest.vmVersion !== GLOBAL_SETTINGS.VM_VERSION) {
            throw new Error(
                `The runtime bundle was built for BlueScript ${manifest.vmVersion}, but this CLI is ${GLOBAL_SETTINGS.VM_VERSION}.`);
        }
        for (const file of ['bluescript.elf', 'std-module.bs', 'include/c-runtime.h', 'flash/flash_args']) {
            if (!fs.exists(path.join(this.bundleSourceDir, file))) {
                throw new Error(`The runtime bundle is missing ${file}.`);
            }
        }
    }

    private isTarAvailable() {
        return os.platform() === 'win32' ? isPackageInstalledOnWindows('tar') : isPackageInstalledOnUnix('tar');
    }
}

export async function handleSetupLiteCommand(board: string, options: { bundle?: string, toolchain?: string, wasmToolchain?: string }) {
    try {
        if (!isEsp32FamilyBoard(board)) {
            throw new Error(`setup-lite is only available for the ESP32 family, not for ${board}.`);
        }
        if (!options.bundle) {
            throw new Error(`The --bundle <dir> option is required. Create a bundle with 'bscript board build-runtime ${board}'.`);
        }
        const toolchainType = options.toolchain ?? 'clang';
        if (toolchainType !== 'clang' && toolchainType !== 'wasm') {
            throw new Error(`Unknown toolchain type: ${toolchainType} (expected 'clang' or 'wasm').`);
        }
        const handler = new SetupLiteHandler(board, path.resolve(options.bundle), toolchainType, options.wasmToolchain);

        if (!handler.needSetup()) {
            logger.warn(`The setup for ${board} has already been completed.`);
            return;
        }

        logger.log('The following setup process will be executed:');
        handler.getSetupPlan().forEach(step => logger.log(`  - ${step}`));
        const { proceed } = await inquirer.prompt([
            { type: 'confirm', name: 'proceed', message: 'Do you want to continue?', default: true },
        ]);
        if (!proceed) {
            logger.warn('Setup cancelled by user.');
            return;
        }

        await handler.setup();

        logger.br();
        logger.success(`Success to set up ${board} (${toolchainType} toolchain)`);
        logger.info(`Next step: run ${chalk.yellow(`bscript board flash-runtime ${board}`)} (requires esptool: pip install esptool)`);
    } catch (error) {
        logger.error(`Failed to set up ${board}`);
        logger.showError(error);
        process.exit(1);
    }
}

export function registerSetupLiteCommand(program: Command) {
    program
        .command('setup-lite')
        .description('set up a board with Espressif clang and a prebuilt runtime bundle (no ESP-IDF needed)')
        .argument('<board-name>', 'name of the board to setup (esp32 or esp32s3)')
        .requiredOption('--bundle <dir>', 'runtime bundle directory created by "bscript board build-runtime"')
        .option('--toolchain <type>', "'clang' (native Espressif clang) or 'wasm' (WebAssembly build run by node)", 'clang')
        .option('--wasm-toolchain <path-or-url>', 'WebAssembly toolchain archive (.tar.xz), directory or URL; defaults to the release download')
        .action(handleSetupLiteCommand);
}
