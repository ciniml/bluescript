// The browser build never touches the filesystem; ElfReader is constructed from buffers.
export function readFileSync(): never { throw new Error('fs is not available in the browser'); }
export function existsSync(): boolean { return false; }
