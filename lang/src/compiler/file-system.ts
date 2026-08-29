// Minimal filesystem abstraction so that the compiler can run both on Node
// (files on disk) and in a browser (files in memory).
import * as nodeFs from "fs";
import * as path from "path";
import { Buffer } from "node:buffer";

export type DirEntry = { name: string, isDirectory: boolean, isFile: boolean };

export interface FileSystem {
    exists(p: string): boolean;
    readFile(p: string): Buffer;
    readTextFile(p: string): string;
    writeFile(p: string, data: string | Buffer): void;
    mkdir(p: string): void;                 // recursive
    readdir(p: string): DirEntry[];
    rm(p: string): void;                    // recursive, ignores missing paths
    copyFile(from: string, to: string): void;
}

export class NodeFileSystem implements FileSystem {
    exists(p: string) { return nodeFs.existsSync(p); }
    readFile(p: string) { return nodeFs.readFileSync(p); }
    readTextFile(p: string) { return nodeFs.readFileSync(p, 'utf-8'); }
    writeFile(p: string, data: string | Buffer) { nodeFs.writeFileSync(p, data); }
    mkdir(p: string) { nodeFs.mkdirSync(p, { recursive: true }); }
    readdir(p: string) {
        return nodeFs.readdirSync(p, { withFileTypes: true })
            .map(e => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
    }
    rm(p: string) { nodeFs.rmSync(p, { recursive: true, force: true }); }
    copyFile(from: string, to: string) {
        nodeFs.mkdirSync(path.dirname(to), { recursive: true });
        nodeFs.copyFileSync(from, to);
    }
}

export const nodeFileSystem: FileSystem = new NodeFileSystem();

// In-memory filesystem with POSIX paths. Directories exist implicitly for
// every file, and explicitly when created with mkdir().
export class MemoryFileSystem implements FileSystem {
    private files = new Map<string, Buffer>();
    private dirs = new Set<string>(['/']);

    private norm(p: string): string {
        const abs = p.startsWith('/') ? p : '/' + p;
        const out: string[] = [];
        for (const seg of abs.split('/')) {
            if (seg === '' || seg === '.') continue;
            if (seg === '..') { out.pop(); continue; }
            out.push(seg);
        }
        return '/' + out.join('/');
    }

    // Explicitly created directories (empty ones are not implied by files).
    directories(): string[] { return [...this.dirs]; }

    // All files, as [path, data] pairs (e.g. to hand them to a tool).
    entries(prefix = '/'): [string, Buffer][] {
        const pre = this.norm(prefix);
        return [...this.files.entries()].filter(([p]) => p === pre || p.startsWith(pre === '/' ? '/' : pre + '/'));
    }

    exists(p: string) {
        const n = this.norm(p);
        return this.files.has(n) || this.isDir(n);
    }

    private isDir(n: string) {
        if (this.dirs.has(n)) return true;
        const pre = n === '/' ? '/' : n + '/';
        for (const f of this.files.keys()) if (f.startsWith(pre)) return true;
        return false;
    }

    readFile(p: string) {
        const data = this.files.get(this.norm(p));
        if (data === undefined) throw new Error(`ENOENT: no such file: ${p}`);
        return data;
    }
    readTextFile(p: string) { return this.readFile(p).toString('utf-8'); }
    writeFile(p: string, data: string | Buffer) {
        this.files.set(this.norm(p), typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data));
    }
    mkdir(p: string) {
        const n = this.norm(p);
        const parts = n.split('/').filter(Boolean);
        let cur = '';
        for (const seg of parts) { cur += '/' + seg; this.dirs.add(cur); }
    }
    readdir(p: string): DirEntry[] {
        const n = this.norm(p);
        if (!this.isDir(n)) throw new Error(`ENOENT: no such directory: ${p}`);
        const pre = n === '/' ? '/' : n + '/';
        const names = new Map<string, DirEntry>();
        for (const f of this.files.keys()) {
            if (!f.startsWith(pre)) continue;
            const rest = f.slice(pre.length);
            const name = rest.split('/')[0];
            names.set(name, { name, isDirectory: rest.includes('/'), isFile: !rest.includes('/') });
        }
        for (const d of this.dirs) {
            if (!d.startsWith(pre) || d === n) continue;
            const name = d.slice(pre.length).split('/')[0];
            if (!names.has(name)) names.set(name, { name, isDirectory: true, isFile: false });
        }
        return [...names.values()];
    }
    rm(p: string) {
        const n = this.norm(p);
        const pre = n === '/' ? '/' : n + '/';
        this.files.delete(n);
        for (const f of [...this.files.keys()]) if (f.startsWith(pre)) this.files.delete(f);
        for (const d of [...this.dirs]) if (d === n || d.startsWith(pre)) this.dirs.delete(d);
    }
    copyFile(from: string, to: string) { this.writeFile(to, this.readFile(from)); }
}
