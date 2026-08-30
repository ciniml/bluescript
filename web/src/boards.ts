// Runtime bundles available to the page (dist/bundles/index.json) and the
// board chosen with the ?board= query parameter (default: the first one).
export type BundleEntry = { board: string, target: string, version: string, buildTime: string };

export async function listBundles(): Promise<BundleEntry[]> {
  const r = await fetch('bundles/index.json');
  if (!r.ok) throw new Error('bundles/index.json not found: build the page with at least one runtime bundle.');
  return r.json();
}

export function selectedBoard(bundles: BundleEntry[]): BundleEntry {
  const wanted = new URLSearchParams(location.search).get('board');
  const found = bundles.find(b => b.board === wanted);
  if (wanted && !found) console.warn(`unknown board ${wanted}; using ${bundles[0]?.board}`);
  if (!found && bundles.length === 0) throw new Error('no runtime bundle is available');
  return found ?? bundles[0];
}

export function bundleUrl(entry: BundleEntry) { return `bundles/${entry.board}/`; }

export function switchBoard(board: string) {
  const url = new URL(location.href);
  url.searchParams.set('board', board);
  location.href = url.toString();
}
