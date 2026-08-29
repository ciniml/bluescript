// The browser build never spawns processes: tools run in the toolchain worker.
export function spawn(): never { throw new Error('child_process is not available in the browser'); }
export function execFileSync(): never { throw new Error('child_process is not available in the browser'); }
