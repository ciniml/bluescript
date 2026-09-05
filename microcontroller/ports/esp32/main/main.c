#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "memory.h"
#include "main-thread.h"
#include "protocol.h"
#include "profiler.h"


void app_main(void) {
    // Claim the BlueScript RAM regions before the BLE stack starts allocating:
    // their addresses must be identical on every boot for autorun replay.
    bs_memory_init();
    bs_protocol_init();
    bs_main_thread_init();
}
