import { Buffer } from 'node:buffer';
import { parseEspAppDesc, checkFirmwareIdentity, SENTINEL_SYMBOLS } from '../../../src/compiler/board-toolchain/tools/firmware-id';

function makeImage(sha: string, version = '2.1.0'): Buffer {
  const img = Buffer.alloc(0x20 + 256);
  const d = 0x20;
  img.writeUInt32LE(0xabcd5432, d);
  img.write(version, d + 16, 'utf-8');
  img.write('bluescript', d + 48, 'utf-8');
  img.write('10:12:03', d + 80, 'utf-8');
  img.write('Aug 30 2026', d + 96, 'utf-8');
  img.write('v5.4', d + 112, 'utf-8');
  Buffer.from(sha, 'hex').copy(img, d + 144);
  return img;
}

const SHA_A = 'aa'.repeat(32), SHA_B = 'bb'.repeat(32);
const layoutBase = { iram: { address: 0x40380000, size: 1 }, dram: { address: 0x3fc90000, size: 1 }, iflash: { address: 0x42100000, size: 1 }, dflash: { address: 0x3c100000, size: 1 } };
const symbols = new Map(SENTINEL_SYMBOLS.map((n, i) => [n, { name: n, address: 0x42000000 + i * 0x100 }]));

describe('firmware identity', () => {
  test('parses the ESP-IDF app descriptor', () => {
    const desc = parseEspAppDesc(makeImage(SHA_A));
    expect(desc).toEqual({ elfSha256: SHA_A, version: '2.1.0', projectName: 'bluescript', buildTime: '10:12:03 Aug 30 2026', idfVersion: 'v5.4' });
    expect(() => parseEspAppDesc(Buffer.alloc(16))).toThrow(/esp_app_desc_t/);
  });

  test('accepts a matching board and skips old runtimes', () => {
    const expected = parseEspAppDesc(makeImage(SHA_A));
    const ok = checkFirmwareIdentity({ ...layoutBase, firmware: { elfSha256: SHA_A, protocolVersion: 2, sentinels: [0x42000000, 0x42000100, 0x42000200] } }, expected, symbols);
    expect(ok.ok).toBe(true);
    // A board without identity is only accepted when nothing is expected.
    const unknown = checkFirmwareIdentity(layoutBase, undefined, symbols);
    expect(unknown.ok).toBe(true);
    const old = checkFirmwareIdentity(layoutBase, expected, symbols);
    expect(old.ok).toBe(false);
    expect(old.message).toMatch(/older runtime/);
  });

  test('reports a different firmware and wrong sentinel addresses', () => {
    const expected = parseEspAppDesc(makeImage(SHA_A));
    const r = checkFirmwareIdentity({ ...layoutBase, firmware: { elfSha256: SHA_B, protocolVersion: 2, sentinels: [0x42000000, 0x42000104, 0x42000200] } }, expected, symbols);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/SHA-256 differs/);
    expect(r.message).toMatch(/bs_protocol_write_log is at 0x42000104/);
  });

  test('falls back to sentinels when the board reports no hash', () => {
    const r = checkFirmwareIdentity({ ...layoutBase, firmware: { elfSha256: '0'.repeat(64), protocolVersion: 2, sentinels: [0x42000000, 0x42000100, 0x42000200] } }, undefined, symbols);
    expect(r.ok).toBe(true);
  });
});
