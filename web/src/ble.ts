// Web Bluetooth transport + the BlueScript device protocol.
import { Buffer } from 'buffer';
import { MemoryImage, MemoryLayout } from '../../lang/src/compiler/board-toolchain/board-toolchain';
import { Protocol, ProtocolPacketBuilder, ProtocolParser } from '../../cli/src/services/device-protocol';

const SERVICE_UUID = 0xb500;
const CHARACTERISTIC_UUID = 0xb501;
const MTU = 495;

export type DeviceEvents = {
  log: (msg: string) => void;
  error: (msg: string) => void;
  disconnected: () => void;
};

export class WebBluetoothDevice {
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private memoryResolver?: (l: MemoryLayout) => void;
  private exectimeHandler?: (id: number, time: number) => void;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private events: DeviceEvents) {}

  get name() { return this.device?.name ?? ''; }
  get connected() { return !!this.device?.gatt?.connected; }

  async connect(): Promise<void> {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available in this browser (use Chrome or Edge).');
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
    this.device.addEventListener('gattserverdisconnected', () => { this.characteristic = undefined; this.events.disconnected(); });
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
    this.characteristic.addEventListener('characteristicvaluechanged', (ev) => {
      const v = (ev.target as BluetoothRemoteGATTCharacteristic).value!;
      this.handleData(Buffer.from(v.buffer, v.byteOffset, v.byteLength));
    });
    await this.characteristic.startNotifications();
  }

  disconnect() { this.device?.gatt?.disconnect(); }

  private handleData(data: Buffer) {
    const r = new ProtocolParser().parse(data) as any;
    switch (r.protocol) {
      case Protocol.Log: this.events.log(r.log); break;
      case Protocol.Error: this.events.error(r.error); break;
      case Protocol.Exectime: this.exectimeHandler?.(r.id, r.time); break;
      case Protocol.Memory: this.memoryResolver?.(r.layout); this.memoryResolver = undefined; break;
    }
  }

  private async write(packets: Buffer[], onProgress?: (percent: number) => void) {
    if (!this.characteristic) throw new Error('Not connected.');
    const c = this.characteristic;
    this.writeChain = this.writeChain.then(async () => {
      for (let i = 0; i < packets.length; i++) {
        const p = packets[i];
        await c.writeValueWithResponse(p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength));
        onProgress?.(Math.round(((i + 1) / packets.length) * 100));
      }
    });
    await this.writeChain;
  }

  // Restart the board; the connection drops afterwards.
  async reboot(): Promise<void> {
    await this.write(new ProtocolPacketBuilder(MTU).reboot().build());
  }

  async init(): Promise<MemoryLayout> {
    const packets = new ProtocolPacketBuilder(MTU).reset().build();
    const p = new Promise<MemoryLayout>(resolve => { this.memoryResolver = resolve; });
    await this.write(packets);
    return p;
  }

  async load(image: MemoryImage, onProgress?: (percent: number) => void): Promise<number> {
    const b = new ProtocolPacketBuilder(MTU);
    if (image.iram) b.load(image.iram.address, image.iram.data);
    if (image.dram) b.load(image.dram.address, image.dram.data);
    if (image.iflash) b.load(image.iflash.address, image.iflash.data);
    if (image.dflash) b.load(image.dflash.address, image.dflash.data);
    const t = performance.now();
    await this.write(b.build(), onProgress);
    return performance.now() - t;
  }

  async execute(image: MemoryImage): Promise<number> {
    const b = new ProtocolPacketBuilder(MTU);
    for (const e of image.entryPoints) b.jump(e.isMain ? 1 : 0, e.address);
    const p = new Promise<number>(resolve => {
      let total = 0;
      this.exectimeHandler = (id, time) => { total += time; if (id === 1) { this.exectimeHandler = undefined; resolve(total); } };
    });
    await this.write(b.build());
    return p;
  }
}
