// Linux-only setup steps shared by `board setup` and `board setup-lite`:
// access to the serial device and to BlueZ over D-Bus without root.
import * as os from 'os';
import * as path from 'path';
import * as fs from '../../core/fs';
import { execShell } from '../../core/command-exec';
import { GLOBAL_SETTINGS } from '../../config/constants';

export const SERIAL_RULE_FILE = '/etc/udev/rules.d/bscript-serial.rules';
export const NODE_BLE_DBUS_CONFIG_FILE = '/etc/dbus-1/system.d/node-ble.conf';

export async function installSerialUdevRule() {
    const rulesContent = `
KERNEL=="ttyACM[0-9]*", MODE="0666"
KERNEL=="ttyUSB[0-9]*", MODE="0666"
`.trim() + '\n';
    const tmpFile = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'bscript-serial.rules');
    try {
        fs.writeFile(tmpFile, rulesContent);
        await execShell(`sudo install -m 644 ${tmpFile} ${SERIAL_RULE_FILE}`);
        await execShell(`sudo udevadm control --reload-rules`);
        await execShell(`sudo udevadm trigger`);
    } catch (error) {
        throw new Error(`Failed to write ${SERIAL_RULE_FILE}.`, { cause: error });
    } finally {
        fs.removeFile(tmpFile);
    }
}

export async function installNodeBleDbusPolicy() {
    const username = os.userInfo().username;
    if (!username) {
        throw new Error(
            `Cannot determine the current username for the D-Bus policy. ` +
            `Install ${NODE_BLE_DBUS_CONFIG_FILE} manually.`,
        );
    }
    const policyContent = `<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="${username}">
    <allow own="org.bluez"/>
    <allow send_destination="org.bluez"/>
    <allow send_interface="org.bluez.GattCharacteristic1"/>
    <allow send_interface="org.bluez.GattDescriptor1"/>
    <allow send_interface="org.freedesktop.DBus.ObjectManager"/>
    <allow send_interface="org.freedesktop.DBus.Properties"/>
  </policy>
</busconfig>
`;
    const tmpFile = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'node-ble.conf');
    try {
        fs.writeFile(tmpFile, policyContent);
        await execShell(`sudo install -m 644 ${tmpFile} ${NODE_BLE_DBUS_CONFIG_FILE}`);
        // Best-effort: new connections pick up system.d policies after reload.
        try {
            await execShell('sudo systemctl reload dbus');
        } catch {
            // Not all distros expose dbus via systemctl; policy still applies after re-login/reboot.
        }
    } catch (error) {
        throw new Error(
            `Failed to install D-Bus policy at ${NODE_BLE_DBUS_CONFIG_FILE}. ` +
            `BLE over BlueZ (node-ble) requires this policy for user "${username}".`,
            { cause: error },
        );
    } finally {
        fs.removeFile(tmpFile);
    }
}
