import { BrowserCompiler } from './browser-toolchain';
import { ToolchainClient } from './toolchain-client';
import { WebBluetoothDevice } from './ble';
import { flashRuntime } from './flash';
import type { MemoryImage } from '../../lang/src/compiler/board-toolchain/board-toolchain';
import { installPackage, installedPackages, removePackage, readProjectDeps, writeProjectDeps } from './packages';

const $ = (id: string) => document.getElementById(id)!;
const out = $('output') as HTMLPreElement;
const status = $('status');
const editor = $('editor') as HTMLTextAreaElement;
const print = (s: string, cls = '') => { const l = document.createElement('div'); l.textContent = s; if (cls) l.className = cls; out.appendChild(l); out.scrollTop = out.scrollHeight; };
const setStatus = (s: string) => { status.textContent = s; };
const enable = (ids: string[], on: boolean) => ids.forEach(id => (($(id) as HTMLButtonElement).disabled = !on));

const DEFAULT_FILES: { [name: string]: string } = {
  'index.bs': `import { fib } from "./fib";\n\nlet ledPin = 38;\ngpio.setDirection(ledPin, 1);\nconsole.log(fib(20));\n`,
  'fib.bs': `export function fib(n: integer): integer {\n    if (n < 2) return n; else return fib(n - 1) + fib(n - 2);\n}\n`,
};
const STORAGE_KEY = 'bluescript-web-project';

const tools = new ToolchainClient();
const compiler = new BrowserCompiler(tools);
let device: WebBluetoothDevice | undefined;
let currentFile = 'index.bs';

// --- project files and packages (persisted per browser) ---
function loadProjectFiles() {
  let saved: { [path: string]: string } | null = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { /* ignore */ }
  if (saved && Object.keys(saved).some(p => p.startsWith('src/'))) {
    compiler.importProject(saved);
  } else {
    for (const [name, text] of Object.entries(DEFAULT_FILES)) compiler.writeSource(name, text);
  }
}
function saveProjectFiles() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compiler.exportProject())); } catch { /* ignore */ }
}
function renderPackageList() {
  const ul = $('packageList');
  ul.innerHTML = '';
  for (const name of installedPackages(compiler.fs)) {
    const li = document.createElement('li');
    li.textContent = name;
    ul.appendChild(li);
  }
}
$('installPackage').onclick = async () => {
  const url = prompt('GitHub URL of the package', 'https://github.com/bluescript-lang/pkg-gpio-esp32.git');
  if (!url) return;
  try {
    const names = await installPackage(compiler.fs, url, undefined, (m) => print(m, 'info'));
    const deps = readProjectDeps(compiler.fs);
    deps[names[0]] = url;
    writeProjectDeps(compiler.fs, deps);
    saveProjectFiles(); renderPackageList();
  } catch (e) { print(String(e), 'err'); }
};
$('removePackage').onclick = () => {
  const name = prompt('Package to uninstall', installedPackages(compiler.fs)[0] ?? '');
  if (!name) return;
  removePackage(compiler.fs, name);
  const deps = readProjectDeps(compiler.fs); delete deps[name]; writeProjectDeps(compiler.fs, deps);
  saveProjectFiles(); renderPackageList();
};
function renderFileList() {
  const ul = $('fileList');
  ul.innerHTML = '';
  for (const name of compiler.listSources()) {
    const li = document.createElement('li');
    li.textContent = name;
    if (name === currentFile) li.className = 'active';
    li.onclick = () => { commitEditor(); currentFile = name; editor.value = compiler.readSource(name); renderFileList(); };
    ul.appendChild(li);
  }
}
function commitEditor() {
  if (compiler.listSources().includes(currentFile)) { compiler.writeSource(currentFile, editor.value); saveProjectFiles(); }
}
editor.addEventListener('input', () => commitEditor());
$('addFile').onclick = () => {
  const name = prompt('File name (e.g. util.bs)');
  if (!name || !name.endsWith('.bs')) return;
  commitEditor();
  compiler.writeSource(name, '');
  currentFile = name; editor.value = '';
  saveProjectFiles(); renderFileList();
};
$('removeFile').onclick = () => {
  if (currentFile === 'index.bs' || !confirm(`Remove ${currentFile}?`)) return;
  compiler.removeSource(currentFile);
  currentFile = 'index.bs'; editor.value = compiler.readSource(currentFile);
  saveProjectFiles(); renderFileList();
};

// --- start-up ---
(async () => {
  setStatus('Loading toolchain (first time: about 70 MB)...');
  const t = performance.now();
  await tools.warmup(['clang', 'lld', 'llvm-ar']);
  await compiler.load('bundle/', 'toolchain/');
  loadProjectFiles();
  editor.value = compiler.readSource(currentFile);
  renderFileList();
  renderPackageList();
  setStatus(`Ready (${compiler.target}, toolchain loaded in ${((performance.now() - t) / 1000).toFixed(1)} s). Connect a board.`);
  enable(['connect', 'flash'], true);
  if (location.search.includes('selftest')) {
    await selfTest().catch(e => { print(String(e), 'err'); (window as any).__selftest = { error: String(e) }; });
  }
})().catch(e => { setStatus('Failed to load: ' + e); console.error(e); (window as any).__selftest = { error: String(e) }; });

// --- device ---
async function loadAndRun(image: MemoryImage) {
  const size = ['iram', 'dram', 'iflash', 'dflash'].map(k => `${k}=${(image as any)[k]?.data.length ?? 0}`).join(' ');
  const loadMs = await device!.load(image, (p) => setStatus(`Loading... ${p}%`));
  print(`loaded (${size}) in ${loadMs.toFixed(0)} ms`, 'info');
  const execMs = await device!.execute(image);
  print(`executed in ${execMs.toFixed(2)} ms`, 'info');
  setStatus(`Connected to ${device!.name}.`);
}

$('connect').onclick = async () => {
  try {
    device = new WebBluetoothDevice({
      log: (m) => print(m.replace(/\n$/, '')),
      error: (m) => print(m, 'err'),
      disconnected: () => { setStatus('Disconnected.'); enable(['run', 'runProject', 'reset', 'reboot'], false); },
    });
    await device.connect();
    setStatus(`Connected to ${device.name}. Resetting...`);
    const layout = await device.init();
    try {
      const note = compiler.checkFirmware(layout, ($('ignoreMismatch') as HTMLInputElement).checked);
      if (note) print(note, 'info');
    } catch (e) {
      print(String(e), 'err');
      print('Flash the runtime from this page ("Flash runtime (USB)") or tick "ignore firmware mismatch" to continue anyway.', 'info');
      device.disconnect();
      return;
    }
    compiler.reset(layout);
    const fw = compiler.firmwareDesc;
    const idf = fw && /^v?\d/.test(fw.idfVersion) ? `, ESP-IDF ${fw.idfVersion}` : '';
    const fwText = fw && layout.firmware ? ` Runtime ${fw.version} (built ${fw.buildTime}${idf}) verified.` : ' Runtime identity not verified.';
    setStatus(`Connected to ${device.name}. IRAM 0x${layout.iram.address.toString(16)} / IFlash 0x${layout.iflash.address.toString(16)}.${fwText}`);
    enable(['run', 'runProject', 'reset', 'reboot'], true);
  } catch (e) { print(String(e), 'err'); }
};

$('runProject').onclick = async () => {
  commitEditor();
  enable(['run', 'runProject'], false);
  try {
    print(`> build project (${compiler.listSources().join(', ')})`, 'src');
    const t = performance.now();
    const image = await compiler.buildProject();
    print(`built in ${(performance.now() - t).toFixed(0)} ms`, 'info');
    await loadAndRun(image);
  } catch (e) { print(String(e), 'err'); }
  enable(['run', 'runProject'], true);
};

$('run').onclick = async () => {
  const src = ($('repl') as HTMLTextAreaElement).value;
  enable(['run', 'runProject'], false);
  try {
    print('> ' + src.trim().split('\n').join('\n> '), 'src');
    const t = performance.now();
    const image = await compiler.compileFragment(src);
    print(`compiled in ${(performance.now() - t).toFixed(0)} ms`, 'info');
    await loadAndRun(image);
  } catch (e) {
    const msg = String(e);
    print(msg, 'err');
    if (/already|redeclar|duplicate/i.test(msg)) print('Hint: press "Reset session" to run the same code again.', 'info');
  }
  enable(['run', 'runProject'], true);
};

$('reset').onclick = async () => {
  try {
    const layout = await device!.init();
    compiler.reset(layout);
    print('--- session reset ---', 'info');
  } catch (e) { print(String(e), 'err'); }
};

$('reboot').onclick = async () => {
  try {
    await device!.reboot();
    print('--- reboot requested; reconnect after the board restarts ---', 'info');
  } catch (e) { print(String(e), 'err'); }
};

$('flash').onclick = async () => {
  try {
    setStatus('Flashing runtime (Web Serial)...');
    await flashRuntime(compiler.flashFiles, compiler.target, (m) => print(m, 'info'), (p) => setStatus(`Flashing... ${p}%`));
    setStatus('Flashed. Reset the board and connect.');
  } catch (e) { print(String(e), 'err'); setStatus('Flash failed.'); }
};

// ?selftest: build the default project and a few fragments without a board.
async function selfTest() {
  const layout = { dummy: true, iram: { address: 0x40380000, size: 10000 }, dram: { address: 0x3fc90000, size: 30000 },
                   iflash: { address: 0x42100000, size: 40960 }, dflash: { address: 0x3c100000, size: 40960 } };
  compiler.reset(layout);
  const results: any[] = [];
  const record = (image: MemoryImage) => {
    const r = { iflash: image.iflash?.data.length ?? 0, dflash: image.dflash?.data.length ?? 0, dram: image.dram?.data.length ?? 0, entries: image.entryPoints.map(e => e.address) };
    print(`selftest: ${JSON.stringify(r)}`, 'info');
    results.push(r);
  };
  for (const [n, t] of Object.entries(DEFAULT_FILES)) compiler.writeSource(n, t);
  let t0 = performance.now();
  record(await compiler.buildProject());
  print(`project built in ${(performance.now() - t0).toFixed(0)} ms`, 'info');
  // A project that uses a package installed from GitHub.
  if (!location.search.includes('offline')) {
    await installPackage(compiler.fs, 'https://github.com/bluescript-lang/pkg-gpio-esp32.git', undefined, (m) => print(m, 'info'));
    writeProjectDeps(compiler.fs, { gpio: 'https://github.com/bluescript-lang/pkg-gpio-esp32.git' });
    compiler.writeSource('index.bs', 'import { GPIO, PinMode } from "gpio";\nlet led = new GPIO(2, PinMode.Output);\nconsole.log("gpio package");\n');
    compiler.reset(layout);
    t0 = performance.now();
    record(await compiler.buildProject());
    print(`project with package built in ${(performance.now() - t0).toFixed(0)} ms`, 'info');
    writeProjectDeps(compiler.fs, {});
    compiler.writeSource('index.bs', DEFAULT_FILES['index.bs']);
    compiler.reset(layout);
    record(await compiler.buildProject());
  }
  const fragments = ['console.log(fib(10));',
                     'gpio.setDirection(2, 1); gpio.setLevel(2, 1); time.delay(10); console.log(gpio.getLevel(2));',
                     ...(compiler.componentNames.length > 0 ? [
                       'code`#include "driver/gpio.h"`\nfunction pullup(pin: integer) { code`gpio_set_pull_mode((gpio_num_t)${pin}, GPIO_PULLUP_ONLY);` }\npullup(2); console.log("pullup");'] : [])];
  for (const src of fragments) {
    t0 = performance.now();
    record(await compiler.compileFragment(src));
    print(`fragment in ${(performance.now() - t0).toFixed(0)} ms`, 'info');
  }
  (window as any).__selftest = { results };
}
