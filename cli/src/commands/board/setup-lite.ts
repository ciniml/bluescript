import { Command } from "commander";
import inquirer from 'inquirer';
import chalk from "chalk";
import * as path from 'path';
import * as fs from '../../core/fs';
import { logger, runStep, skip } from "../../core/logger";
import { CommandHandlerWithUpdateCheck } from "../command";
import { Esp32FamilyBoardName, isEsp32FamilyBoard } from "../../config/board-utils";
import { ClangEnv } from "../../platforms/board-env/clang-env";
import { readRuntimeBundleManifest } from "@bscript/lang";
import { GLOBAL_SETTINGS } from "../../config/constants";
import { isPackageInstalledOnUnix, isPackageInstalledOnWindows } from "../../platforms/board-env/common-env";
import * as os from 'os';


// Sets up a board with the Espressif clang toolchain and a prebuilt runtime bundle.
// No ESP-IDF installation is needed; the bundle is produced by
// `bscript board build-runtime <board>` on a machine that has ESP-IDF.
export class SetupLiteHandler extends CommandHandlerWithUpdateCheck {
    readonly boardName: Esp32FamilyBoardName;
    readonly clangEnv = new ClangEnv();
    private bundleSourceDir: string;

    constructor(boardName: Esp32FamilyBoardName, bundleSourceDir: string) {
        super();
        this.boardName = boardName;
        this.bundleSourceDir = bundleSourceDir;
    }

    needSetup() {
        return !this.globalConfigHandler.isBoardSetup(this.boardName);
    }

    getSetupPlan(): string[] {
        return [
            `Verify the runtime bundle at ${this.bundleSourceDir}.`,
            `Download Espressif clang ${this.clangEnv.clangVersion} (${this.clangEnv.downloadUrl}) into ${this.clangEnv.clangRootDir}, if needed.`,
            `Install the runtime bundle into ${this.clangEnv.bundleDir(this.boardName)}.`,
        ];
    }

    async setup() {
        fs.makeDir(GLOBAL_SETTINGS.BLUESCRIPT_DIR);
        await runStep('Verifying the runtime bundle...', async () => this.verifyBundle());
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
        if (!this.globalConfigHandler.isRuntimeSetup()) {
            // The runtime sources are not needed with the clang toolchain, but
            // other commands expect a runtime directory. Point it at the bundle.
            this.globalConfigHandler.setRuntimeDir(this.clangEnv.bundleDir(this.boardName));
        }
        this.globalConfigHandler.save();
    }

    private verifyBundle() {
        if (!fs.exists(this.bundleSourceDir)) {
            throw new Error(`Runtime bundle not found: ${this.bundleSourceDir}`);
        }
        const manifest = readRuntimeBundleManifest(this.bundleSourceDir);
        if (manifest.target !== this.boardName) {
            throw new Error(`The runtime bundle is for ${manifest.target}, not for ${this.boardName}.`);
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

export async function handleSetupLiteCommand(board: string, options: { bundle?: string }) {
    try {
        if (!isEsp32FamilyBoard(board)) {
            throw new Error(`setup-lite is only available for the ESP32 family, not for ${board}.`);
        }
        if (!options.bundle) {
            throw new Error(`The --bundle <dir> option is required. Create a bundle with 'bscript board build-runtime ${board}'.`);
        }
        const handler = new SetupLiteHandler(board, path.resolve(options.bundle));

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
        logger.success(`Success to set up ${board} (clang toolchain)`);
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
        .action(handleSetupLiteCommand);
}
