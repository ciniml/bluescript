# ESP32 / ESP32-S3 port

`main/std-module.c` is generated from `std-module.bs`. After editing the `.bs` file:

```bash
node lang/dist/tools/transpile-module.js microcontroller/ports/esp32/std-module.bs microcontroller/ports/esp32/main/std-module.c
sed -i 's/bluescript_main0_/bs_stdmodule_main/g' microcontroller/ports/esp32/main/std-module.c
```

The entry point of the built-in module is called `bs_stdmodule_main` by the runtime
(`core/src/main-thread.c`), hence the rename.

## Board variants (`boards/<BOARD>/`)

The port builds for a *board*, selected with `-D BOARD=<name>` (default `esp32`,
which is also used for the plain `esp32s3` board). A board directory contains:

| Path | Purpose |
| :--- | :--- |
| `board/` | ESP-IDF component named `board` (required by `main`): board-specific C/C++ code, `idf_component.yml` for registry dependencies (e.g. M5Unified), headers |
| `std-module.bs` / `std-module.c` | the board's built-in module (base module + board API); regenerate as above |
| `sdkconfig.defaults` | board settings applied through `-D SDKCONFIG_DEFAULTS="sdkconfig.defaults;boards/<BOARD>/sdkconfig.defaults"` |
| `partitions.csv` | partition table (e.g. larger app / iflash / dflash partitions on 8 MB flash) |

`bscript board build-runtime <board>` and `flash-runtime <board>` pass these options
automatically. `m5stack-atoms3` (AtomS3 / AtomS3 Lite / AtomS3R) embeds M5Unified
and exposes it as the built-in `m5` object.
