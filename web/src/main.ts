import { BrowserCompiler, loadRuntimeBundle } from './compiler';
import { ToolchainClient } from './toolchain-client';
import { WebBluetoothDevice } from './ble';
import { flashRuntime } from './flash';

const $ = (id: string) => document.getElementById(id)!;
const out = $('output') as HTMLPreElement;
const status = $('status');
const print = (s: string, cls = '') => { const l = document.createElement('div'); l.textContent = s; if (cls) l.className = cls; out.appendChild(l); out.scrollTop = out.scrollHeight; };
const setStatus = (s: string) => { status.textContent = s; };

const tools = new ToolchainClient();
let compiler: BrowserCompiler | undefined;
let device: WebBluetoothDevice | undefined;
let bundlePromise = loadRuntimeBundle('bundle/');

(async () => {
  setStatus('Loading toolchain (first time: about 70 MB)...');
  const t = performance.now();
  await tools.warmup(['clang', 'lld']);
  const bundle = await bundlePromise;
  compiler = new BrowserCompiler(bundle, tools);
  await compiler.loadToolchainHeaders('toolchain/');
  setStatus(`Ready (${bundle.target}, toolchain loaded in ${((performance.now() - t) / 1000).toFixed(1)} s). Connect a board.`);
  ($('connect') as HTMLButtonElement).disabled = false;
  ($('flash') as HTMLButtonElement).disabled = false;
  if (location.search.includes('selftest')) {
    await selfTest().catch(e => { print(String(e), 'err'); (window as any).__selftest = { error: String(e) }; });
  }
})().catch(e => { setStatus('Failed to load: ' + e); console.error(e); (window as any).__selftest = { error: String(e) }; });

// ?selftest: compile the sample without a device, using a dummy memory layout.
async function selfTest() {
  const layout = { iram: { address: 0x40380000, size: 10000 }, dram: { address: 0x3fc90000, size: 30000 },
                   iflash: { address: 0x42100000, size: 40960 }, dflash: { address: 0x3c100000, size: 40960 } };
  compiler!.reset(layout);
  const results: any[] = [];
  for (const src of [($('code') as HTMLTextAreaElement).value, 'console.log(fib(10));',
                     'gpio.setDirection(2, 1); gpio.setLevel(2, 1); time.delay(10); console.log(gpio.getLevel(2));']) {
    const image = await compiler!.compileFragment(src, (m) => print(m, 'info'));
    const r = { iflash: image.iflash?.data.length ?? 0, dflash: image.dflash?.data.length ?? 0, dram: image.dram?.data.length ?? 0, entry: image.entryPoints[0].address };
    print(`selftest: ${JSON.stringify(r)}`, 'info');
    results.push(r);
  }
  (window as any).__selftest = { results };
}

$('connect').onclick = async () => {
  try {
    device = new WebBluetoothDevice({
      log: (m) => print(m.replace(/\n$/, '')),
      error: (m) => print(m, 'err'),
      disconnected: () => { setStatus('Disconnected.'); ($('run') as HTMLButtonElement).disabled = true; },
    });
    await device.connect();
    setStatus(`Connected to ${device.name}. Resetting...`);
    const layout = await device.init();
    compiler!.reset(layout);
    setStatus(`Connected to ${device.name}. IRAM 0x${layout.iram.address.toString(16)} / IFlash 0x${layout.iflash.address.toString(16)}`);
    ($('run') as HTMLButtonElement).disabled = false;
  } catch (e) { print(String(e), 'err'); }
};

$('run').onclick = async () => {
  const src = ($('code') as HTMLTextAreaElement).value;
  const btn = $('run') as HTMLButtonElement;
  btn.disabled = true;
  try {
    print('> ' + src.trim().split('\n').join('\n> '), 'src');
    const image = await compiler!.compileFragment(src, (m) => print(m, 'info'));
    const size = ['iram', 'dram', 'iflash', 'dflash'].map(k => `${k}=${(image as any)[k]?.data.length ?? 0}`).join(' ');
    const loadMs = await device!.load(image, (p) => setStatus(`Loading... ${p}%`));
    print(`loaded (${size}) in ${loadMs.toFixed(0)} ms`, 'info');
    const execMs = await device!.execute(image);
    print(`executed in ${execMs.toFixed(2)} ms`, 'info');
    setStatus(`Connected to ${device!.name}.`);
  } catch (e) { print(String(e), 'err'); }
  btn.disabled = false;
};

$('flash').onclick = async () => {
  try {
    const bundle = await bundlePromise;
    setStatus('Flashing runtime (Web Serial)...');
    await flashRuntime(bundle, bundle.target, (m) => print(m, 'info'), (p) => setStatus(`Flashing... ${p}%`));
    setStatus('Flashed. Reset the board and connect.');
  } catch (e) { print(String(e), 'err'); setStatus('Flash failed.'); }
};
