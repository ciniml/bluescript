import { MemoryFileSystem } from '../../src/compiler/file-system';

describe('MemoryFileSystem', () => {
  test('files, directories and listing', () => {
    const fs = new MemoryFileSystem();
    fs.writeFile('/p/src/a.bs', 'A');
    fs.writeFile('/p/src/sub/b.bs', 'B');
    fs.mkdir('/p/dist/build');
    expect(fs.exists('/p/src')).toBe(true);
    expect(fs.exists('/p/dist/build')).toBe(true);
    expect(fs.exists('/p/nope')).toBe(false);
    expect(fs.readTextFile('/p/src/a.bs')).toBe('A');
    expect(fs.readdir('/p/src').map(e => `${e.name}:${e.isDirectory ? 'd' : 'f'}`).sort()).toEqual(['a.bs:f', 'sub:d']);
    expect(fs.readdir('/p').map(e => e.name).sort()).toEqual(['dist', 'src']);
    fs.copyFile('/p/src/a.bs', '/p/dist/a.c');
    expect(fs.readTextFile('/p/dist/a.c')).toBe('A');
    fs.rm('/p/src');
    expect(fs.exists('/p/src/a.bs')).toBe(false);
    expect(fs.exists('/p/dist/a.c')).toBe(true);
    expect(() => fs.readFile('/p/src/a.bs')).toThrow(/ENOENT/);
  });

  test('normalizes paths', () => {
    const fs = new MemoryFileSystem();
    fs.writeFile('/p/./src/../x.txt', 'x');
    expect(fs.exists('/p/x.txt')).toBe(true);
    expect(fs.entries('/p').map(([p]) => p)).toEqual(['/p/x.txt']);
  });
});
