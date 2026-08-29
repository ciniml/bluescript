
#include <string.h>
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "protocol.h"
#include "c-runtime.h"
#include "./include/std-module.h"

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
void mth_0_GPIO(value_t self, int32_t _pin, int32_t _mode);
void mth_1_GPIO(value_t self, int32_t _pin, int32_t _level);
int32_t mth_2_GPIO(value_t self, int32_t _pin);
extern CLASS_OBJECT(object_class, 1);
void bs_stdmodule_main();
ROOT_SET_DECL(global_rootset0, 3);
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
static const uint16_t mnames_GPIO[] = { 12, 13, 14, };
static const char* const msigs_GPIO[] = { "(ii)v", "(ii)v", "(i)i", };
static const uint16_t plist_GPIO[] = {  };
CLASS_OBJECT(class_GPIO, 3) = {
    .body = { .s = 0, .i = 0, .cn = "GPIO", .sc = &object_class.clazz , .an = (void*)0, .pt = { .size = 0, .offset = 0,
    .unboxed = 0, .prop_names = plist_GPIO, .unboxed_types = "" }, .mt = { .size = 3, .names = mnames_GPIO, .signatures = msigs_GPIO }, .vtbl = { mth_0_GPIO, mth_1_GPIO, mth_2_GPIO,  }}};

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


void mth_0_GPIO(value_t self, int32_t _pin, int32_t _mode) {
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

void mth_1_GPIO(value_t self, int32_t _pin, int32_t _level) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    gpio_set_level((gpio_num_t)_pin, _level);;
  }
  DELETE_ROOT_SET(func_rootset)
}

int32_t mth_2_GPIO(value_t self, int32_t _pin) {
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  func_rootset.values[0] = self;
  {
    int32_t _level = 0;
    _level = gpio_get_level((gpio_num_t)_pin);;
    { int32_t ret_value_ = (_level); DELETE_ROOT_SET(func_rootset); return ret_value_; }
  }
}

value_t new_GPIO(value_t self) { return self; }


void bs_stdmodule_main() {
  ROOT_SET_INIT(global_rootset0, 3)
  ROOT_SET_N(func_rootset,1,VALUE_UNDEF)
  ;
  set_global_variable(&global_rootset0.values[0], new_Console(func_rootset.values[0]=gc_new_object(&class_Console.clazz)));
  set_global_variable(&global_rootset0.values[1], new_Time(func_rootset.values[0]=gc_new_object(&class_Time.clazz)));
  set_global_variable(&global_rootset0.values[2], new_GPIO(func_rootset.values[0]=gc_new_object(&class_GPIO.clazz)));
  DELETE_ROOT_SET(func_rootset)
}
