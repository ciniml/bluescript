// M5Unified glue for the BlueScript runtime (see include/m5_api.h).
#include <M5Unified.h>
#include "led_strip.h"
#include "esp_log.h"
#include "m5_api.h"

static const char* TAG = "BS_M5";
static bool s_begun = false;
static led_strip_handle_t s_led = nullptr;

// AtomS3 Lite: WS2812 on GPIO35 (not driven by M5Unified).
#define ATOMS3_LITE_LED_GPIO 35

static void led_init_if_needed() {
    if (s_led != nullptr || M5.getBoard() != m5::board_t::board_M5AtomS3Lite) return;
    led_strip_config_t strip = {};
    strip.strip_gpio_num = ATOMS3_LITE_LED_GPIO;
    strip.max_leds = 1;
    strip.led_model = LED_MODEL_WS2812;
    strip.color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB;
    led_strip_rmt_config_t rmt = {};
    rmt.resolution_hz = 10 * 1000 * 1000;
    if (led_strip_new_rmt_device(&strip, &rmt, &s_led) != ESP_OK) {
        ESP_LOGW(TAG, "failed to initialize the RGB LED");
        s_led = nullptr;
    }
}

extern "C" {

void bs_m5_begin(void) {
    if (s_begun) return;
    auto cfg = M5.config();
    M5.begin(cfg);
    s_begun = true;
    led_init_if_needed();
    ESP_LOGI(TAG, "M5Unified started: board %d", (int)M5.getBoard());
}

void bs_m5_update(void) { if (s_begun) M5.update(); }

const char* bs_m5_board_name(void) {
    switch (M5.getBoard()) {
        case m5::board_t::board_M5AtomS3: return "AtomS3";
        case m5::board_t::board_M5AtomS3Lite: return "AtomS3Lite";
        case m5::board_t::board_M5AtomS3R: return "AtomS3R";
        case m5::board_t::board_M5AtomS3U: return "AtomS3U";
        default: return "unknown";
    }
}

static inline uint32_t rgb(uint32_t c) { return M5.Display.color888((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff); }

bool bs_m5_display_available(void) { return s_begun && M5.Display.width() > 0; }
int32_t bs_m5_display_width(void) { return M5.Display.width(); }
int32_t bs_m5_display_height(void) { return M5.Display.height(); }
void bs_m5_display_clear(uint32_t c) { M5.Display.fillScreen(rgb(c)); M5.Display.setCursor(0, 0); }
void bs_m5_display_set_brightness(int32_t level) { M5.Display.setBrightness(level < 0 ? 0 : level > 255 ? 255 : level); }
void bs_m5_display_set_cursor(int32_t x, int32_t y) { M5.Display.setCursor(x, y); }
void bs_m5_display_set_text_size(int32_t size) { M5.Display.setTextSize(size < 1 ? 1 : size); }
void bs_m5_display_set_text_color(uint32_t fg, uint32_t bg) { M5.Display.setTextColor(rgb(fg), rgb(bg)); }
void bs_m5_display_print(const char* text) { M5.Display.print(text); }
void bs_m5_display_draw_pixel(int32_t x, int32_t y, uint32_t c) { M5.Display.drawPixel(x, y, rgb(c)); }
void bs_m5_display_fill_rect(int32_t x, int32_t y, int32_t w, int32_t h, uint32_t c) { M5.Display.fillRect(x, y, w, h, rgb(c)); }
void bs_m5_display_draw_rect(int32_t x, int32_t y, int32_t w, int32_t h, uint32_t c) { M5.Display.drawRect(x, y, w, h, rgb(c)); }
void bs_m5_display_draw_line(int32_t x0, int32_t y0, int32_t x1, int32_t y1, uint32_t c) { M5.Display.drawLine(x0, y0, x1, y1, rgb(c)); }
void bs_m5_display_fill_circle(int32_t x, int32_t y, int32_t r, uint32_t c) { M5.Display.fillCircle(x, y, r, rgb(c)); }

bool bs_m5_btn_is_pressed(void) { return M5.BtnA.isPressed(); }
bool bs_m5_btn_was_pressed(void) { return M5.BtnA.wasPressed(); }
bool bs_m5_btn_was_released(void) { return M5.BtnA.wasReleased(); }
bool bs_m5_btn_pressed_for(int32_t ms) { return M5.BtnA.pressedFor(ms); }

bool bs_m5_led_available(void) { return s_led != nullptr; }
void bs_m5_led_set(int32_t r, int32_t g, int32_t b) {
    if (s_led == nullptr) return;
    led_strip_set_pixel(s_led, 0, r & 0xff, g & 0xff, b & 0xff);
    led_strip_refresh(s_led);
}

bool bs_m5_imu_available(void) { return s_begun && M5.Imu.isEnabled(); }
bool bs_m5_imu_read_accel(float* x, float* y, float* z) { return M5.Imu.isEnabled() && M5.Imu.getAccel(x, y, z); }
bool bs_m5_imu_read_gyro(float* x, float* y, float* z) { return M5.Imu.isEnabled() && M5.Imu.getGyro(x, y, z); }

} // extern "C"
