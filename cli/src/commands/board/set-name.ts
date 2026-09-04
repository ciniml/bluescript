import { Command } from "commander";
import { logger, runStep } from "../../core/logger";
import { CommandHandlerWithUpdateCheck } from "../command";
import { isEsp32FamilyBoard } from "../../config/board-utils";
import { DEFAULT_DEVICE_NAME } from "../../config/project-config";
import { BleConnection, DeviceService } from "../../services/ble/index";


// Renames the board over BLE. The name is stored on the board (NVS), so it
// survives reboots and works with prebuilt runtime bundles; an empty name
// reverts to the compile-time default.
class SetNameHandler extends CommandHandlerWithUpdateCheck {
    constructor(private currentName: string) {
        super();
    }

    async setName(newName: string) {
        const ble = new BleConnection(this.currentName);
        await runStep(`Connecting to ${this.currentName}...`, () => ble.connect());
        try {
            const device: DeviceService = ble.getService('device');
            await runStep(`Setting the device name to '${newName}'...`, () => device.setDeviceName(newName));
        } finally {
            await ble.disconnect().catch(() => { /* ignore */ });
        }
    }
}

export async function handleSetNameCommand(board: string, newName: string, options: { deviceName?: string }) {
    try {
        if (!isEsp32FamilyBoard(board)) {
            throw new Error(`set-name is only available for the ESP32 family, not for ${board}.`);
        }
        const handler = new SetNameHandler(options.deviceName ?? DEFAULT_DEVICE_NAME);
        await handler.setName(newName);
        logger.br();
        logger.success(`Device name set to '${newName || DEFAULT_DEVICE_NAME + ' (default)'}'.`);
        logger.info(`Reconnect with -d ${newName || DEFAULT_DEVICE_NAME} from the next connection.`);
    } catch (error) {
        logger.error(`Failed to set the device name.`);
        logger.showError(error);
        process.exit(1);
    }
}

export function registerSetNameCommand(program: Command) {
    program
        .command('set-name')
        .description('store a BLE device name on the board (empty name reverts to the default)')
        .argument('<board-name>', 'the name of the board (e.g. esp32s3, m5stack-cores3)')
        .argument('<new-name>', 'new device name (at most 31 bytes of UTF-8)')
        .option('-d, --device-name <device-name>', `current name to connect to, the default is '${DEFAULT_DEVICE_NAME}'`)
        .action(handleSetNameCommand);
}
