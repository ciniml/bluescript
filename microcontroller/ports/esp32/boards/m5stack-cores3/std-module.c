
#include <string.h>
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "protocol.h"
#include "c-runtime.h"
#include "std-module.h"
#include "m5_api.h"

#define BUFF_SIZE 256

char buff[BUFF_SIZE];

void clear_buff() {
    memset(buff, 0, BUFF_SIZE);
}

void write_message_to_buff(value_t message) {
    if (is_int_value(message)) 
        sprintf(buff, "%d\n", (int) value_to_int(message));
    else if (is_float_value(message))
        sprintf(buff, "%f\n", value_to_float(message));
    else if (message == VALUE_NULL || message == VALUE_UNDEF)
        sprintf(buff, "undefined\n");
    else if (message == VALUE_TRUE)
        sprintf(buff, "true\n");
    else if (message == VALUE_FALSE)
        sprintf(buff, "false\n");
    else if (gc_is_string_object(message))
        snprintf(buff, sizeof(buff), "%s\n", gc_string_to_cstr(message));
    else {
        class_object* cls = gc_get_class_of(message);
        if (cls == NULL)
        sprintf(buff, "??\n");
        else
        snprintf(buff, sizeof(buff), "<class %s>\n", cls->name);
    }
    printf(buff);
}


extern struct func_body _print;
void mth_0_Console(value_t self, value_t _message);
void mth_1_Console(value_t self, value_t _message);
float mth_0_Time(value_t self);
void mth_1_Time(value_t self, int32_t _ms);
void mth_0_BuiltinGpio(value_t self, int32_t _pin, int32_t _mode);
void mth_1_BuiltinGpio(value_t self, int32_t _pin, int32_t _level);
int32_t mth_2_BuiltinGpio(value_t self, int32_t _pin);
int32_t mth_0_M5Display(value_t self);
int32_t mth_1_M5Display(value_t self);
int32_t mth_2_M5Display(value_t self);
void mth_3_M5Display(value_t self, int32_t _color);
void mth_4_M5Display(value_t self, int32_t _level);
void mth_5_M5Display(value_t self, int32_t _x, int32_t _y);
void mth_6_M5Display(value_t self, int32_t _size);
void mth_7_M5Display(value_t self, int32_t _color, int32_t _background);
void mth_8_M5Display(value_t self, value_t _text);
void mth_9_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _color);
void mth_10_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _w, int32_t _h, int32_t _color);
void mth_11_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _w, int32_t _h, int32_t _color);
void mth_12_M5Display(value_t self, int32_t _x0, int32_t _y0, int32_t _x1, int32_t _y1, int32_t _color);
void mth_13_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _r, int32_t _color);
int32_t mth_0_M5Button(value_t self);
int32_t mth_1_M5Button(value_t self);
int32_t mth_2_M5Button(value_t self);
int32_t mth_3_M5Button(value_t self, int32_t _ms);
int32_t mth_0_M5Led(value_t self);
void mth_1_M5Led(value_t self, int32_t _r, int32_t _g, int32_t _b);
void mth_2_M5Led(value_t self);
int32_t mth_0_M5Imu(value_t self);
float mth_1_M5Imu(value_t self);
float mth_2_M5Imu(value_t self);
float mth_3_M5Imu(value_t self);
int32_t mth_0_M5TouchScreen(value_t self);
int32_t mth_1_M5TouchScreen(value_t self, int32_t _index);
int32_t mth_2_M5TouchScreen(value_t self, int32_t _index);
int32_t mth_3_M5TouchScreen(value_t self, int32_t _index);
int32_t mth_0_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _value, int32_t _freq);
int32_t mth_1_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _freq);
int32_t mth_2_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _len, int32_t _freq);
int32_t mth_3_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _value, int32_t _freq);
static void cons_M5(value_t self);
value_t new_M5(value_t self);
void mth_0_M5(value_t self);
void mth_1_M5(value_t self);
value_t mth_2_M5(value_t self);
extern CLASS_OBJECT(object_class, 1);
void bs_stdmodule_main();
ROOT_SET_DECL(global_rootset0, 4);
static const uint16_t mnames_Console[] = { 8, 9, };
static const char* const msigs_Console[] = { "(a)v", "(a)v", };
static const uint16_t plist_Console[] = {  };
CLASS_OBJECT(class_Console, 2) = {
    .body = { .s = 0, .i = 0, .cn = "Console", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_Console, .unboxed_types = "" }, .mt = { .size = 2, .names = mnames_Console, .signatures = msigs_Console }, .vtbl = { mth_0_Console, mth_1_Console,  }}};
static const uint16_t mnames_Time[] = { 10, 11, };
static const char* const msigs_Time[] = { "()f", "(i)v", };
static const uint16_t plist_Time[] = {  };
CLASS_OBJECT(class_Time, 2) = {
    .body = { .s = 0, .i = 0, .cn = "Time", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_Time, .unboxed_types = "" }, .mt = { .size = 2, .names = mnames_Time, .signatures = msigs_Time }, .vtbl = { mth_0_Time, mth_1_Time,  }}};
static const uint16_t mnames_BuiltinGpio[] = { 12, 13, 14, };
static const char* const msigs_BuiltinGpio[] = { "(ii)v", "(ii)v", "(i)i", };
static const uint16_t plist_BuiltinGpio[] = {  };
CLASS_OBJECT(class_BuiltinGpio, 3) = {
    .body = { .s = 0, .i = 0, .cn = "BuiltinGpio", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_BuiltinGpio, .unboxed_types = "" }, .mt = { .size = 3, .names = mnames_BuiltinGpio, .signatures = msigs_BuiltinGpio }, .vtbl = { mth_0_BuiltinGpio, mth_1_BuiltinGpio, mth_2_BuiltinGpio,  }}};
static const uint16_t mnames_M5Display[] = { 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, };
static const char* const msigs_M5Display[] = { "()b", "()i", "()i", "(i)v", "(i)v", "(ii)v", "(i)v", "(ii)v", "(s)v", "(iii)v", "(iiiii)v", "(iiiii)v", "(iiiii)v", "(iiii)v", };
static const uint16_t plist_M5Display[] = {  };
CLASS_OBJECT(class_M5Display, 14) = {
    .body = { .s = 0, .i = 0, .cn = "M5Display", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5Display, .unboxed_types = "" }, .mt = { .size = 14, .names = mnames_M5Display, .signatures = msigs_M5Display }, .vtbl = { mth_0_M5Display, mth_1_M5Display, mth_2_M5Display, mth_3_M5Display, mth_4_M5Display, mth_5_M5Display, mth_6_M5Display, mth_7_M5Display, mth_8_M5Display, mth_9_M5Display, mth_10_M5Display, mth_11_M5Display, mth_12_M5Display, mth_13_M5Display,  }}};
static const uint16_t mnames_M5Button[] = { 29, 30, 31, 32, };
static const char* const msigs_M5Button[] = { "()b", "()b", "()b", "(i)b", };
static const uint16_t plist_M5Button[] = {  };
CLASS_OBJECT(class_M5Button, 4) = {
    .body = { .s = 0, .i = 0, .cn = "M5Button", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5Button, .unboxed_types = "" }, .mt = { .size = 4, .names = mnames_M5Button, .signatures = msigs_M5Button }, .vtbl = { mth_0_M5Button, mth_1_M5Button, mth_2_M5Button, mth_3_M5Button,  }}};
static const uint16_t mnames_M5Led[] = { 15, 33, 34, };
static const char* const msigs_M5Led[] = { "()b", "(iii)v", "()v", };
static const uint16_t plist_M5Led[] = {  };
CLASS_OBJECT(class_M5Led, 3) = {
    .body = { .s = 0, .i = 0, .cn = "M5Led", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5Led, .unboxed_types = "" }, .mt = { .size = 3, .names = mnames_M5Led, .signatures = msigs_M5Led }, .vtbl = { mth_0_M5Led, mth_1_M5Led, mth_2_M5Led,  }}};
static const uint16_t mnames_M5Imu[] = { 15, 35, 36, 37, };
static const char* const msigs_M5Imu[] = { "()b", "()f", "()f", "()f", };
static const uint16_t plist_M5Imu[] = {  };
CLASS_OBJECT(class_M5Imu, 4) = {
    .body = { .s = 0, .i = 0, .cn = "M5Imu", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5Imu, .unboxed_types = "" }, .mt = { .size = 4, .names = mnames_M5Imu, .signatures = msigs_M5Imu }, .vtbl = { mth_0_M5Imu, mth_1_M5Imu, mth_2_M5Imu, mth_3_M5Imu,  }}};
static const uint16_t mnames_M5TouchScreen[] = { 38, 39, 40, 29, };
static const char* const msigs_M5TouchScreen[] = { "()i", "(i)i", "(i)i", "(i)b", };
static const uint16_t plist_M5TouchScreen[] = {  };
CLASS_OBJECT(class_M5TouchScreen, 4) = {
    .body = { .s = 0, .i = 0, .cn = "M5TouchScreen", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5TouchScreen, .unboxed_types = "" }, .mt = { .size = 4, .names = mnames_M5TouchScreen, .signatures = msigs_M5TouchScreen }, .vtbl = { mth_0_M5TouchScreen, mth_1_M5TouchScreen, mth_2_M5TouchScreen, mth_3_M5TouchScreen,  }}};
static const uint16_t mnames_M5I2C[] = { 41, 42, 43, 44, };
static const char* const msigs_M5I2C[] = { "(iiii)b", "(iii)i", "(iiii)i", "(iiii)b", };
static const uint16_t plist_M5I2C[] = {  };
CLASS_OBJECT(class_M5I2C, 4) = {
    .body = { .s = 0, .i = 0, .cn = "M5I2C", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5I2C, .unboxed_types = "" }, .mt = { .size = 4, .names = mnames_M5I2C, .signatures = msigs_M5I2C }, .vtbl = { mth_0_M5I2C, mth_1_M5I2C, mth_2_M5I2C, mth_3_M5I2C,  }}};
static const uint16_t mnames_M5[] = { 51, 52, 53, };
static const char* const msigs_M5[] = { "()v", "()v", "()s", };
static const uint16_t plist_M5[] = { 45, 46, 47, 48, 49, 50 };
CLASS_OBJECT(class_M5, 3) = {
    .body = { .s = 6, .i = 0, .cn = "M5", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 6, .offset = 0,
    .unboxed = 0, .prop_names = plist_M5, .unboxed_types = "" }, .mt = { .size = 3, .names = mnames_M5, .signatures = msigs_M5 }, .vtbl = { mth_0_M5, mth_1_M5, mth_2_M5,  }}};

static void fbody_print(value_t self, value_t _message) {
  ROOT_SET_N(func_rootset,2,VALUE_UNDEF_2)
  func_rootset.values[1] = self;
  func_rootset.values[0] = _message;
  {
    
    clear_buff();
    write_message_to_buff(func_rootset.values[0]);
    bs_protocol_write_log(buff);
    ;
  }
  DELETE_ROOT_SET(func_rootset)
}
struct func_body _print = { fbody_print, "(a)v" };

void mth_0_Console(value_t self, value_t _message) {
  ROOT_SET_N(func_rootset,2,VALUE_UNDEF_2)
  func_rootset.values[0] = self;
  func_rootset.values[1] = _message;
  {
    
    clear_buff();
    write_message_to_buff(func_rootset.values[1]);
    bs_protocol_write_log(buff);
        ;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_1_Console(value_t self, value_t _message) {
  ROOT_SET_N(func_rootset,2,VALUE_UNDEF_2)
  func_rootset.values[0] = self;
  func_rootset.values[1] = _message;
  {
    
    clear_buff();
    write_message_to_buff(func_rootset.values[1]);
    bs_protocol_write_error(buff);
        ;
  }
  DELETE_ROOT_SET(func_rootset)
}

value_t new_Console(value_t self) { return self; }


float mth_0_Time(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    float _currentTime = 0.0;
    _currentTime = esp_timer_get_time() / 1000.0;;
    { float ret_value_ = (_currentTime); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

void mth_1_Time(value_t self, int32_t _ms) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    vTaskDelay(pdMS_TO_TICKS(_ms));;
  }
  DELETE_ROOT_SET(func_rootset)
}

value_t new_Time(value_t self) { return self; }


void mth_0_BuiltinGpio(value_t self, int32_t _pin, int32_t _mode) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    
    gpio_reset_pin((gpio_num_t)_pin);
    gpio_set_direction((gpio_num_t)_pin,
        _mode == 0 ? GPIO_MODE_INPUT : (_mode == 1 ? GPIO_MODE_OUTPUT : GPIO_MODE_INPUT_OUTPUT));
        ;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_1_BuiltinGpio(value_t self, int32_t _pin, int32_t _level) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    gpio_set_level((gpio_num_t)_pin, _level);;
  }
  DELETE_ROOT_SET(func_rootset)
}

int32_t mth_2_BuiltinGpio(value_t self, int32_t _pin) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _level = 0;
    _level = gpio_get_level((gpio_num_t)_pin);;
    { int32_t ret_value_ = (_level); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

value_t new_BuiltinGpio(value_t self) { return self; }


int32_t mth_0_M5Display(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_display_available() ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_1_M5Display(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_display_width();;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_2_M5Display(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_display_height();;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

void mth_3_M5Display(value_t self, int32_t _color) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_clear(_color);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_4_M5Display(value_t self, int32_t _level) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_set_brightness(_level);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_5_M5Display(value_t self, int32_t _x, int32_t _y) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_set_cursor(_x, _y);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_6_M5Display(value_t self, int32_t _size) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_set_text_size(_size);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_7_M5Display(value_t self, int32_t _color, int32_t _background) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_set_text_color(_color, _background);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_8_M5Display(value_t self, value_t _text) {
  ROOT_SET_N(func_rootset,2,VALUE_UNDEF_2)
  func_rootset.values[0] = self;
  func_rootset.values[1] = _text;
  {
    bs_m5_display_print(gc_string_to_cstr(func_rootset.values[1]));;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_9_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _color) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_draw_pixel(_x, _y, _color);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_10_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _w, int32_t _h, int32_t _color) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_fill_rect(_x, _y, _w, _h, _color);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_11_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _w, int32_t _h, int32_t _color) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_draw_rect(_x, _y, _w, _h, _color);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_12_M5Display(value_t self, int32_t _x0, int32_t _y0, int32_t _x1, int32_t _y1, int32_t _color) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_draw_line(_x0, _y0, _x1, _y1, _color);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_13_M5Display(value_t self, int32_t _x, int32_t _y, int32_t _r, int32_t _color) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_display_fill_circle(_x, _y, _r, _color);;
  }
  DELETE_ROOT_SET(func_rootset)
}

value_t new_M5Display(value_t self) { return self; }


int32_t mth_0_M5Button(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_btn_is_pressed() ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_1_M5Button(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_btn_was_pressed() ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_2_M5Button(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_btn_was_released() ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_3_M5Button(value_t self, int32_t _ms) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_btn_pressed_for(_ms) ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

value_t new_M5Button(value_t self) { return self; }


int32_t mth_0_M5Led(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_led_available() ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

void mth_1_M5Led(value_t self, int32_t _r, int32_t _g, int32_t _b) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_led_set(_r, _g, _b);;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_2_M5Led(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_led_set(0, 0, 0);;
  }
  DELETE_ROOT_SET(func_rootset)
}

value_t new_M5Led(value_t self) { return self; }


int32_t mth_0_M5Imu(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_imu_available() ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

float mth_1_M5Imu(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    float _v = 0.0;
    { float x = 0, y = 0, z = 0; bs_m5_imu_read_accel(&x, &y, &z); _v = x; };
    { float ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

float mth_2_M5Imu(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    float _v = 0.0;
    { float x = 0, y = 0, z = 0; bs_m5_imu_read_accel(&x, &y, &z); _v = y; };
    { float ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

float mth_3_M5Imu(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    float _v = 0.0;
    { float x = 0, y = 0, z = 0; bs_m5_imu_read_accel(&x, &y, &z); _v = z; };
    { float ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

value_t new_M5Imu(value_t self) { return self; }


int32_t mth_0_M5TouchScreen(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_touch_count();;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_1_M5TouchScreen(value_t self, int32_t _index) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_touch_x(_index);;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_2_M5TouchScreen(value_t self, int32_t _index) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_touch_y(_index);;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_3_M5TouchScreen(value_t self, int32_t _index) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_touch_is_pressed(_index) ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

value_t new_M5TouchScreen(value_t self) { return self; }


int32_t mth_0_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _value, int32_t _freq) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_i2c_write_reg8(_addr, _reg, _value, _freq) ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_1_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _freq) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_i2c_read_reg8(_addr, _reg, _freq);;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_2_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _len, int32_t _freq) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _v = 0;
    _v = bs_m5_i2c_read_reg(_addr, _reg, _len, _freq);;
    { int32_t ret_value_ = (_v); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

int32_t mth_3_M5I2C(value_t self, int32_t _addr, int32_t _reg, int32_t _value, int32_t _freq) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _r = 0;
    _r = bs_m5_i2c_write_reg16(_addr, _reg, _value, _freq) ? 1 : 0;;
    { int32_t ret_value_ = (_r); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

value_t new_M5I2C(value_t self) { return self; }


static void cons_M5(value_t self) {
  ROOT_SET_N(func_rootset,2,VALUE_UNDEF_2)
  func_rootset.values[0] = self;
  {
    set_obj_property(self, 0, new_M5Display(func_rootset.values[1]=gc_new_object(&class_M5Display.clazz)));
    set_obj_property(self, 1, new_M5Button(func_rootset.values[1]=gc_new_object(&class_M5Button.clazz)));
    set_obj_property(self, 2, new_M5Led(func_rootset.values[1]=gc_new_object(&class_M5Led.clazz)));
    set_obj_property(self, 3, new_M5Imu(func_rootset.values[1]=gc_new_object(&class_M5Imu.clazz)));
    set_obj_property(self, 4, new_M5TouchScreen(func_rootset.values[1]=gc_new_object(&class_M5TouchScreen.clazz)));
    set_obj_property(self, 5, new_M5I2C(func_rootset.values[1]=gc_new_object(&class_M5I2C.clazz)));
  }
  DELETE_ROOT_SET(func_rootset)
}

value_t new_M5(value_t self) { cons_M5(self); return self; }


void mth_0_M5(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_begin();;
  }
  DELETE_ROOT_SET(func_rootset)
}

void mth_1_M5(value_t self) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    bs_m5_update();;
  }
  DELETE_ROOT_SET(func_rootset)
}

value_t mth_2_M5(value_t self) {
  ROOT_SET_N(func_rootset,2,VALUE_UNDEF_2)
  func_rootset.values[0] = self;
  {
    func_rootset.values[1] = gc_new_string("");
    func_rootset.values[1] = gc_new_string((char*)bs_m5_board_name());;
    { value_t ret_value_ = (func_rootset.values[1]); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

void bs_stdmodule_main() {
  ROOT_SET_INIT(global_rootset0, 4)
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  ;
  set_global_variable(&global_rootset0.values[0], new_Console(func_rootset.values[0]=gc_new_object(&class_Console.clazz)));
  set_global_variable(&global_rootset0.values[1], new_Time(func_rootset.values[0]=gc_new_object(&class_Time.clazz)));
  set_global_variable(&global_rootset0.values[2], new_BuiltinGpio(func_rootset.values[0]=gc_new_object(&class_BuiltinGpio.clazz)));
  set_global_variable(&global_rootset0.values[3], new_M5(func_rootset.values[0]=gc_new_object(&class_M5.clazz)));
  DELETE_ROOT_SET(func_rootset)
}
