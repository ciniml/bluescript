// Package locations. A package is a git repository or a directory inside one:
//   https://github.com/owner/repo.git              whole repository
//   https://github.com/owner/repo.git#pkg/dir      directory of the default branch
//   https://github.com/owner/repo/tree/<ref>/<dir> GitHub tree URL (ref included)
export type PackageLocation = {
    gitUrl: string,      // clonable URL (no fragment)
    subdir?: string,     // directory inside the repository holding bsconfig.json
    ref?: string,        // branch or tag from a tree URL
    // A tree URL cannot tell where a branch name with '/' ends and the
    // directory begins; these are the possible (ref, subdir) splits, most
    // likely first. Consumers try them until one exists.
    candidates?: { ref: string, subdir: string }[],
};

// All (ref, subdir) splits of the part after /tree/, shortest ref first.
function treeCandidates(rest: string): { ref: string, subdir: string }[] {
    const parts = rest.split('/');
    const out: { ref: string, subdir: string }[] = [];
    for (let i = 1; i < parts.length; i++) {
        out.push({ ref: parts.slice(0, i).join('/'), subdir: parts.slice(i).join('/') });
    }
    return out;
}

export function parsePackageUrl(url: string): PackageLocation {
    const tree = url.match(/^(https:\/\/[^/]+\/[^/]+\/[^/]+?)(?:\.git)?\/tree\/(.+?)\/?$/);
    if (tree) {
        const candidates = treeCandidates(tree[2]);
        const first = candidates[0] ?? { ref: tree[2], subdir: '' };
        return { gitUrl: `${tree[1]}.git`, ref: first.ref, subdir: first.subdir || undefined, candidates };
    }
    const hash = url.indexOf('#');
    if (hash >= 0) {
        const subdir = url.slice(hash + 1).replace(/^\/+|\/+$/g, '');
        return { gitUrl: url.slice(0, hash), subdir: subdir.length > 0 ? subdir : undefined };
    }
    return { gitUrl: url };
}
