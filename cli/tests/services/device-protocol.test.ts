import { ProtocolPacketBuilder, Protocol } from '../../src/services/device-protocol'


const BUFFER_SIZE =  17;

describe('ProtocolPacketBuilder', () => {
    test('should add jump command', () => {
        const builder = new ProtocolPacketBuilder(BUFFER_SIZE);
        builder.jump(1, 0x1234);
        const expectedBuffer = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Jump,
            0x01, 0x00, 0x00, 0x00, // id
            0x34, 0x12, 0x00, 0x00, // address
        ]);
        expect(builder.build()).toEqual([expectedBuffer]);
    });

    test('should add reset command', () => {
        const builder = new ProtocolPacketBuilder(BUFFER_SIZE);
        builder.reset();
        const expectedBuffer = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Reset,
        ]);
        expect(builder.build()).toEqual([expectedBuffer]);
    });

    test('should add short load command', () => {
        const builder = new ProtocolPacketBuilder(BUFFER_SIZE);
        builder.load(0x1234, Buffer.from([0x00, 0x01, 0x02, 0x03]));
        const expectedBuffer = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Load,
            0x34, 0x12, 0x00, 0x00, // address
            0x04, 0x00, 0x00, 0x00, // size
            0x00, 0x01, 0x02, 0x03, // data
        ]);
        expect(builder.build()).toEqual([expectedBuffer]);
    });

    test('should add long load command', () => {
        const builder = new ProtocolPacketBuilder(BUFFER_SIZE);
        builder.load(0x1234, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
        const expectedBuffer1 = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Load,
            0x34, 0x12, 0x00, 0x00, // address
            0x04, 0x00, 0x00, 0x00, // size
            0x00, 0x01, 0x02, 0x03, // data
        ]);
        const expectedBuffer2 = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Load,
            0x38, 0x12, 0x00, 0x00, // address
            0x03, 0x00, 0x00, 0x00, // size
            0x04, 0x05, 0x06, // data
        ]);
        expect(builder.build()).toEqual([expectedBuffer1, expectedBuffer2]);
    });

    test('should add reset command after full load command', () => {
        const builder = new ProtocolPacketBuilder(BUFFER_SIZE);
        builder.load(0x1234, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]));
        builder.reset();
        const expectedBuffer1 = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Load,
            0x34, 0x12, 0x00, 0x00, // address
            0x04, 0x00, 0x00, 0x00, // size
            0x00, 0x01, 0x02, 0x03, // data
        ]);
        const expectedBuffer2 = Buffer.from([
            0x03, 0x00, // First Header
            Protocol.Load,
            0x38, 0x12, 0x00, 0x00, // address
            0x03, 0x00, 0x00, 0x00, // size
            0x04, 0x05, 0x06, // data
            Protocol.Reset,
        ]);
        expect(builder.build()).toEqual([expectedBuffer1, expectedBuffer2]);
    })
})

describe('ProtocolPacketBuilder.reboot', () => {
    it('emits a single REBOOT command after the first header', () => {
        const { ProtocolPacketBuilder, Protocol } = require('../../src/services/device-protocol');
        const packets = new ProtocolPacketBuilder(495).reboot().build();
        expect(packets.length).toBe(1);
        expect(packets[0][2]).toBe(Protocol.Reboot);
    });
});

describe('ProtocolParser.parseMemory', () => {
    const { ProtocolParser, Protocol } = require('../../src/services/device-protocol');
    const layoutBytes = () => {
        const b = Buffer.alloc(33);
        b.writeUInt8(Protocol.Memory, 0);
        [0x40380000, 100, 0x3fc90000, 200, 0x42100000, 300, 0x3c100000, 400].forEach((v, i) => b.writeUInt32LE(v, 1 + 4 * i));
        return b;
    };
    it('parses the layout of an old runtime without firmware identity', () => {
        const r: any = new ProtocolParser().parse(layoutBytes());
        expect(r.layout.iflash).toEqual({ address: 0x42100000, size: 300 });
        expect(r.layout.firmware).toBeUndefined();
    });
    it('parses the firmware identity appended by newer runtimes', () => {
        const tail = Buffer.alloc(32 + 1 + 1 + 8);
        Buffer.from('ab'.repeat(32), 'hex').copy(tail, 0);
        tail.writeUInt8(2, 32); tail.writeUInt8(2, 33);
        tail.writeUInt32LE(0x42086c80, 34); tail.writeUInt32LE(0x4200a0f4, 38);
        const r: any = new ProtocolParser().parse(Buffer.concat([layoutBytes(), tail]));
        expect(r.layout.firmware).toEqual({ elfSha256: 'ab'.repeat(32), protocolVersion: 2, sentinels: [0x42086c80, 0x4200a0f4] });
    });
});

describe('ProtocolPacketBuilder.setName', () => {
    const { ProtocolPacketBuilder, Protocol } = require('../../src/services/device-protocol');
    it('encodes cmd, length and utf-8 bytes', () => {
        const packets = new ProtocolPacketBuilder(495).setName('robo-1').build();
        const p = packets[0];
        expect(p[2]).toBe(Protocol.SetName);
        expect(p[3]).toBe(6);
        expect(p.subarray(4, 10).toString('utf-8')).toBe('robo-1');
    });
    it('rejects names longer than 31 bytes', () => {
        expect(() => new ProtocolPacketBuilder(495).setName('あ'.repeat(11))).toThrow(/31 bytes/);
    });
});
