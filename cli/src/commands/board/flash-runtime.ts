import { Command } from "commander";
import inquirer from 'inquirer';
import * as path from 'path';
import * as os from 'os';
import { SerialPort } from 'serialport'
import { BoardName, Esp32FamilyBoardName, isEsp32FamilyBoard, esp32TargetOf } from "../../config/board-utils";
import { esp32BuildDirName } from "@bscript/lang";
import * as fs from '../../core/fs';
import { logger, runStep } from "../../core/logger";
import { execShell } from '../../core/command-exec';
import chalk from "chalk";
import { CommandHandlerWithUpdateCheck } from "../command";
import { DEFAULT_DEVICE_NAME } from "../../config/project-config";
import { isEsp32BundleBoardConfig, isEsp32IdfBoardConfig } from "../../config/global-config";
import { createRuntimeBundle } from "../../platforms/runtime-bundle";
import { simpleExec } from '../../core/command-exec';


const RUNTIME_ESP_PORT_DIR = (runtimeDir: string) => path.join(runtimeDir, 'ports/esp32');

export abstract class FlashRuntimeHandler extends CommandHandlerWithUpdateCheck {
    abstract isSetup(): boolean;
    abstract eraseFlash(port: string): Promise<void>;
    abstract flashRuntime(port: string, deviceName?: string): Promise<void>;
    // Build the runtime without flashing it. Returns the directory that holds the build artifacts.
    abstract buildRuntime(deviceName?: string): Promise<string>;

    async flash(port: string, deviceName?: string) {
        await runStep('Erasing flash...', () => this.eraseFlash(port));
        await runStep('Flashing BlueScript runtime...', () => this.flashRuntime(port, deviceName));
    }

    async build(deviceName?: string): Promise<string> {
        let buildDir = '';
        await runStep('Building BlueScript runtime...', async () => {
            buildDir = await this.buildRuntime(deviceName);
        });
        return buildDir;
    }
}

export class ESP32FlashRuntimeHandler extends FlashRuntimeHandler {
    readonly boardName: Esp32FamilyBoardName;

    constructor(boardName: Esp32FamilyBoardName = 'esp32') {
        super();
        this.boardName = boardName;
    }

    // Options that select the chip target. Each target uses its own build directory
    // and sdkconfig so that several targets can be built from the same port directory.
    private get targetArgs(): string[] {
        if (this.boardName === 'esp32') {
            return [];
        }
        const args = [
            '-B', esp32BuildDirName(this.boardName),
            '-D', `IDF_TARGET=${esp32TargetOf(this.boardName)}`,
            '-D', `SDKCONFIG=sdkconfig.${this.boardName}`,
        ];
        if (this.boardName !== esp32TargetOf(this.boardName)) {
            // A board variant: extra components and settings under boards/<board>/.
            args.push('-D', `BOARD=${this.boardName}`);
            const boardDefaults = `boards/${this.boardName}/sdkconfig.defaults`;
            if (fs.exists(path.join(this.getEspPortDir(), boardDefaults))) {
                // Quoted: the list separator would otherwise end the shell command.
                args.push('-D', `"SDKCONFIG_DEFAULTS=sdkconfig.defaults;${boardDefaults}"`);
            }
        }
        return args;
    }

    isSetup(): boolean {
        return this.globalConfigHandler.isBoardSetup(this.boardName);
    }

    // True when the board was set up with `setup-lite` (clang + runtime bundle, no ESP-IDF).
    private get usesBundle(): boolean {
        const config = this.globalConfigHandler.getBoardConfig(this.boardName);
        return config !== undefined && isEsp32BundleBoardConfig(config);
    }

    private get bundleFlashDir(): string {
        const config = this.globalConfigHandler.getBoardConfig(this.boardName);
        if (!config || !isEsp32BundleBoardConfig(config)) {
            throw new Error('An unexpected error occurred: cannot find the runtime bundle.');
        }
        return path.join(config.bundleDir, 'flash');
    }

    async eraseFlash(port: string) {
        if (this.usesBundle) {
            await this.runEsptool(['erase_flash'], port);
            return;
        }
        await this.runIdfPy([...this.targetArgs, 'erase-flash', '-p', port]);
    }
    
    async flashRuntime(port: string, deviceName?: string) {
        if (this.usesBundle) {
            if (deviceName !== undefined && deviceName !== DEFAULT_DEVICE_NAME) {
                throw new Error('The device name is fixed in a prebuilt runtime bundle; --device-name is not supported with setup-lite.');
            }
            await this.runEsptool(['-b', '460800', 'write_flash', '@flash_args'], port);
            return;
        }
        deviceName = deviceName ?? DEFAULT_DEVICE_NAME;
        await this.runIdfPy(
            [...this.targetArgs, '-D', `DEVICE_NAME=${deviceName}`, 'build', 'flash', '-p', port],
        );
    }

    async buildRuntime(deviceName?: string): Promise<string> {
        if (this.usesBundle) {
            throw new Error(`The runtime cannot be built without ESP-IDF. Run 'bscript board setup ${this.boardName}' for the full environment.`);
        }
        deviceName = deviceName ?? DEFAULT_DEVICE_NAME;
        await this.runIdfPy(
            [...this.targetArgs, '-D', `DEVICE_NAME=${deviceName}`, 'build'],
        );
        return path.join(this.getEspPortDir(), esp32BuildDirName(this.boardName));
    }

    // Collect the build artifacts into a runtime bundle for `setup-lite`.
    createBundle(components: string[] = []): string {
        const boardConfig = this.globalConfigHandler.getBoardConfig(this.boardName);
        const idf = boardConfig && isEsp32IdfBoardConfig(boardConfig) ? boardConfig : undefined;
        return createRuntimeBundle(this.getRuntimeDir(), this.boardName, {
            components,
            espDir: idf?.rootDir,
            gccPath: idf?.toolchain.gcc,
        });
    }

    // esptool is used when flashing a prebuilt bundle (no ESP-IDF available).
    private async runEsptool(args: string[], port: string) {
        const python = await this.findPythonWithEsptool();
        await execShell(
            `${python} -m esptool --chip ${esp32TargetOf(this.boardName)} -p ${port} ${args.join(' ')}`,
            { cwd: this.bundleFlashDir },
        );
    }

    private async findPythonWithEsptool(): Promise<string> {
        for (const python of ['python3', 'python']) {
            try {
                await simpleExec(python, ['-m', 'esptool', 'version']);
                return python;
            } catch {
                // try the next candidate
            }
        }
        throw new Error("Cannot find esptool. Install it with 'pip install esptool' and try again.");
    }

    private async runIdfPy(args: string[]) {
        const osType = os.platform();
        const exportFile = this.getExportFile();
        const cwd = this.getEspPortDir();
        const preCommand = osType === 'win32' ? `call ${exportFile}` : `source ${exportFile}`;
        await execShell(`${preCommand} && idf.py ${args.join(' ')}`, { cwd });
    }

    private getRuntimeDir() {
        const runtimeDir = this.globalConfigHandler.getConfig().runtimeDir;
        if (!runtimeDir) {
            throw new Error('An unexpected error occurred: cannot find runtime directory path.');
        }
        return runtimeDir;
    }

    private getEspPortDir() {
        return RUNTIME_ESP_PORT_DIR(this.getRuntimeDir());
    }

    private getExportFile() {
        const boardConfig = this.globalConfigHandler.getBoardConfig(this.boardName);
        if (!boardConfig || !isEsp32IdfBoardConfig(boardConfig)) {
            throw new Error('An unexpected error occurred: cannot find board config.');
        }
        return boardConfig.exportFile;
    }
}

export function getFlashRuntimeHandler(board: string) {
    if (board === 'host') {
        throw new Error('flash-runtime is not supported for the host board');
    }
    if (isEsp32FamilyBoard(board)) {
        return new ESP32FlashRuntimeHandler(board);
    }
    throw new Error(`Unsupported board name: ${board}`);
}

export function formatPortChoiceLabel(port: {
    path: string;
    manufacturer?: string;
    vendorId?: string;
    productId?: string;
}): string {
    const manufacturer = port.manufacturer || 'N/A';
    let label = `${port.path} — ${manufacturer}`;

    if (port.vendorId && port.productId) {
        label += ` (${port.vendorId.toLowerCase()}:${port.productId.toLowerCase()})`;
    }
    return label;
}

export async function handleFlashRuntimeCommand(board: string, options: { port?: string, deviceName?: string }) {
    try {
        const flashRuntimeHandler = getFlashRuntimeHandler(board);

        // Check if setup has already been completed.
        if (!flashRuntimeHandler.isSetup()) {
            logger.warn(`The environment for ${board} is not set up. Run 'bscript board setup ${board}' and try again.`);
            return;
        }

        // Get serial port.
        let selectedPort = options.port;
        if (!selectedPort) {
            logger.info('Scanning for available serial ports...');
            const ports = await SerialPort.list();
            if (ports.length === 0) {
                logger.error('No serial ports found. Please connect your device and make sure drivers are installed.');
                return;
            }

            const portChoices = ports.map(port => ({
                name: formatPortChoiceLabel(port),
                value: port.path,
            }));

            const { port } = await inquirer.prompt<{ port: string }>([
            {
                type: 'list',
                name: 'port',
                message: 'Select the serial port to use:',
                choices: portChoices,
            },
            ]);
            selectedPort = port;
        }
        logger.info(`Using port: ${selectedPort}`);

        // Flash runtime.
        await flashRuntimeHandler.flash(selectedPort, options.deviceName);

        logger.br();
        logger.success(`Success to flash the BlueScript runtime to ${board}`);
        logger.info(`Next step: go to the project directory and run ${chalk.yellow('bscript project run')}`);

    } catch (error) {
        logger.error(`Failed to flash the runtime to ${board}`);
        logger.showError(error);
        process.exit(1);
    }
}

export function registerFlashRuntimeCommand(program: Command) {
    program
        .command('flash-runtime')
        .description('flash the BlueScript runtime to the board.')
        .argument('<board-name>', 'the name of the board to flash (e.g., esp32, esp32s3)') 
        .option('-p, --port <port>', 'serial port to flash to')
        .option('-d, --device-name <device-name>', `device name to flash to, the default is '${DEFAULT_DEVICE_NAME}'`)
        .action(handleFlashRuntimeCommand);
}