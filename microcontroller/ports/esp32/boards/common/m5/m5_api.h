// C interface to M5Unified for the BlueScript built-in module (std-module.bs).
// The functions are implemented in C++ (m5_api.cpp) and linked into the firmware,
// so programs can use them without compiling any C++.
#ifndef __BS_M5_API__
#define __BS_M5_API__

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void bs_m5_begin(void);
void bs_m5_update(void);
// Name of the detected board: "AtomS3", "AtomS3Lite", "AtomS3R", ... ("unknown" otherwise).
const char* bs_m5_board_name(void);

// Display (no-ops on boards without a display)
bool bs_m5_display_available(void);
int32_t bs_m5_display_width(void);
int32_t bs_m5_display_height(void);
void bs_m5_display_clear(uint32_t rgb888);
void bs_m5_display_set_brightness(int32_t level);
void bs_m5_display_set_cursor(int32_t x, int32_t y);
void bs_m5_display_set_text_size(int32_t size);
void bs_m5_display_set_text_color(uint32_t rgb888, uint32_t bg_rgb888);
void bs_m5_display_print(const char* text);
void bs_m5_display_draw_pixel(int32_t x, int32_t y, uint32_t rgb888);
void bs_m5_display_fill_rect(int32_t x, int32_t y, int32_t w, int32_t h, uint32_t rgb888);
void bs_m5_display_draw_rect(int32_t x, int32_t y, int32_t w, int32_t h, uint32_t rgb888);
void bs_m5_display_draw_line(int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t rgb888);
void bs_m5_display_fill_circle(int32_t x, int32_t y, int32_t r, uint32_t rgb888);

// Button A (the button under / on the front of the Atom)
bool bs_m5_btn_is_pressed(void);
bool bs_m5_btn_was_pressed(void);
bool bs_m5_btn_was_released(void);
bool bs_m5_btn_pressed_for(int32_t ms);

// Touch screen (CoreS3 and other touch-capable boards; count is 0 elsewhere).
// Call bs_m5_update() to refresh the state.
int32_t bs_m5_touch_count(void);
int32_t bs_m5_touch_x(int32_t index);
int32_t bs_m5_touch_y(int32_t index);
bool bs_m5_touch_is_pressed(int32_t index);

// Internal I2C bus (the one M5Unified manages: PMIC, IMU, base-board chips).
// Register-oriented accessors; return false / -1 on bus errors.
bool bs_m5_i2c_write_reg8(int32_t addr, int32_t reg, int32_t value, int32_t freq);
int32_t bs_m5_i2c_read_reg8(int32_t addr, int32_t reg, int32_t freq);
// Reads `len` (<= 4) big-endian bytes of a register into one integer.
int32_t bs_m5_i2c_read_reg(int32_t addr, int32_t reg, int32_t len, int32_t freq);
bool bs_m5_i2c_write_reg16(int32_t addr, int32_t reg, int32_t value, int32_t freq);

// RGB LED (AtomS3 Lite; no-op on boards without one)
bool bs_m5_led_available(void);
void bs_m5_led_set(int32_t r, int32_t g, int32_t b);

// IMU (AtomS3 / AtomS3R); returns false when no IMU is present
bool bs_m5_imu_available(void);
bool bs_m5_imu_read_accel(float* x, float* y, float* z);
bool bs_m5_imu_read_gyro(float* x, float* y, float* z);

#ifdef __cplusplus
}
#endif

#endif /* __BS_M5_API__ */
