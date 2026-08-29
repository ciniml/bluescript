import { Command } from "commander";
import { logger, runStep } from "../../core/logger";
import { CommandHandlerWithUpdateCheck } from "../command";
import { isEsp32FamilyBoard } from "../../config/board-utils";
import { DEFAULT_DEVICE_NAME } from "../../config/project-config";
import { BleConnection, DeviceService } from "../../services/ble/index";


// Restarts the board over BLE. Works even when a program cannot be interrupted,
// because the runtime handles the command in its communication task.
class RebootHandler extends CommandHandlerWithUpdateCheck {
    constructor(private deviceName: string) {
        super();
    }

    async reboot() {
        const ble = new BleConnection(this.deviceName);
        await runStep(`Connecting to ${this.deviceName}...`, () => ble.connect());
        try {
            const device: DeviceService = ble.getService('device');
            await runStep('Requesting reboot...', () => device.reboot());
        } finally {
            await ble.disconnect().catch(() => { /* the board restarts and drops the link */ });
        }
    }
}

export async function handleRebootCommand(board: string, options: { deviceName?: string }) {
    try {
        if (!isEsp32FamilyBoard(board)) {
            throw new Error(`reboot is only available for the ESP32 family, not for ${board}.`);
        }
        const handler = new RebootHandler(options.deviceName ?? DEFAULT_DEVICE_NAME);
        await handler.reboot();
        logger.br();
        logger.success('Reboot requested. The board restarts in a moment.');
    } catch (error) {
        logger.error(`Failed to reboot ${board}`);
        logger.showError(error);
        process.exit(1);
    }
}

export function registerRebootCommand(program: Command) {
    program
        .command('reboot')
        .description('restart the board over Bluetooth (even when the running program cannot be interrupted)')
        .argument('<board-name>', 'the name of the board (esp32 or esp32s3)')
        .option('-d, --device-name <device-name>', `device name to connect to, the default is '${DEFAULT_DEVICE_NAME}'`)
        .action(handleRebootCommand);
}
