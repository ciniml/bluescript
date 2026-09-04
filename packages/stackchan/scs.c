// SPDX-FileCopyrightText: 2026 Kenta IDA <fuga@fugafuga.org>
// SPDX-License-Identifier: BSL-1.0
// C port of scs_bus.cpp / scs_servo.cpp from stackchan-idf.
#include <string.h>
#include "driver/uart.h"
#include "esp_ipc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "scs.h"

#define SCS_UART        UART_NUM_1
#define SCS_TIMEOUT_MS  20
#define SCS_MAX_PARAMS  32

#define SCS_INST_PING   0x01
#define SCS_INST_READ   0x02
#define SCS_INST_WRITE  0x03
#define SCS_REG_TORQUE_ENABLE        0x28
#define SCS_REG_GOAL_POSITION_LOW    0x2A
#define SCS_REG_PRESENT_POSITION_LOW 0x38

static bool s_ready = false;
static bool s_echo_cancel = false;
static int32_t s_baud = 1000000;
static int s_last_send_err = 0;   // 0 ok; 1 not ready; 2 short write; 3 tx-done; 4 echo timeout

static void scs_install_on_core(void* arg) {
    *(esp_err_t*)arg = uart_driver_install(SCS_UART, 256, 0, 0, NULL, 0);
}

static uint8_t scs_checksum(const uint8_t* bytes, int len) {
    uint32_t sum = 0;
    for (int i = 0; i < len; i++) sum += bytes[i];
    return (uint8_t)~sum;
}

int32_t scs_begin_ex(int32_t tx_pin, int32_t rx_pin, int32_t baud, bool echo_cancel, int32_t* err) {
    if (err) *err = 0;
    if (s_ready) {
        uart_driver_delete(SCS_UART);
        s_ready = false;
    }
    const uart_config_t cfg = {
        .baud_rate = (int)baud,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .rx_flow_ctrl_thresh = 0,
        .source_clk = UART_SCLK_DEFAULT,
    };
    esp_err_t e = uart_driver_install(SCS_UART, 256, 0, 0, NULL, 0);
    if (e == ESP_ERR_NOT_FOUND) {
        // No free interrupt slot on this core (the main thread and the BLE
        // stack are both pinned to core 0 in this firmware). Interrupts are
        // allocated on the calling core, so install the driver from core 1.
        e = ESP_FAIL;
        esp_ipc_call_blocking(1, scs_install_on_core, &e);
    }
    if (e != ESP_OK) { if (err) *err = e; return 1; }
    e = uart_param_config(SCS_UART, &cfg);
    if (e != ESP_OK) { if (err) *err = e; uart_driver_delete(SCS_UART); return 2; }
    e = uart_set_pin(SCS_UART, tx_pin, rx_pin, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    if (e != ESP_OK) { if (err) *err = e; uart_driver_delete(SCS_UART); return 3; }
    s_echo_cancel = echo_cancel;
    s_baud = baud;
    s_ready = true;
    return 0;
}

bool scs_begin(int32_t tx_pin, int32_t rx_pin, int32_t baud, bool echo_cancel) {
    return scs_begin_ex(tx_pin, rx_pin, baud, echo_cancel, 0) == 0;
}

// Sends | 0xFF 0xFF | id | len | instruction | params... | checksum |.
static bool scs_send(int32_t id, uint8_t instruction, const uint8_t* params, int nparams) {
    s_last_send_err = 1;
    if (!s_ready || nparams > SCS_MAX_PARAMS) return false;
    uint8_t tx[SCS_MAX_PARAMS + 6];
    tx[0] = 0xFF; tx[1] = 0xFF;
    tx[2] = (uint8_t)id;
    tx[3] = (uint8_t)(nparams + 2);      // instruction + params + checksum
    tx[4] = instruction;
    if (nparams > 0) memcpy(tx + 5, params, nparams);
    tx[5 + nparams] = scs_checksum(tx + 2, 3 + nparams);
    const int total = 6 + nparams;
    uart_flush_input(SCS_UART);
    s_last_send_err = 2;
    if (uart_write_bytes(SCS_UART, tx, total) != total) return false;
    if (uart_wait_tx_done(SCS_UART, pdMS_TO_TICKS(SCS_TIMEOUT_MS)) != ESP_OK) {
        // The TX-done notification depends on the driver ISR; if it does not
        // arrive, fall back to waiting the wire time out (10 bits per byte).
        s_last_send_err = 3;   // recorded but not fatal
        uint32_t us = ((uint32_t)total * 10u * 1000000u) / (uint32_t)s_baud + 200u;
        vTaskDelay(pdMS_TO_TICKS(us / 1000u + 1u));
    }
    if (s_echo_cancel) {
        uint8_t echo[SCS_MAX_PARAMS + 6];
        s_last_send_err = 4;
        if (uart_read_bytes(SCS_UART, echo, total, pdMS_TO_TICKS(SCS_TIMEOUT_MS)) != total) return false;
    }
    s_last_send_err = 0;
    return true;
}

// Sends a request and reads the status packet; the data field goes to `data`.
// The servo's error flags land in *err_out (may be NULL); flags alone do not
// fail the transaction — the servo is present and talking either way.
static int scs_transact_ex(int32_t id, uint8_t instruction, const uint8_t* params, int nparams,
                           uint8_t* data, int data_capacity, uint8_t* err_out) {
    if (!scs_send(id, instruction, params, nparams)) return -1;
    const TickType_t ticks = pdMS_TO_TICKS(SCS_TIMEOUT_MS);
    // Resync on the FF FF marker in case stray bytes precede the frame.
    uint8_t header[4];
    int have = 0;
    for (int scanned = 0; scanned < 16; scanned++) {
        if (uart_read_bytes(SCS_UART, header + have, 1, ticks) != 1) return -1;
        if (have < 2) {
            if (header[have] == 0xFF) have++; else have = 0;
        } else if (++have == 4) break;
    }
    if (have != 4 || header[2] != (uint8_t)id) return -1;
    const int length = header[3];
    if (length < 2) return -1;
    const int data_len = length - 2;     // minus the error byte and the checksum
    if (data_len > data_capacity) return -1;
    uint8_t err;
    if (uart_read_bytes(SCS_UART, &err, 1, ticks) != 1) return -1;
    if (data_len > 0 && uart_read_bytes(SCS_UART, data, data_len, ticks) != data_len) return -1;
    uint8_t checksum;
    if (uart_read_bytes(SCS_UART, &checksum, 1, ticks) != 1) return -1;
    if (err_out) *err_out = err;
    return data_len;
}

static int scs_transact(int32_t id, uint8_t instruction, const uint8_t* params, int nparams,
                        uint8_t* data, int data_capacity) {
    uint8_t err = 0;
    int n = scs_transact_ex(id, instruction, params, nparams, data, data_capacity, &err);
    if (n >= 0 && (err & 0x7F) != 0) return -1;
    return n;
}

bool scs_ping(int32_t id) {
    // Any well-formed status frame proves the servo is on the bus, even if
    // it is flagging an error (undervoltage etc.).
    uint8_t scratch[4];
    return scs_transact_ex(id, SCS_INST_PING, NULL, 0, scratch, sizeof(scratch), NULL) >= 0;
}

// -1/-1x = send failed, -2 = silent, big positive = unparsed bytes,
// otherwise the servo's error-flag byte (0 = healthy).
int32_t scs_ping_status(int32_t id) {
    uint8_t scratch[4];
    uint8_t err = 0;
    if (scs_transact_ex(id, SCS_INST_PING, NULL, 0, scratch, sizeof(scratch), &err) < 0)
        return scs_ping_ex(id);
    return err;
}

int32_t scs_ping_ex(int32_t id) {
    if (!scs_send(id, SCS_INST_PING, NULL, 0)) return -10 - s_last_send_err;
    uint8_t rx[16];
    int total = 0;
    // Collect whatever shows up within ~60 ms.
    for (int i = 0; i < 3 && total < (int)sizeof(rx); i++) {
        int n = uart_read_bytes(SCS_UART, rx + total, sizeof(rx) - total, pdMS_TO_TICKS(20));
        if (n > 0) total += n;
    }
    if (total == 0) return -2;
    if (total >= 6 && rx[0] == 0xFF && rx[1] == 0xFF && rx[2] == (uint8_t)id) return rx[4];
    return ((int32_t)total << 16) | ((int32_t)rx[0] << 8) | (total > 1 ? rx[1] : 0);
}

bool scs_enable_torque(int32_t id, bool on) {
    const uint8_t params[2] = {SCS_REG_TORQUE_ENABLE, on ? 1 : 0};
    uint8_t scratch[4];
    return scs_transact(id, SCS_INST_WRITE, params, 2, scratch, sizeof(scratch)) >= 0;
}

bool scs_write_goal_position(int32_t id, int32_t raw, int32_t time_ms, int32_t speed) {
    const uint8_t params[7] = {
        SCS_REG_GOAL_POSITION_LOW,
        (uint8_t)((raw >> 8) & 0xFF), (uint8_t)(raw & 0xFF),
        (uint8_t)((time_ms >> 8) & 0xFF), (uint8_t)(time_ms & 0xFF),
        (uint8_t)((speed >> 8) & 0xFF), (uint8_t)(speed & 0xFF),
    };
    uint8_t scratch[4];
    return scs_transact(id, SCS_INST_WRITE, params, 7, scratch, sizeof(scratch)) >= 0;
}

int32_t scs_read_present_position(int32_t id) {
    const uint8_t params[2] = {SCS_REG_PRESENT_POSITION_LOW, 2};
    uint8_t data[4];
    const int n = scs_transact(id, SCS_INST_READ, params, 2, data, sizeof(data));
    if (n < 2) return -1;
    return ((int32_t)data[0] << 8) | data[1];
}
