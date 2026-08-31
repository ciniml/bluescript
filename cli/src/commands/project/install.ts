import { Command } from "commander";
import { logger } from "../../core/logger";
import { ProjectConfigHandler, PackageSource ,PROJECT_DEFAULT_PATHS } from "../../config/project-config";
import { parsePackageUrl } from "../../core/package-url";
import { cwd, simpleExec } from "../../core/command-exec";
import * as fs from '../../core/fs';
import * as path from 'path';
import { CommandHandlerWithUpdateCheck } from "../command";
import { GLOBAL_SETTINGS } from "../../config/constants";


class InstallationHandler extends CommandHandlerWithUpdateCheck {
    private projectConfigHandler: ProjectConfigHandler;
    private projectRootDir: string;
    private packagesDir: string;

    constructor() {
        super();
        this.projectRootDir = cwd();
        this.projectConfigHandler = ProjectConfigHandler.load(this.projectRootDir);
        this.packagesDir = path.join(this.projectRootDir, PROJECT_DEFAULT_PATHS.PACKAGES_DIR);
        if (!this.globalConfigHandler.isBoardSetup(this.projectConfigHandler.getBoardName())) {
            throw new Error(`The environment for ${this.projectConfigHandler.getBoardName()} is not set up.`);
        }
    }

    public async installAll() {
        this.ensurePackageDir();
        await this.processInstallQueue(this.projectConfigHandler.getDepenencies());
    }

    public async installPackage(url: string, version?: string) {
        this.ensurePackageDir();
        const packageConfigHandler = await this.downloadPackage(url, version);
        const packageName = packageConfigHandler.getConfig().projectName;
        await this.processInstallQueue(packageConfigHandler.getDepenencies());
        this.projectConfigHandler.addDependency({name: packageName, url, version});
        this.projectConfigHandler.save(this.projectRootDir);
    }

    private async processInstallQueue(queue: PackageSource[]) {
        const installedPackages = new Set<string>();

        while (queue.length > 0) {
            const currentPkg = queue.shift();
            if (!currentPkg) break;
            if (installedPackages.has(currentPkg.name)) continue;

            const pkgConfigHandler = await this.downloadPackage(currentPkg.url, currentPkg.version);
            pkgConfigHandler.checkBoardName(this.projectConfigHandler.getBoardName());
            installedPackages.add(currentPkg.name);
            for (const pkgDep of pkgConfigHandler.getDepenencies()) {
                if (!installedPackages.has(pkgDep.name)) {
                    queue.push(pkgDep);
                }
            }
        }
    }

    private ensurePackageDir() {
        if (!fs.exists(this.packagesDir)) {
            fs.makeDir(this.packagesDir);
        }
    }

    private async downloadPackage(url: string, version?: string): Promise<ProjectConfigHandler> {
        logger.log(`Downloading from ${url}...`);
        const location = parsePackageUrl(url);
        const tmpDir = path.join(GLOBAL_SETTINGS.BLUESCRIPT_DIR, 'tmp-package');
        // A tree URL is ambiguous when the branch name contains '/'; try each split.
        const attempts = version ? [{ ref: version, subdir: location.subdir ?? '' }]
            : location.candidates ?? [{ ref: location.ref ?? '', subdir: location.subdir ?? '' }];
        try {
            let cloned = false;
            let lastError: unknown;
            for (const attempt of attempts) {
                if (fs.exists(tmpDir)) fs.removeDir(tmpDir);
                const branchArgs = attempt.ref ? ['--branch', attempt.ref] : [];
                try {
                    await simpleExec('git', ['clone', '--depth', '1', ...branchArgs, location.gitUrl, tmpDir]);
                } catch (e) {
                    lastError = e;
                    continue;
                }
                if (!attempt.subdir || fs.exists(path.join(tmpDir, attempt.subdir, 'bsconfig.json'))) {
                    location.subdir = attempt.subdir || undefined;
                    cloned = true;
                    break;
                }
            }
            if (!cloned) {
                throw lastError ?? new Error('no matching branch/directory combination');
            }
            const gitDir = path.join(tmpDir, '.git');
            if (fs.exists(gitDir)) {
                fs.removeDir(gitDir);
            }
            // The package may live in a directory of the repository.
            const packageRoot = location.subdir ? path.join(tmpDir, location.subdir) : tmpDir;
            if (!fs.exists(path.join(packageRoot, 'bsconfig.json'))) {
                throw new Error(`No bsconfig.json in ${location.subdir ?? 'the repository root'}.`);
            }
            const configHandler = ProjectConfigHandler.load(packageRoot);
            const packageName = configHandler.getConfig().projectName;
            const packageDir = path.join(this.packagesDir, packageName);
            if (fs.exists(packageDir)) {
                fs.removeDir(packageDir);
            }
            fs.moveDir(packageRoot, packageDir);
            if (fs.exists(tmpDir)) {
                fs.removeDir(tmpDir);
            }
            return ProjectConfigHandler.load(packageDir);
        } catch (error) {
            if (fs.exists(tmpDir)) {
                fs.removeDir(tmpDir);
            }
            throw new Error(`Failed to download package from '${url}'.`, {cause: error});
        }
  }
}


export async function handleInstallCommand(url: string|undefined, options: {tag?: string}) {
    try {
        const installationHandler = new InstallationHandler();
        if (url) {
            await installationHandler.installPackage(url, options.tag);
        } else {
            await installationHandler.installAll();
        }
    } catch (error) {
        const errorMessage = 
            url ? `Failed to install ${url}.` : `Failed to install packages.`;
        logger.error(errorMessage);
        logger.showError(error);
        process.exit(1);
    }
}

export function registerInstallCommand(program: Command) {
    program
        .command('install')
        .description('install all dependencies, or add a new package via Git URL')
        .argument('[git-url]', 'git repository URL to add as a dependency')
        .option('-t, --tag <tag>', 'git tag or branch to checkout (e.g., v1.0.0)')
        .action(handleInstallCommand);
}
