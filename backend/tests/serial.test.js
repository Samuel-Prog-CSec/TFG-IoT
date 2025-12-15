const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const rfidService = require('../src/services/rfidService');

// Mock serialport
jest.mock('serialport', () => {
    return {
        SerialPort: jest.fn().mockImplementation(() => ({
            pipe: jest.fn().mockReturnThis(),
            on: jest.fn(),
            open: jest.fn().mockImplementation((cb) => cb && cb(null)),
            write: jest.fn(),
            close: jest.fn().mockImplementation((cb) => cb && cb(null)),
            isOpen: true
        }))
    };
});

jest.mock('@serialport/parser-readline', () => {
    return {
        ReadlineParser: jest.fn().mockImplementation(() => ({
             on: jest.fn(),
             pipe: jest.fn()
        }))
    };
});

describe('RFID Service (Serial Simulation)', () => {
    let mockPortInstance;
    let mockParserInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset singleton state if needed? 
        // rfidService is stateful singleton.
        // We might need to manually reset its properties if tests interfere.
        rfidService.isConnected = false;
        rfidService.isReconnecting = false;
        rfidService.port = null;
        rfidService.parser = null;
    });

    it('should connect to serial port successfully', async () => {
        const emitSpy = jest.spyOn(rfidService, 'emit');
        
        await rfidService.connect();

        expect(SerialPort).toHaveBeenCalledTimes(1);
        expect(rfidService.isConnected).toBe(true);
        expect(emitSpy).toHaveBeenCalledWith('status', 'connected');
    });

    it('should handle card_detected event from serial', async () => {
        await rfidService.connect();
        
        // Get the parser 'on' handler to simulate data
        // rfidService.parser.on('data', handler)
        // We need to capture the handler passed to on('data')
        const parserOnSpy = rfidService.parser.on;
        const dataHandler = parserOnSpy.mock.calls.find(call => call[0] === 'data')[1];

        const emitSpy = jest.spyOn(rfidService, 'emit');

        // Simulate JSON data
        const cardEvent = { event: 'card_detected', uid: 'UNKNOWN_CARD', type: 'rfid' };
        dataHandler(JSON.stringify(cardEvent));

        expect(emitSpy).toHaveBeenCalledWith('rfid_event', expect.objectContaining({
            event: 'card_detected',
            uid: 'UNKNOWN_CARD'
        }));

        // Check buffer
        const status = rfidService.getStatus();
        expect(status.metrics.totalCardDetections).toBe(1);
    });

    it('should ignore invalid json', async () => {
        await rfidService.connect();
        const parserOnSpy = rfidService.parser.on;
        const dataHandler = parserOnSpy.mock.calls.find(call => call[0] === 'data')[1];
        
        const emitSpy = jest.spyOn(rfidService, 'emit');

        dataHandler('INVALID DATA');

        expect(emitSpy).not.toHaveBeenCalledWith('rfid_event', expect.any(Object));
    });

    it('should handle disconnection and attempt reconnect', async () => {
        // Use fake timers to test reconnection delay
        jest.useFakeTimers();
        
        await rfidService.connect();
        expect(rfidService.isConnected).toBe(true);
        
        // Simulate error event on port
        const portOnSpy = rfidService.port.on;
        const errorHandler = portOnSpy.mock.calls.find(call => call[0] === 'error')[1];
        
        errorHandler(new Error('Simulated disconnection'));
        
        expect(rfidService.isConnected).toBe(false);
        expect(rfidService.isReconnecting).toBe(true); // Should trigger reconnect
        
        // Fast forward time
        jest.advanceTimersByTime(6000); 
        
        // Should have called connect again
        // Since connect is async/recursive via timeout, checking internal state or spy on connect is tricky
        // But we can check if SerialPort constructor was called again
        expect(SerialPort).toHaveBeenCalledTimes(2); // 1 initial + 1 reconnect

        jest.useRealTimers();
    });
});
