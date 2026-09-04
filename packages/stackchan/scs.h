// SPDX-FileCopyrightText: 2026 Kenta IDA <fuga@fugafuga.org>
// SPDX-License-Identifier: BSL-1.0
//
// SCS0009 serial-bus servo driver (C port of scs_servo from
// https://github.com/ciniml/stackchan-idf). One half/full-duplex UART bus,
// used by the Stack-chan head (yaw = ID 1, pitch = ID 2).
#ifndef __STACKCHAN_SCS__
#define __STACKCHAN_SCS__

#include <stdint.h>
#include <stdbool.h>

// Starts the bus on UART1. echo_cancel: true for half-duplex wirings (Takao
// base) where our own TX bytes appear on RX.
bool scs_begin(int32_t tx_pin, int32_t rx_pin, int32_t baud, bool echo_cancel);
// Like scs_begin but returns the failing step: 0 = OK, 1 = driver_install,
// 2 = param_config, 3 = set_pin. The esp_err_t of the failure is stored in
// *err when non-null.
int32_t scs_begin_ex(int32_t tx_pin, int32_t rx_pin, int32_t baud, bool echo_cancel, int32_t* err);
bool scs_ping(int32_t id);
bool scs_enable_torque(int32_t id, bool on);
// raw: 0..1023 (SCS0009, 1 step = 0.3125 deg); time in ms; speed in raw units.
bool scs_write_goal_position(int32_t id, int32_t raw, int32_t time_ms, int32_t speed);
// Returns the raw present position, or -1 on error.
int32_t scs_read_present_position(int32_t id);

#endif /* __STACKCHAN_SCS__ */
