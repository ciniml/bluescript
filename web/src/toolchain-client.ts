import type { ToolName, ToolRequest, ToolResponse } from './toolchain-worker';

// Main-thread proxy of the toolchain worker.
export class ToolchainClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (r: ToolResponse) => void>();

  constructor(workerUrl = 'toolchain-worker.js') {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (ev: MessageEvent<ToolResponse>) => {
      const cb = this.pending.get(ev.data.id);
      if (cb) { this.pending.delete(ev.data.id); cb(ev.data); }
    };
  }

  warmup(tools: ToolName[]): Promise<ToolResponse> {
    return this.post({ id: this.nextId++, warmup: tools } as any);
  }

  run(tool: ToolName, args: string[], files: { [p: string]: Uint8Array }, outputs: string[]): Promise<ToolResponse> {
    return this.post({ id: this.nextId++, tool, args, files, outputs });
  }

  private post(req: ToolRequest | any): Promise<ToolResponse> {
    return new Promise(resolve => {
      this.pending.set(req.id, resolve);
      this.worker.postMessage(req);
    });
  }
}
