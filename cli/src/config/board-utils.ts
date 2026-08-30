import { Esp32Target } from '@bscript/lang';

export const BOARD_NAMES = ['esp32', 'esp32s3', 'm5stack-atoms3', 'host'] as const;
export type BoardName = (typeof BOARD_NAMES)[number];
export const isValidBoard = (board: string): board is BoardName => (BOARD_NAMES as readonly string[]).includes(board);

// Boards of the ESP32 family. They share the same ESP-IDF installation and the
// same runtime port (microcontroller/ports/esp32), but differ in chip target
// and, for boards such as m5stack-atoms3, in firmware components.
export const ESP32_FAMILY_BOARD_NAMES = ['esp32', 'esp32s3', 'm5stack-atoms3'] as const;
export type Esp32FamilyBoardName = (typeof ESP32_FAMILY_BOARD_NAMES)[number];
export const isEsp32FamilyBoard = (board: string): board is Esp32FamilyBoardName =>
    (ESP32_FAMILY_BOARD_NAMES as readonly string[]).includes(board);

// Chip target of each board.
export const ESP32_BOARD_TARGETS: Record<Esp32FamilyBoardName, Esp32Target> = {
    esp32: 'esp32',
    esp32s3: 'esp32s3',
    'm5stack-atoms3': 'esp32s3',   // AtomS3 / AtomS3 Lite / AtomS3R (M5Unified, board detected at runtime)
};
export const esp32TargetOf = (board: Esp32FamilyBoardName): Esp32Target => ESP32_BOARD_TARGETS[board];
