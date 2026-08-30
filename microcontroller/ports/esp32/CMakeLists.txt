# For more information about build system see
# https://docs.espressif.com/projects/esp-idf/en/latest/api-guides/build-system.html
# The following five lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.16)

set(EXTRA_COMPONENT_DIRS  
        "../../core" 
    )

# Board variant: "esp32" (generic, default) or a board with extra firmware
# support such as "m5stack-atoms3". Every variant provides a component named
# "board" in boards/<BOARD>/board/ (the generic one is empty), which the main
# component requires; its built-in module is boards/<BOARD>/std-module.c when present.
set(BOARD "esp32" CACHE STRING "Board variant")
list(APPEND EXTRA_COMPONENT_DIRS "boards/${BOARD}")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(bluescript)

idf_build_set_property(COMPILE_OPTIONS "-Wno-maybe-uninitialized" APPEND)
