#include <string.h>
#include <stdio.h>
#include "utils.h"
#include "memory.h"
#include "../include/protocol.h"
#include "../include/c-runtime.h"
#include "../include/main-thread.h"


#define PROTOCOL_LEN 1

typedef enum {
    PROTOCOL_NONE = 0x00,
    PROTOCOL_LOAD,
    PROTOCOL_JUMP,
    PROTOCOL_RESET,

    PROTOCOL_LOG,
    PROTOCOL_ERROR,
    PROTOCOL_MEMINFO,
    PROTOCOL_EXECTIME,
    PROTOCOL_PROFILE,
    PROTOCOL_REBOOT,
    PROTOCOL_SET_NAME,

    PROTOCOL_END
} protocol_t;

// Restart the board. Provided by the port; the default does nothing.
__attribute__((weak)) void bs_board_reboot(void) {}

// SHA-256 of the firmware ELF. Provided by the port; the default reports zeros.
__attribute__((weak)) void bs_board_get_firmware_sha256(uint8_t out[32]) { memset(out, 0, 32); }

// Persist and apply a new device name. Provided by the port; default: ignore.
__attribute__((weak)) void bs_board_set_device_name(const char* name) { (void)name; }

// Functions whose addresses are reported to the host so that it can verify
// that its copy of the firmware ELF matches the board (see tools/firmware-id.ts).
extern void bs_stdmodule_main();
static void* const sentinel_symbols[] = {
    (void*)bs_stdmodule_main, (void*)bs_protocol_write_log, (void*)try_and_catch,
};
#define SENTINEL_COUNT (sizeof(sentinel_symbols) / sizeof(sentinel_symbols[0]))
#define BS_PROTOCOL_VERSION 2


static void send_buffer(uint8_t* buffer, uint32_t len) {
#ifdef BS_PROTOCL_USE_BLUETOOTH
    bs_ble_send_buffer(buffer, len);
#endif
}

void bs_protocol_init(void) {
#ifdef BS_PROTOCL_USE_BLUETOOTH
    bs_ble_init();
#endif
}

void bs_protocol_write_log(char* message) {
    uint32_t len = strlen(message);
    uint32_t buffer_len = PROTOCOL_LEN + len + sizeof(uint8_t); // size of null
    uint8_t* buffer = (uint8_t*)malloc(buffer_len);
    if (buffer != NULL) {
        buffer[0] = PROTOCOL_LOG;
        strcpy((char*)(buffer + PROTOCOL_LEN), message);
        send_buffer(buffer, buffer_len);
        free(buffer);
    } else {
        BS_LOG_ERROR("Could not get buffer.")
    }
}

void bs_protocol_write_error(char* message) {
    uint32_t len = strlen(message);
    uint32_t buffer_len = PROTOCOL_LEN + len + sizeof(uint8_t); // size of null
    uint8_t* buffer = (uint8_t*)malloc(buffer_len);
    if (buffer != NULL) {
        buffer[0] = PROTOCOL_ERROR;
        strcpy((char*)(buffer + PROTOCOL_LEN), message);
        send_buffer(buffer, buffer_len);
        free(buffer);
    } else {
        BS_LOG_ERROR("Could not get buffer.");
    }
}

void bs_protocol_write_profile(uint8_t fid, char* profile) {
    uint32_t len = strlen(profile);
    uint32_t buffer_len = PROTOCOL_LEN + sizeof(uint8_t) + len + sizeof(uint8_t); // size of fid + len + size of null
    uint8_t* buffer = (uint8_t*)malloc(buffer_len);
    if (buffer != NULL) {
        buffer[0] = PROTOCOL_PROFILE;
        buffer[1] = fid;
        strcpy((char*)(buffer + PROTOCOL_LEN + sizeof(uint8_t)), profile);
        send_buffer(buffer, buffer_len);
        free(buffer);
    } else {
        BS_LOG_ERROR("Could not get buffer.");
    }   
}

void bs_protocol_write_execution_time(int32_t id, float time) {
    uint32_t buffer_len = PROTOCOL_LEN + sizeof(int32_t*) + sizeof(float);
    uint8_t* buffer = (uint8_t*)malloc(buffer_len);
    if (buffer != NULL) {
        buffer[0] = PROTOCOL_EXECTIME;
        *(int32_t*)(buffer+1) = id;
        *(float*)(buffer+5) = time;
        send_buffer(buffer, buffer_len);
        free(buffer);
    } else {
        BS_LOG_ERROR("Could not get buffer.");
    }
}

void bs_protocol_write_memory_layout(bs_memory_layout_t* layout) {
    // layout(32) + sha256(32) + protocol version(1) + sentinel count(1) + sentinel addresses
    uint32_t buffer_len = PROTOCOL_LEN + sizeof(bs_memory_layout_t) + 32 + 1 + 1 + 4 * SENTINEL_COUNT;
    uint8_t* buffer = (uint8_t*)malloc(buffer_len);
    if (buffer != NULL) {
        buffer[0] = PROTOCOL_MEMINFO;
        *(uint32_t*)(buffer+ 1) = (uint32_t)layout->iram_address;
        *(uint32_t*)(buffer+ 5) = layout->iram_size;
        *(uint32_t*)(buffer+ 9) = (uint32_t)layout->dram_address;
        *(uint32_t*)(buffer+13) = layout->dram_size;
        *(uint32_t*)(buffer+17) = (uint32_t)layout->iflash_address;
        *(uint32_t*)(buffer+21) = layout->iflash_size;
        *(uint32_t*)(buffer+25) = (uint32_t)layout->dflash_address;
        *(uint32_t*)(buffer+29) = layout->dflash_size;
        bs_board_get_firmware_sha256(buffer + 33);
        buffer[65] = BS_PROTOCOL_VERSION;
        buffer[66] = SENTINEL_COUNT;
        for (uint32_t i = 0; i < SENTINEL_COUNT; i++) {
            uint32_t addr = (uint32_t)sentinel_symbols[i];
            memcpy(buffer + 67 + 4 * i, &addr, 4);
        }
        send_buffer(buffer, buffer_len);
        free(buffer);
    } else {
        BS_LOG_ERROR("Could not get buffer.");
    }
}

void bs_protocol_read(uint8_t* buffer, uint32_t len) {
    int idx = 0;
    while (idx < len) {
        switch (buffer[idx]) {
        case PROTOCOL_LOAD:
        // | cmd(1byte) | address(4byte) | size(4byte) | data(size) |
        {
            // uint32_t address = *(uint32_t*)(buffer + (idx+1));
            void* address = *(void**)(buffer + (idx+1)); 
            uint32_t size = *(uint32_t*)(buffer + (idx+5));
            BS_LOG_INFO("Load %d bytes to %p", (int)size, address);
            bs_memory_memcpy(address, buffer + (idx+9), size);
            idx += (9 + size);
            break;
        }
        case PROTOCOL_JUMP:
        // | cmd(1byte) | id(4byte) | address(4byte) |
        {
            int32_t id = *(int32_t*)(buffer + (idx+1));
            void* address = *(void**)(buffer + (idx+5));
            bs_main_thread_set_main(id, address);
            idx += 9;
            break;
        }
        case PROTOCOL_RESET:
        // | cmd (1byte) | 
        {
            // Abort a running program so that the main thread can process the reset.
            bs_interrupt_requested = 1;
            bs_main_thread_reset();
            idx += 1;
            break;
        }
        case PROTOCOL_SET_NAME:
        // | cmd(1byte) | len(1byte) | utf-8 name(len bytes) |
        {
            uint8_t name_len = buffer[idx + 1];
            char name[64];
            if (name_len >= sizeof(name)) name_len = sizeof(name) - 1;
            memcpy(name, buffer + idx + 2, name_len);
            name[name_len] = '\0';
            BS_LOG_INFO("Set device name: %s", name);
            bs_board_set_device_name(name);
            idx += 2 + buffer[idx + 1];
            break;
        }
        case PROTOCOL_REBOOT:
        // | cmd(1byte) |
        // Handled here, in the communication task, so that it works even when
        // the main thread is stuck in a program that cannot be interrupted.
            BS_LOG_INFO("Reboot requested by the host");
            bs_board_reboot();
            return;
        case PROTOCOL_END:
        // | cmd(1byte) |
            return;
        default:
            return;
        }
    }
}