import { GlobalConfigHandler, Esp32ClangBoardConfig, isEsp32ClangBoardConfig } from "../../config/global-config";
import { ProjectConfigHandler } from "../../config/project-config";
import { Esp32FamilyBoardName } from "../../config/board-utils";
import {
    CompilerSession, MemoryImage,
    Esp32ClangToolchain, Esp32ClangToolchainConfig, Project, PackageForEsp32
} from "@bscript/lang";
import { CompilerAdapter, CompileContext } from "./compiler-adapter";
import { createEsp32PackageReader, DUMMY_MEMORY_LAYOUTS } from "./esp32-compiler-adapter";


export class Esp32ClangCompilerAdapter implements CompilerAdapter {
    readonly boardName: Esp32FamilyBoardName;
    private boardConfig: Esp32ClangBoardConfig;
    private compiler?: CompilerSession<PackageForEsp32, MemoryImage>;

    constructor(
        private globalConfigHandler: GlobalConfigHandler,
        private projectConfigHandler: ProjectConfigHandler,
        boardName: Esp32FamilyBoardName,
    ) {
        this.boardName = boardName;
        const boardConfig = this.globalConfigHandler.getBoardConfig(boardName);
        if (boardConfig === undefined || !isEsp32ClangBoardConfig(boardConfig)) {
            throw new Error(`The clang environment for ${this.boardName} is not set up.`);
        }
        this.boardConfig = boardConfig;
    }

    async buildForCheck(): Promise<MemoryImage> {
        return this.buildProject({ memoryLayout: DUMMY_MEMORY_LAYOUTS[this.boardName] });
    }

    async buildProject(context?: CompileContext): Promise<MemoryImage> {
        const memoryLayout = context?.memoryLayout;
        if (!memoryLayout) {
            throw new Error('Memory layout is required to build an ESP32 project.');
        }
        const project = Project.load<PackageForEsp32>(
            this.projectConfigHandler.getConfig().projectName,
            createEsp32PackageReader(this.boardName, this.projectConfigHandler),
        );
        const toolchain = new Esp32ClangToolchain(this.getCompilerConfig(), memoryLayout);
        this.compiler = new CompilerSession(toolchain);
        return this.compiler.buildProject(project);
    }

    async compileFragment(src: string): Promise<MemoryImage> {
        if (!this.compiler) {
            throw new Error("Cannot compile fragment before building the project.");
        }
        return this.compiler.compileFragment(src);
    }

    private getCompilerConfig(): Esp32ClangToolchainConfig {
        return {
            bundleDir: this.boardConfig.bundleDir,
            target: this.boardName,
            toolchain: this.boardConfig.toolchain,
        };
    }
}
