// Installing BlueScript packages in the browser. Packages are git repositories;
// GitHub-hosted ones can be fetched without git through the GitHub API
// (tree listing) and raw.githubusercontent.com (file contents), both of
// which allow cross-origin requests.
import { Buffer } from 'buffer';
import { MemoryFileSystem } from '../../lang/src/compiler/file-system';
import { PROJECT_DIR, PACKAGES_DIR } from './paths';

export type PackageConfig = {
  projectName: string;
  entryFile?: string;
  srcDir?: string;
  dependencies?: { [name: string]: string };
  espIdfComponents?: string[];
};

export type ProjectDeps = { [name: string]: string };   // name -> git URL

export { PACKAGES_DIR };
const DEPS_FILE = `${PROJECT_DIR}/bsconfig.json`;

export function readProjectDeps(fs: MemoryFileSystem): ProjectDeps {
  try { return JSON.parse(fs.readTextFile(DEPS_FILE)).dependencies ?? {}; } catch { return {}; }
}
export function writeProjectDeps(fs: MemoryFileSystem, deps: ProjectDeps) {
  fs.writeFile(DEPS_FILE, JSON.stringify({ dependencies: deps }, null, 2));
}
export function readPackageConfig(fs: MemoryFileSystem, name: string): PackageConfig {
  return JSON.parse(fs.readTextFile(`${PACKAGES_DIR}/${name}/bsconfig.json`));
}

function parseGitHubUrl(url: string): { owner: string, repo: string } {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`Only GitHub repositories can be installed in the browser: ${url}`);
  return { owner: m[1], repo: m[2] };
}

async function getJson(url: string) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r.json();
}

// Fetch a package (and, recursively, its dependencies) into packages/<name>.
// Returns the names of the installed packages.
export async function installPackage(fs: MemoryFileSystem, url: string, version?: string, log: (s: string) => void = () => {}): Promise<string[]> {
  const { owner, repo } = parseGitHubUrl(url);
  const ref = version ?? (await getJson(`https://api.github.com/repos/${owner}/${repo}`)).default_branch;
  log(`Fetching ${owner}/${repo}@${ref}...`);
  const tree = await getJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const files: { path: string }[] = tree.tree.filter((e: any) => e.type === 'blob' && !e.path.startsWith('.git'));
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
  const contents = await Promise.all(files.map(async f => {
    const r = await fetch(rawBase + f.path);
    if (!r.ok) throw new Error(`${f.path}: ${r.status}`);
    return [f.path, new Uint8Array(await r.arrayBuffer())] as const;
  }));
  const configEntry = contents.find(([p]) => p === 'bsconfig.json');
  if (!configEntry) throw new Error(`${url} is not a BlueScript package (no bsconfig.json).`);
  const config = JSON.parse(new TextDecoder().decode(configEntry[1])) as PackageConfig;
  const dir = `${PACKAGES_DIR}/${config.projectName}`;
  fs.rm(dir);
  for (const [p, data] of contents) fs.writeFile(`${dir}/${p}`, Buffer.from(data));
  log(`Installed ${config.projectName} (${contents.length} files)`);
  const installed = [config.projectName];
  for (const [depName, depUrl] of Object.entries(config.dependencies ?? {})) {
    if (!fs.exists(`${PACKAGES_DIR}/${depName}/bsconfig.json`)) installed.push(...await installPackage(fs, depUrl, undefined, log));
  }
  return installed;
}

export function removePackage(fs: MemoryFileSystem, name: string) {
  fs.rm(`${PACKAGES_DIR}/${name}`);
}

export function installedPackages(fs: MemoryFileSystem): string[] {
  if (!fs.exists(PACKAGES_DIR)) return [];
  return fs.readdir(PACKAGES_DIR).filter(e => e.isDirectory).map(e => e.name).sort();
}
