# Standard Libraries

BlueScript follows a "Battery-included but removable" philosophy.
Core features are kept minimal, while hardware drivers are provided as external standard libraries hosted on GitHub.

To install any of these libraries, use the command:
`bscript project install <git-url>`

:::note ESP32 only
The libraries listed below are for **ESP32** hardware. They are not available on the host runtime.
:::

## Available Libraries

Currently, the following libraries are available for stable use.

### Built-in (no import needed)
*   **`gpio`** — minimal GPIO access compiled into the ESP32 / ESP32-S3 runtime, available in every environment including `setup-lite` and the browser.
    *   `gpio.setDirection(pin: integer, mode: integer)` — `mode`: 0 = input, 1 = output, 2 = input/output
    *   `gpio.setLevel(pin: integer, level: integer)`
    *   `gpio.getLevel(pin: integer): integer`
    *   Example: `gpio.setDirection(2, 1); gpio.setLevel(2, 1);`

### Built-in on `m5stack-atoms3` (M5Stack AtomS3 / AtomS3 Lite / AtomS3R)
The board's runtime embeds [M5Unified](https://github.com/m5stack/M5Unified); the board model is detected at
start-up, so one firmware serves all three. Colors are `0xRRGGBB` integers.
*   `m5.begin()` — initialize (call once); `m5.update()` — poll the button (call in loops); `m5.boardName(): string`
*   `m5.display` — `available()`, `width()`, `height()`, `clear(color)`, `setBrightness(0..255)`, `setCursor(x, y)`,
    `setTextSize(n)`, `setTextColor(color, background)`, `print(text)`, `drawPixel(x, y, color)`,
    `fillRect(x, y, w, h, color)`, `drawRect(...)`, `drawLine(x0, y0, x1, y1, color)`, `fillCircle(x, y, r, color)`
    (no-ops on AtomS3 Lite, which has no display)
*   `m5.btn` — `isPressed()`, `wasPressed()`, `wasReleased()`, `pressedFor(ms)` (the front button; call `m5.update()` first)
*   `m5.led` — `available()`, `set(r, g, b)`, `off()` (the RGB LED of AtomS3 Lite; no-op on the others)
*   `m5.imu` — `available()`, `accelX()`, `accelY()`, `accelZ()` in G (AtomS3 / AtomS3R)
*   Example:
    ```ts
    m5.begin();
    m5.display.clear(0x000000);
    m5.display.setTextSize(2);
    m5.display.print("Hello " + m5.boardName());
    while (true) { m5.update(); if (m5.btn.wasPressed()) m5.led.set(0, 255, 0); }
    ```

### Digital I/O
*   **GPIO (General Purpose Input/Output)**
    *   Control pins, read digital states, and handle interrupts.
    *   **Repository:** [https://github.com/bluescript-lang/pkg-gpio-esp32.git](https://github.com/bluescript-lang/pkg-gpio-esp32.git)
    *   **Usage:** `import { GPIO } from "gpio";`

### Control
*   **PWM (Pulse Width Modulation)**
    *   Pulse Width Modulation for LEDs and Servos.
    *   **Repository:** [https://github.com/bluescript-lang/pkg-pwm-esp32.git](https://github.com/bluescript-lang/pkg-pwm-esp32.git)
    *   **Usage:** `import { PWM } from "pwm";`

### Communication
*   **I2C (Inter-Integrated Circuit)**
    *   Interface with sensors and displays (Two-wire master library).
    *   **Repository:** [https://github.com/bluescript-lang/pkg-i2c-esp32.git](https://github.com/bluescript-lang/pkg-i2c-esp32.git)
    *   **Usage:** `import { I2CMasterBus, I2CDevice } from "i2c";`

---

## Roadmap (Planned Libraries)

We are actively developing drivers for the following peripherals.
Support for these features will be rolled out in upcoming updates.

| Category | Library | Status | Description |
| :--- | :--- | :--- | :--- |
| **Analog** | **ADC** | 🚧 Planned | Read analog sensor values. |
| **Analog** | **DAC** | 🚧 Planned | Output analog voltage signals. |
| **Comms** | **UART** | 🚧 Planned | Serial communication with other devices. |
| **Comms** | **SPI** | 🚧 Planned | High-speed serial communication. |
| **Audio** | **I2S** | 🚧 Planned | Digital audio data transfer. |
| **Wireless** | **WiFi** | 🚧 Planned | Connect to the internet, make HTTP requests. |
| **Wireless** | **Bluetooth** | 🚧 Planned | BLE communication (Central/Peripheral). |

<!-- :::note Contribute?
BlueScript is an open ecosystem. If you have wrapped an ESP-IDF component into a BlueScript package, feel free to share it with the community!
::: -->
