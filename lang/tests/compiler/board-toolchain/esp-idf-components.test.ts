import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EspIdfComponents } from '../../../src/compiler/board-toolchain/esp32-toolchain';

// A fake ESP-IDF build directory with a project_description.json.
function makeBuildDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-idf-'));
  fs.mkdirSync(path.join(dir, 'config'));
  const comp = (name: string, reqs: string[], priv_reqs: string[]) => ({
    dir: `/idf/components/${name}`, file: `${dir}/esp-idf/${name}/lib${name}.a`, reqs, priv_reqs, include_dirs: ['include'],
  });
  const info: any = {
    esp_driver_gpio: comp('esp_driver_gpio', [], ['esp_pm']),
    esp_pm: comp('esp_pm', [], ['mbedtls']),
    mbedtls: comp('mbedtls', [], []),
    hal: comp('hal', ['soc'], []),
    soc: comp('soc', [], []),
  };
  for (const c of ['cxx', 'newlib', 'freertos', 'esp_hw_support', 'heap', 'log', 'esp_rom', 'esp_common', 'esp_system', 'xtensa']) {
    info[c] = comp(c, [], []);
  }
  // A component without an archive (header only) must not be listed.
  info.esp_driver_gpio.reqs = ['hal', 'headeronly'];
  info.headeronly = { dir: '/idf/components/headeronly', file: '', reqs: [], priv_reqs: [], include_dirs: ['include'] };
  fs.writeFileSync(path.join(dir, 'project_description.json'), JSON.stringify({ build_component_info: info }));
  return dir;
}

describe('EspIdfComponents.resolveForBundle', () => {
  test('follows public requirements and adds the common components, not private ones', () => {
    const dir = makeBuildDir();
    const idf = new EspIdfComponents(dir, '/esp', 'esp32s3');
    const names = idf.resolveForBundle(['esp_driver_gpio']).map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['esp_driver_gpio', 'hal', 'soc', 'esp_common', 'freertos', 'newlib']));
    expect(names).not.toContain('esp_pm');       // private requirement
    expect(names).not.toContain('mbedtls');
    expect(names).not.toContain('headeronly');   // no archive
    expect(new Set(names).size).toBe(names.length);
  });

  test('rejects unknown components', () => {
    const dir = makeBuildDir();
    const idf = new EspIdfComponents(dir, '/esp', 'esp32s3');
    expect(() => idf.resolveForBundle(['nope'])).toThrow(/nope/);
  });
});
