// The browser build never touches the filesystem: lang's NodeFileSystem is
// bundled but unused (MemoryFileSystem is injected instead).
const unavailable = (): never => { throw new Error('fs is not available in the browser'); };
export const readFileSync = unavailable;
export const writeFileSync = unavailable;
export const mkdirSync = unavailable;
export const readdirSync = unavailable;
export const rmSync = unavailable;
export const copyFileSync = unavailable;
export function existsSync(): boolean { return false; }
