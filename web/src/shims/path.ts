// Minimal POSIX path helpers for the browser build.
export function join(...parts: string[]): string {
  return normalize(parts.filter(p => p.length > 0).join('/'));
}
export function normalize(p: string): string {
  const abs = p.startsWith('/');
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return (abs ? '/' : '') + out.join('/');
}
export function basename(p: string, ext?: string): string {
  let b = p.slice(p.lastIndexOf('/') + 1);
  if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
  return b;
}
export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i);
}
export function relative(from: string, to: string): string {
  return to.startsWith(from + '/') ? to.slice(from.length + 1) : to;
}
export function isAbsolute(p: string): boolean { return p.startsWith('/'); }
export function resolve(...parts: string[]): string { return join(...parts); }
export function parse(p: string) {
  const base = basename(p); const i = base.lastIndexOf('.');
  return { dir: dirname(p), base, name: i > 0 ? base.slice(0, i) : base, ext: i > 0 ? base.slice(i) : '' };
}
export const sep = '/';
export default { join, normalize, basename, dirname, relative, isAbsolute, resolve, parse, sep };
