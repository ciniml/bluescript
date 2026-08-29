// Flash the runtime firmware with esptool-js over Web Serial.
import { ESPLoader, Transport } from 'esptool-js';
import type { RuntimeBundle } from './compiler';

function toBinaryString(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + 0x8000)));
  return s;
}

export async function flashRuntime(bundle: RuntimeBundle, chip: string, log: (s: string) => void, progress: (p: number) => void) {
  if (!(navigator as any).serial) throw new Error('Web Serial is not available in this browser (use Chrome or Edge).');
  const port = await (navigator as any).serial.requestPort();
  const transport = new Transport(port, true);
  const terminal = { clean() {}, writeLine: (s: string) => log(s), write: (s: string) => log(s) };
  const loader = new ESPLoader({ transport, baudrate: 460800, romBaudrate: 115200, terminal } as any);
  try {
    const detected = await loader.main();
    log(`Detected chip: ${detected}`);
    await loader.eraseFlash();
    const fileArray = bundle.flash.map(f => ({ data: toBinaryString(f.data), address: f.address }));
    await loader.writeFlash({
      fileArray, flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep', eraseAll: false, compress: true,
      reportProgress: (_i: number, written: number, total: number) => progress(Math.round((written / total) * 100)),
    } as any);
    await loader.after('hard_reset' as any).catch(() => {});
  } finally {
    await transport.disconnect().catch(() => {});
  }
}
