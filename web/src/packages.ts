// Installing BlueScript packages in the browser. Packages are git repositories;
// GitHub-hosted ones can be fetched without git through the GitHub API
// (tree listing) and raw.githubusercontent.com (file contents), both of
// which allow cross-origin requests.
import { Buffer } from 'buffer';
import { MemoryFileSystem } from '../../lang/src/compiler/file-system';
import { PROJECT_DIR, PACKAGES_DIR } from './paths';
import { parsePackageUrl } from '../../cli/src/core/package-url';

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

function parseGitHubUrl(url: string) {
  const loc = parsePackageUrl(url);
  const m = loc.gitUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`Only GitHub repositories can be installed in the browser: ${url}`);
  return { owner: m[1], repo: m[2], ref: loc.ref, subdir: loc.subdir, candidates: loc.candidates };
}

async function getJson(url: string) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r.json();
}

// Fetch a package (and, recursively, its dependencies) into packages/<name>.
// Returns the names of the installed packages.
export async function installPackage(fs: MemoryFileSystem, url: string, version?: string, log: (s: string) => void = () => {}): Promise<string[]> {
  const { owner, repo, ref: urlRef, subdir: urlSubdir, candidates } = parseGitHubUrl(url);
  // Resolve the branch/tag to a commit SHA first: the raw content CDN caches
  // by URL for several minutes, so fetching by branch can serve a stale
  // version right after a push; SHA-addressed URLs are immutable. This also
  // settles where a '/'-containing branch name ends in a tree URL.
  const wanted = version ?? urlRef;
  let sha: string | undefined;
  let subdir = urlSubdir;
  for (const attempt of (version || !candidates
      ? [{ ref: wanted ?? (await getJson(`https://api.github.com/repos/${owner}/${repo}`)).default_branch, subdir: subdir ?? '' }]
      : candidates)) {
    try {
      sha = (await getJson(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(attempt.ref)}`)).sha;
      subdir = attempt.subdir || undefined;
      break;
    } catch { /* not a branch/tag: try the next split */ }
  }
  if (!sha) throw new Error(`Cannot resolve a branch or tag in ${url}.`);
  const tree = await getJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
  if (subdir && !tree.tree.some((e: any) => e.path === `${subdir}/bsconfig.json`)) {
    throw new Error(`No bsconfig.json under ${subdir} of ${owner}/${repo}@${sha.slice(0, 7)}.`);
  }
  const ref = sha;
  log(`Fetching ${owner}/${repo}@${sha.slice(0, 7)}${subdir ? `/${subdir}` : ''}...`);
  const prefix = subdir ? `${subdir}/` : '';
  const files: { path: string }[] = tree.tree
    .filter((e: any) => e.type === 'blob' && !e.path.startsWith('.git') && e.path.startsWith(prefix))
    .map((e: any) => ({ path: e.path.slice(prefix.length) }));
  if (files.length === 0) throw new Error(`No files found under ${subdir ?? 'the repository root'} of ${owner}/${repo}@${ref}.`);
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${prefix}`;
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
