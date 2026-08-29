// A drop-in replacement for the notebook's WebSocketClient: messages of the
// 'repl' service are handled in the page (compile with the in-browser
// toolchain, load and execute over Web Bluetooth) instead of being sent to
// the CLI over a WebSocket.
import { EventEmitter, ReplService, Service, WebSocketMessage } from '../../notebook/src/service/websocket-client';
import type { ReplClient } from '../../notebook/src/contexts/repl-context';
import type { BrowserCompiler } from './browser-toolchain';
import type { WebBluetoothDevice } from './ble';

type Events = { connected: () => void; disconnected: (event: any) => void; error: (error: any) => void };

export class BrowserReplClient extends EventEmitter<Events> implements ReplClient {
  private services = new Map<string, Service<any>>();
  device?: WebBluetoothDevice;

  constructor(private compiler: BrowserCompiler) { super(); }

  // The notebook calls connect() on mount; the board is attached later by the
  // toolbar (Web Bluetooth needs a user gesture), which calls attach().
  connect(_url: string): Promise<void> { return Promise.resolve(); }
  disconnect(): void { this.device?.disconnect(); }

  attach(device: WebBluetoothDevice) {
    this.device = device;
    this.emit('connected');
  }
  detach() {
    this.device = undefined;
    this.emit('disconnected', undefined);
  }

  getService(serviceName: 'repl'): ReplService;
  getService<T extends Service<any>>(serviceName: string): T;
  getService(serviceName: string): Service<any> {
    let s = this.services.get(serviceName);
    if (!s) {
      if (serviceName !== 'repl') throw new Error(`Unknown service: ${serviceName}`);
      s = new ReplService(this as any);
      this.services.set(serviceName, s);
    }
    return s;
  }

  // Messages from the ReplService (see cli/src/services/websocket.ts for the CLI side).
  send(message: WebSocketMessage): void {
    if (message.service === 'repl' && message.event === 'execute') {
      void this.execute(String(message.payload[0]));
    }
  }

  // Forward board output to the notebook's log pane.
  log(message: string) { this.getService('repl').handleMessage('log', [message]); }
  error(message: string) { this.getService('repl').handleMessage('error', [message]); }

  private async execute(code: string) {
    const repl = this.getService('repl');
    if (!this.device) { repl.handleMessage('finishCompilation', [0, 'Not connected to a board.']); return; }
    let image;
    const t0 = performance.now();
    try {
      image = await this.compiler.compileFragment(code);
    } catch (e) {
      repl.handleMessage('finishCompilation', [performance.now() - t0, String((e as Error).message ?? e)]);
      return;
    }
    repl.handleMessage('finishCompilation', [performance.now() - t0, undefined]);
    try {
      const loadMs = await this.device.load(image);
      repl.handleMessage('finishLoading', [loadMs]);
      const execMs = await this.device.execute(image);
      repl.handleMessage('finishExecution', [execMs]);
    } catch (e) {
      repl.handleMessage('error', [String(e)]);
      repl.handleMessage('finishLoading', [0]);
      repl.handleMessage('finishExecution', [0]);
    }
  }
}
