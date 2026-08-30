# The built-in module differs per board (boards/<BOARD>/std-module.c adds the board's API).
if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/../boards/${BOARD}/std-module.c")
    set(STD_MODULE_SRC "../boards/${BOARD}/std-module.c")
else()
    set(STD_MODULE_SRC "std-module.c")
endif()

idf_component_register(SRCS ${STD_MODULE_SRC} "main.c" "ble.c" "memory.c" "utils.c"
                    INCLUDE_DIRS "include"
                    REQUIRES core driver esp_partition bt nvs_flash esp_app_format board
                    LDFRAGMENTS linker.lf
                    WHOLE_ARCHIVE)

target_compile_options(${COMPONENT_LIB} PRIVATE -mtext-section-literals)

if(DEFINED DEVICE_NAME)
    target_compile_definitions(${COMPONENT_LIB} PRIVATE INPUT_DEVICE_NAME=\"${DEVICE_NAME}\")
endif()
