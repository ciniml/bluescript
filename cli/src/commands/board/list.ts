import { Command } from "commander";
import chalk from 'chalk';
import { BOARD_NAMES } from "../../config/board-utils";
import { logger } from "../../core/logger";
import { CommandHandlerWithUpdateCheck } from "../command";


class ListHandler extends CommandHandlerWithUpdateCheck {
    list() {
        const supportedBoards = BOARD_NAMES;
        logger.log('Available boards:');
        supportedBoards.forEach(board => {
            const config = this.globalConfigHandler.getBoardConfig(board) as { toolchainType?: string } | undefined;
            const status = config === undefined
                ? chalk.gray('not set up')
                : config.toolchainType === 'clang' ? chalk.green('set up (clang, no ESP-IDF)')
                : config.toolchainType === 'wasm' ? chalk.green('set up (wasm toolchain, no ESP-IDF)') : chalk.green('set up');
            logger.log(' --', board, ` - ${status}`);
        });
    }
}

export async function handleListCommand() {
    try {
        const listHandler = new ListHandler();
        listHandler.list();

        logger.br();
        logger.info(`To set up a new board, run ${chalk.yellow('bscript board setup <board-name>')}`);

    } catch (error) {
        logger.error(`Failed to list up available board names`);
        logger.showError(error);
        process.exit(1);
    }
}

export function registerListCommand(program: Command) {
    program
        .command('list')
        .description('list up available board names')
        .action(handleListCommand);
}