# CoreS3 / CoreS3 SE board support: the shared M5Unified glue only. The
# Stack-chan drivers (servos, head touch, battery) live in the BlueScript
# 'stackchan' package (packages/stackchan), not in the firmware.
idf_component_register(SRCS "../../common/m5/m5_api.cpp"
                    INCLUDE_DIRS "../../common/m5"
                    REQUIRES core driver esp_driver_gpio)
