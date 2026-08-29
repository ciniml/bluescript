// The BlueScript notebook UI (notebook/src) running entirely in the browser.
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Button, Checkbox, Layout, Space, Typography, message } from 'antd';
import Home from '../../notebook/src/view/home';
import { setReplClientFactory } from '../../notebook/src/contexts/repl-context';
import { BrowserCompiler } from './browser-toolchain';
import { ToolchainClient } from './toolchain-client';
import { WebBluetoothDevice } from './ble';
import { flashRuntime } from './flash';
import { BrowserReplClient } from './browser-repl-client';

const tools = new ToolchainClient();
const compiler = new BrowserCompiler(tools);
const client = new BrowserReplClient(compiler);
setReplClientFactory(() => client);

const ready = (async () => {
  await tools.warmup(['clang', 'lld', 'llvm-ar']);
  await compiler.load('bundle/', 'toolchain/');
  compiler.writeSource('index.bs', '');
})();

function Toolbar() {
  const [status, setStatus] = useState('Loading toolchain...');
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ignoreMismatch, setIgnoreMismatch] = useState(false);
  const [msg, contextHolder] = message.useMessage();

  useEffect(() => {
    ready.then(() => { setLoaded(true); setStatus(`Ready (${compiler.target}). Flash the runtime if needed, then connect.`); })
         .catch(e => setStatus('Failed to load: ' + e));
  }, []);

  const connect = async () => {
    try {
      const device = new WebBluetoothDevice({
        log: (m) => client.log(m.replace(/\n$/, '')),
        error: (m) => client.error(m),
        disconnected: () => { setConnected(false); setStatus('Disconnected.'); client.detach(); },
      });
      await device.connect();
      const layout = await device.init();
      try {
        const note = compiler.checkFirmware(layout, ignoreMismatch);
        if (note) msg.warning(note, 8);
      } catch (e) {
        msg.error(String(e), 12);
        device.disconnect();
        return;
      }
      compiler.reset(layout);
      client.attach(device);
      setConnected(true);
      const fw = compiler.firmwareDesc;
      setStatus(`Connected to ${device.name}.` + (fw && layout.firmware ? ` Runtime ${fw.version} verified.` : ''));
    } catch (e) { msg.error(String(e), 8); }
  };
  const reset = async () => {
    try { const layout = await client.device!.init(); compiler.reset(layout); msg.info('Session reset.'); }
    catch (e) { msg.error(String(e)); }
  };
  const reboot = async () => {
    try { await client.device!.reboot(); msg.info('Reboot requested; reconnect after the board restarts.'); }
    catch (e) { msg.error(String(e)); }
  };
  const flash = async () => {
    try {
      setStatus('Flashing runtime...');
      await flashRuntime(compiler.flashFiles, compiler.target, () => {}, (p) => setStatus(`Flashing... ${p}%`));
      setStatus('Flashed. Reset the board and connect.');
    } catch (e) { msg.error(String(e), 8); setStatus('Flash failed.'); }
  };

  return (
    <Space size="middle" wrap>
      {contextHolder}
      <Button size="small" disabled={!loaded} onClick={flash}>Flash runtime (USB)</Button>
      <Button size="small" type="primary" disabled={!loaded || connected} onClick={connect}>Connect (Bluetooth)</Button>
      <Button size="small" disabled={!connected} onClick={reset}>Reset session</Button>
      <Button size="small" disabled={!connected} onClick={reboot}>Reboot board</Button>
      <Checkbox checked={ignoreMismatch} onChange={e => setIgnoreMismatch(e.target.checked)} style={{ color: '#ddd' }}>ignore firmware mismatch</Checkbox>
      <Typography.Text style={{ color: '#ddd' }}>{status}</Typography.Text>
    </Space>
  );
}

function App() {
  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 16, height: 48, backgroundColor: '#434343', padding: '0 10px' }}>
        <Typography.Title level={5} style={{ margin: 0, fontSize: 16, color: '#ffffff' }}>BlueScript</Typography.Title>
        <Toolbar />
      </Layout.Header>
      <Layout.Content style={{ flex: 1, minHeight: 0, height: 'calc(100vh - 48px)', overflow: 'hidden', background: '#ffffff' }}>
        <Home />
      </Layout.Content>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
