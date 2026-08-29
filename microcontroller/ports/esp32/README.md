# ESP32 / ESP32-S3 port

`main/std-module.c` is generated from `std-module.bs`. After editing the `.bs` file:

```bash
node lang/dist/tools/transpile-module.js microcontroller/ports/esp32/std-module.bs microcontroller/ports/esp32/main/std-module.c
sed -i 's/bluescript_main0_/bs_stdmodule_main/g' microcontroller/ports/esp32/main/std-module.c
```

The entry point of the built-in module is called `bs_stdmodule_main` by the runtime
(`core/src/main-thread.c`), hence the rename.
