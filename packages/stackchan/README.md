# stackchan

BlueScript package for the [Stack-chan](https://github.com/stack-chan/stack-chan)
hardware on M5Stack CoreS3 base boards, ported from
[stackchan-idf](https://github.com/ciniml/stackchan-idf) (BSL-1.0).

Requires the `m5stack-cores3` board runtime (`m5.begin()` first) and, in lite
environments, a runtime bundle built with
`--components esp_driver_gpio,esp_driver_uart`.

```ts
import { StackchanServo, StackchanHeadTouch, StackchanBattery, SERVO_M5_BASE } from "stackchan";

m5.begin();
let servo = new StackchanServo();
servo.begin(SERVO_M5_BASE);            // Takao base: SERVO_TAKAO_BASE
servo.move(20.0, -10.0, 500, 0);       // yaw +20°, pitch −10° over 500 ms

let touch = new StackchanHeadTouch();
touch.begin();
let battery = new StackchanBattery();
battery.begin();
while (true) {
    m5.update();
    if (touch.isPressed()) console.log("head touched");
    time.delay(100);
}
```
