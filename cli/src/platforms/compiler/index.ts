import { GlobalConfigHandler } from "../../config/global-config";
import { ProjectConfigHandler } from "../../config/project-config";
import { BoardName, isEsp32FamilyBoard } from "../../config/board-utils";
import { CompilerAdapter } from "../compiler/compiler-adapter";
import { Esp32CompilerAdapter } from "../compiler/esp32-compiler-adapter";
import { HostCompilerAdapter } from "../compiler/host-compiler-adapter";
import { Esp32ClangCompilerAdapter } from "../compiler/esp32-clang-compiler-adapter";
import { isEsp32BundleBoardConfig } from "../../config/global-config";

export { CompilerAdapter, CompileContext } from "../compiler/compiler-adapter";


export function getCompilerAdapter(
    boardName: BoardName,
    globalConfigHandler: GlobalConfigHandler,
    projectConfigHandler: ProjectConfigHandler,
): CompilerAdapter {
    if (isEsp32FamilyBoard(boardName)) {
        const boardConfig = globalConfigHandler.getBoardConfig(boardName);
        if (boardConfig && isEsp32BundleBoardConfig(boardConfig)) {
            return new Esp32ClangCompilerAdapter(globalConfigHandler, projectConfigHandler, boardName);
        }
        return new Esp32CompilerAdapter(globalConfigHandler, projectConfigHandler, boardName);
    }
    if (boardName === 'host') {
        return new HostCompilerAdapter(globalConfigHandler, projectConfigHandler);
    }
    throw new Error(`Unsupported board name: ${boardName}`);
}