import { EventBus } from '../../../src/core/events/event-bus';

// Define a test event map for type safety
interface TestEvents {
  click: { x: number; y: number };
  message: string;
  empty: undefined;
  count: number;
}

describe('EventBus', () => {
  let bus: EventBus<TestEvents>;

  beforeEach(() => {
    bus = new EventBus<TestEvents>();
  });

  describe('emit', () => {
    it('fires registered handlers with correct data', () => {
      const handler = vi.fn();
      bus.on('click', handler);

      bus.emit('click', { x: 10, y: 20 });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('fires multiple handlers for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.on('message', handler1);
      bus.on('message', handler2);

      bus.emit('message', 'hello');

      expect(handler1).toHaveBeenCalledWith('hello');
      expect(handler2).toHaveBeenCalledWith('hello');
    });

    it('does not throw when emitting without listeners', () => {
      expect(() => bus.emit('message', 'no listeners')).not.toThrow();
    });

    it('does not fire handlers for different events', () => {
      const handler = vi.fn();
      bus.on('click', handler);

      bus.emit('message', 'hello');

      expect(handler).not.toHaveBeenCalled();
    });

    it('catches and logs handler errors without affecting other handlers', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badHandler = vi.fn(() => {
        throw new Error('handler broke');
      });
      const goodHandler = vi.fn();

      bus.on('count', badHandler);
      bus.on('count', goodHandler);

      bus.emit('count', 42);

      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('on', () => {
    it('returns an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = bus.on('message', handler);

      expect(typeof unsub).toBe('function');
    });

    it('unsubscribe function removes the handler', () => {
      const handler = vi.fn();
      const unsub = bus.on('message', handler);

      bus.emit('message', 'first');
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      bus.emit('message', 'second');
      expect(handler).toHaveBeenCalledOnce(); // still 1
    });
  });

  describe('once', () => {
    it('fires the handler only once', () => {
      const handler = vi.fn();
      bus.once('count', handler);

      bus.emit('count', 1);
      bus.emit('count', 2);
      bus.emit('count', 3);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(1);
    });

    it('returns an unsubscribe function that prevents the one-time fire', () => {
      const handler = vi.fn();
      const unsub = bus.once('count', handler);

      unsub();
      bus.emit('count', 1);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('removes a specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.on('message', handler1);
      bus.on('message', handler2);

      bus.off('message', handler1);
      bus.emit('message', 'test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith('test');
    });

    it('does not throw when removing a handler that was never added', () => {
      const handler = vi.fn();
      expect(() => bus.off('message', handler)).not.toThrow();
    });
  });

  describe('removeAll', () => {
    it('clears all handlers for all events', () => {
      const clickHandler = vi.fn();
      const messageHandler = vi.fn();
      bus.on('click', clickHandler);
      bus.on('message', messageHandler);

      bus.removeAll();

      bus.emit('click', { x: 0, y: 0 });
      bus.emit('message', 'test');

      expect(clickHandler).not.toHaveBeenCalled();
      expect(messageHandler).not.toHaveBeenCalled();
    });
  });

  describe('getRegisteredEvents', () => {
    it('lists registered event names', () => {
      bus.on('click', vi.fn());
      bus.on('message', vi.fn());

      const events = bus.getRegisteredEvents();
      expect(events).toContain('click');
      expect(events).toContain('message');
      expect(events).toHaveLength(2);
    });

    it('returns empty array when no events registered', () => {
      expect(bus.getRegisteredEvents()).toEqual([]);
    });
  });
});
