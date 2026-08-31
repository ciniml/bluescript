# The M5Unified glue is shared between the M5Stack boards (boards/common/m5).
idf_component_register(SRCS "../../common/m5/m5_api.cpp"
                    INCLUDE_DIRS "../../common/m5"
                    REQUIRES core driver esp_driver_gpio)
