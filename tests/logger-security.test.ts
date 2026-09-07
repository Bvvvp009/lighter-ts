import { redact, Logger, LogLevel } from '../src/utils/logger';

describe('Logger security (secret redaction)', () => {
  test('redact masks secret-looking keys at any depth', () => {
    const input = {
      apiKey: 'abc123',
      nested: {
        private_key: '0xdeadbeef',
        safe: 'keep me',
        deep: { apiPrivateKey: 'hex80', token: 'tok' },
      },
      list: [{ secret: 's1' }, { ok: 'v' }],
      plain: 42,
    };
    const out = JSON.stringify(redact(input));

    expect(out).not.toContain('abc123');
    expect(out).not.toContain('0xdeadbeef');
    expect(out).not.toContain('"hex80"');
    expect(out).not.toContain('"tok"');
    expect(out).not.toContain('"s1"');
    expect(out).toContain('keep me');
    expect(out).toContain('42');
    expect(out).toMatch(/\[REDACTED len:\d+\]/);
  });

  test('redact handles circular references without throwing', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(() => JSON.stringify(redact(a))).not.toThrow();
    expect(JSON.stringify(redact(a))).not.toContain('undefined');
  });

  test('logger buffers redacted entries only', () => {
    const log = Logger.getInstance();
    log.clearLogs();
    const prevLevel = (log as any).logLevel;
    (log as any).logLevel = LogLevel.DEBUG;
    try {
      log.info('ctx test', { apiKey: 'supersecret', orderSize: 50 } as any);
      const buffered = JSON.stringify(log.getLogs());
      expect(buffered).not.toContain('supersecret');
      expect(buffered).toContain('orderSize');
    } finally {
      (log as any).logLevel = prevLevel;
      log.clearLogs();
    }
  });

  test('log buffer is capped', () => {
    const log = Logger.getInstance();
    log.clearLogs();
    const prevLevel = (log as any).logLevel;
    (log as any).logLevel = LogLevel.ERROR; // silence console
    try {
      // Only ERROR passes at this level; push well past the cap.
      for (let i = 0; i < 1050; i++) {
        log.error(`entry ${i}`, undefined, { i });
      }
      expect(log.getLogs().length).toBeLessThanOrEqual(1000);
    } finally {
      (log as any).logLevel = prevLevel;
      log.clearLogs();
    }
  });
});