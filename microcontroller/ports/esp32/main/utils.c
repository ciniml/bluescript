#include <stdio.h>
#include <stdarg.h>

#include "esp_timer.h"
#include "esp_system.h"
#include "esp_app_desc.h"
#include <string.h>
#include "protocol.h"

#include "./include/utils.h"


int64_t bs_timer_get_time_us() {
    return esp_timer_get_time();
}

void bs_log_write_info(char* format, ...) {
#ifdef BS_SHOW_LOG
    va_list args;
    printf("\x1b[32m[INFO] ");
    va_start(args, format);
    vprintf(format, args);
    va_end(args);
    printf("\x1b[39m\n");
#endif
}

void bs_log_write_error(char* format, ...) {
#ifdef BS_SHOW_LOG
    va_list args;
    printf("\x1b[31m[ERROR] ");
    va_start(args, format);
    vprintf(format, args);
    va_end(args);
    printf("\x1b[39m\n");
#endif
}
// REBOOT command: restart the chip (clean restart, not a panic).
void bs_board_reboot(void) {
    fflush(stdout);
    esp_restart();
}

// SHA-256 of the firmware ELF, as recorded in the app descriptor by esptool.
void bs_board_get_firmware_sha256(uint8_t out[32]) {
    memcpy(out, esp_app_get_description()->app_elf_sha256, 32);
}
