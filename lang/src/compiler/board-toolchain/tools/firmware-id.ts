// Identity of the runtime firmware, used to make sure that the firmware on the
// board is the one the compiler resolves symbol addresses against.
//
// ESP-IDF embeds an application descriptor (esp_app_desc_t) at offset 0x20 of
// every app image. It carries the SHA-256 of the ELF the image was made from,
// which esptool writes when converting the ELF; the running firmware reports
// the same value through esp_app_get_description().
import { Buffer } from "node:buffer";
import { MemoryLayout } from "../board-toolchain";

export type EspAppDesc = {
    elfSha256: string,     // 64 hex characters
    version: string,
    projectName: string,
    buildTime: string,     // "<time> <date>" as compiled in
    idfVersion: string,
};

const APP_DESC_OFFSET = 0x20;
const APP_DESC_MAGIC = 0xabcd5432;

function cstr(buf: Buffer, offset: number, len: number): string {
    const s = buf.subarray(offset, offset + len);
    const end = s.indexOf(0);
    return s.toString('utf-8', 0, end < 0 ? len : end);
}

// Parse the application descriptor of an ESP-IDF app image (bluescript.bin).
export function parseEspAppDesc(image: Buffer): EspAppDesc {
    const d = APP_DESC_OFFSET;
    if (image.length < d + 256 || image.readUInt32LE(d) !== APP_DESC_MAGIC) {
        throw new Error('Not an ESP-IDF application image (esp_app_desc_t not found).');
    }
    // magic(4) secure_version(4) reserv1(8) version(32) project_name(32) time(16) date(16) idf_ver(32) app_elf_sha256(32)
    return {
        version: cstr(image, d + 16, 32),
        projectName: cstr(image, d + 48, 32),
        buildTime: `${cstr(image, d + 80, 16)} ${cstr(image, d + 96, 16)}`,
        idfVersion: cstr(image, d + 112, 32),
        elfSha256: image.subarray(d + 144, d + 176).toString('hex'),
    };
}

// Functions whose addresses the board reports with its memory layout, in this order.
export const SENTINEL_SYMBOLS = ['bs_stdmodule_main', 'bs_protocol_write_log', 'try_and_catch'];

// What the board reports (see bs_protocol_write_memory_layout).
export type FirmwareIdentity = {
    elfSha256: string,        // all zeros when the port does not provide it
    protocolVersion: number,
    sentinels: number[],      // addresses of SENTINEL_SYMBOLS
};

export const ENV_IGNORE_FIRMWARE_MISMATCH = 'BSCRIPT_IGNORE_FIRMWARE_MISMATCH';

export type FirmwareCheckResult = { ok: true, message?: string } | { ok: false, message: string };

// Compare the identity reported by the board with the firmware the compiler uses.
export function checkFirmwareIdentity(
    layout: MemoryLayout,
    expected: EspAppDesc | undefined,
    symbols: Map<string, { name: string, address: number }>,
): FirmwareCheckResult {
    if (layout.dummy) {
        return { ok: true };
    }
    const reported = layout.firmware;
    if (!reported) {
        // Every firmware the compiler can be set up with (a bundle with a
        // descriptor, or a build next to its .bin) reports its identity, so a
        // board that does not is running something else.
        if (expected) {
            return {
                ok: false,
                message:
                    `The runtime on the board is not the one the compiler was set up with:\n` +
                    `  - the board runs an older runtime that does not report its identity, ` +
                    `while the compiler expects ${expected.version} (built ${expected.buildTime}, sha ${expected.elfSha256.slice(0, 12)}...)\n` +
                    `Flash the matching runtime (bscript board flash-runtime <board>).`,
            };
        }
        return { ok: true, message: 'The board did not report its firmware identity; the consistency check is skipped.' };
    }
    const problems: string[] = [];
    const zeroSha = /^0+$/.test(reported.elfSha256);
    if (expected && !zeroSha && reported.elfSha256 !== expected.elfSha256) {
        problems.push(
            `firmware SHA-256 differs: board ${reported.elfSha256.slice(0, 12)}..., ` +
            `compiler ${expected.elfSha256.slice(0, 12)}... (${expected.version}, built ${expected.buildTime})`);
    }
    SENTINEL_SYMBOLS.forEach((name, i) => {
        const sym = symbols.get(name);
        const addr = reported.sentinels[i];
        if (sym && addr !== undefined && sym.address !== addr) {
            problems.push(`${name} is at 0x${addr.toString(16)} on the board but at 0x${sym.address.toString(16)} in the firmware ELF`);
        }
    });
    if (problems.length === 0) {
        return { ok: true };
    }
    return {
        ok: false,
        message:
            `The runtime on the board is not the one the compiler was set up with:\n  - ${problems.join('\n  - ')}\n` +
            `Flash the matching runtime (bscript board flash-runtime <board>) or set up the board with the bundle that was flashed.`,
    };
}

// Throw unless the firmware matches (or the check is disabled with ${ENV_IGNORE_FIRMWARE_MISMATCH}=1).
export function assertFirmwareMatches(
    layout: MemoryLayout,
    expected: EspAppDesc | undefined,
    symbols: Map<string, { name: string, address: number }>,
    ignore: boolean = process.env[ENV_IGNORE_FIRMWARE_MISMATCH] === '1',
) {
    const result = checkFirmwareIdentity(layout, expected, symbols);
    if (!result.ok && !ignore) {
        throw new Error(`${result.message}\nSet ${ENV_IGNORE_FIRMWARE_MISMATCH}=1 to continue anyway.`);
    }
    return result;
}
