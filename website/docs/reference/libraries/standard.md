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
