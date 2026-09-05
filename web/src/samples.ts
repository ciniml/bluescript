// Sample projects offered on the page. Loading one replaces the project's
// source files (and installs the packages it needs).
export type Sample = {
  name: string;
  board?: string;            // recommended board (prefix match, e.g. 'm5stack-')
  packages?: { url: string }[];
  files: { [name: string]: string };
};

const STACKCHAN_PKG = 'https://github.com/ciniml/bluescript/tree/feature/clang-toolchain/packages/stackchan';

export const SAMPLES: Sample[] = [
  {
    name: 'Blink (GPIO LED)',
    files: {
      'index.bs': `// Blinks an LED. Set ledPin to your wiring (AtomS3: 35 is the RGB LED data pin,
// use the m5 sample instead; plain ESP32-S3 devkits often wire an LED to 2).
let ledPin = 2;
gpio.setDirection(ledPin, 1);
for (let i = 0; i < 10; i++) {
    gpio.setLevel(ledPin, 1);
    time.delay(300);
    gpio.setLevel(ledPin, 0);
    time.delay(300);
}
console.log("done");
`,
    },
  },
  {
    name: 'M5 display & button',
    board: 'm5stack-',
    files: {
      'index.bs': `m5.begin();
m5.display.clear(0x000030);
m5.display.setTextSize(2);
m5.display.setCursor(4, 4);
m5.display.print(m5.boardName());
let count = 0;
while (true) {
    m5.update();
    if (m5.btn.wasPressed()) {
        count = count + 1;
        m5.display.fillRect(0, 40, m5.display.width(), 40, 0x000030);
        m5.display.setCursor(4, 44);
        m5.display.print("pressed: " + count);
        m5.led.set(0, 80, 0);
    }
    if (m5.btn.wasReleased()) m5.led.set(0, 0, 0);
    time.delay(10);
}
`,
    },
  },
  {
    name: 'Stack-chan (face, random motion)',
    board: 'm5stack-cores3',
    packages: [{ url: STACKCHAN_PKG }],
    files: {
      'index.bs': `import { StackchanServo, StackchanMotion, SERVO_M5_BASE, randomInt } from "stackchan";
import { Avatar } from "stackchan/avatar";

m5.begin();
let face = new Avatar();
face.begin();

let servo = new StackchanServo();
let servoOk = servo.beginAuto();   // powers the servo rail and detects the base
console.log(servoOk ? "servo ready" : "servo not found");
// 20 ms ticks, 60 deg/s, 180 deg/s^2, torque off after 1 s of rest
let motion = new StackchanMotion(servo, 20, 60.0, 180.0, 1000);

while (true) {
    m5.update();
    if (servoOk) motion.tick();

    if (randomInt(100) < 2) face.blink();
    if (randomInt(100) < 3)
        face.setGaze((randomInt(21) - 10) / 10.0, (randomInt(11) - 5) / 10.0);
    if (servoOk && !motion.isMoving() && randomInt(100) < 2)
        motion.moveTo((randomInt(61) - 30) * 1.0, (randomInt(25) - 12) * 1.0);

    face.update();
    time.delay(20);
}
`,
    },
  },
];
