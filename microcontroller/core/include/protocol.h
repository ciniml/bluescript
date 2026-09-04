#ifndef __BS_PROTOCOL__
#define __BS_PROTOCOL__
#include <stdint.h>
#include "memory.h"
#include "ble.h"
#define CORE_TEXT_SECTION __attribute__((section(".core_text")))
#define BS_PROTOCL_USE_BLUETOOTH


void CORE_TEXT_SECTION bs_protocol_init(void);
// Port hook: restart the board (used by the REBOOT command).
void bs_board_reboot(void);
// Port hook: SHA-256 of the running firmware's ELF (zeros if unknown).
void bs_board_get_firmware_sha256(uint8_t out[32]);
// Port hook: persist and apply a new BLE device name.
void bs_board_set_device_name(const char* name);

void CORE_TEXT_SECTION bs_protocol_write_log(char* message);

void CORE_TEXT_SECTION bs_protocol_write_error(char* message);

void CORE_TEXT_SECTION bs_protocol_write_profile(uint8_t fid, char* profile);

void CORE_TEXT_SECTION bs_protocol_write_execution_time(int32_t id, float time);

void CORE_TEXT_SECTION bs_protocol_write_memory_layout(bs_memory_layout_t* layout);

void CORE_TEXT_SECTION bs_protocol_read(uint8_t* buffer, uint32_t len);

#endif /* __BS_PROTOCOL__ */