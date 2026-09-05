import type { ToolName, ToolRequest, ToolResponse } from './toolchain-worker';

// Main-thread proxy of a pool of toolchain workers. Compiles are CPU-bound
// and each worker runs one tool at a time, so requests go to the least-busy
// worker; files registered with registerFiles are mirrored to every worker.
export class ToolchainClient {
  private workers: { worker: Worker, outstanding: number }[] = [];
  private nextId = 1;
  private pending = new Map<number, (r: ToolResponse) => void>();

  constructor(workerUrl = 'toolchain-worker.js', poolSize?: number) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const n = Math.max(1, Math.min(poolSize ?? cores - 1, 4));
    for (let i = 0; i < n; i++) {
      const worker = new Worker(workerUrl);
      worker.onmessage = (ev: MessageEvent<ToolResponse>) => {
        const cb = this.pending.get(ev.data.id);
        if (cb) { this.pending.delete(ev.data.id); cb(ev.data); }
      };
      this.workers.push({ worker, outstanding: 0 });
    }
  }

  // Files written into every tool instance (kept in the workers; sent once).
  registerFiles(files: { [p: string]: Uint8Array }): Promise<ToolResponse[]> {
    return Promise.all(this.workers.map(w => this.post(w, { id: this.nextId++, register: files } as any)));
  }

  warmup(tools: ToolName[]): Promise<ToolResponse[]> {
    return Promise.all(this.workers.map(w => this.post(w, { id: this.nextId++, warmup: tools } as any)));
  }

  run(tool: ToolName, args: string[], files: { [p: string]: Uint8Array }, outputs: string[], lazyFiles?: { [p: string]: string }, cwd?: string, dirs?: string[]): Promise<ToolResponse> {
    let target = this.workers[0];
    for (const w of this.workers) if (w.outstanding < target.outstanding) target = w;
    return this.post(target, { id: this.nextId++, tool, args, files, outputs, lazyFiles, cwd, dirs });
  }

  private post(target: { worker: Worker, outstanding: number }, req: ToolRequest | any): Promise<ToolResponse> {
    target.outstanding++;
    return new Promise(resolve => {
      this.pending.set(req.id, (r) => { target.outstanding--; resolve(r); });
      target.worker.postMessage(req);
    });
  }
}
