const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeRateLimitResult,
  mergeRateLimitSnapshot,
  findBundledCodexBinary
} = require('../src/codexUsage');

test('normalizes official Codex primary and weekly rate-limit windows into remaining percentages', () => {
  const value = normalizeRateLimitResult({
    rateLimits: {
      primary: { usedPercent: 35, windowDurationMins: 300, resetsAt: 1787120000 },
      secondary: { usedPercent: 72, windowDurationMins: 10080, resetsAt: 1787551200 },
      rateLimitReachedType: null
    }
  });

  assert.equal(value.windows.length, 2);
  assert.deepEqual(value.windows[0], {
    key: 'primary',
    label: '5-hour',
    usedPercent: 35,
    remainingPercent: 65,
    windowDurationMins: 300,
    resetsAt: 1787120000
  });
  assert.equal(value.windows[1].label, 'Weekly');
  assert.equal(value.windows[1].remainingPercent, 28);
});

test('prefers the codex bucket from rateLimitsByLimitId when present', () => {
  const value = normalizeRateLimitResult({
    rateLimits: { primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 1 } },
    rateLimitsByLimitId: {
      codex: {
        limitId: 'codex',
        primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 2 },
        secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 3 }
      }
    }
  });

  assert.equal(value.windows[0].remainingPercent, 80);
  assert.equal(value.windows[1].remainingPercent, 60);
});

test('merges sparse account/rateLimits/updated snapshots without deleting existing windows', () => {
  const previous = {
    primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 10 },
    secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 20 },
    rateLimitReachedType: null
  };
  const merged = mergeRateLimitSnapshot(previous, {
    primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 11 }
  });

  assert.equal(merged.primary.usedPercent, 25);
  assert.equal(merged.secondary.usedPercent, 40);
  assert.equal(merged.secondary.resetsAt, 20);
});

test('finds the official VS Code Codex bundled binary under the extension bin directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-builder-usage-'));
  const binaryDir = path.join(root, 'bin', 'windows-x86_64');
  fs.mkdirSync(binaryDir, { recursive: true });
  const binary = path.join(binaryDir, 'codex.exe');
  fs.writeFileSync(binary, 'fake');

  try {
    assert.equal(findBundledCodexBinary(root, { platform: 'win32', arch: 'x64' }), binary);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CodexUsageService performs initialize handshake, reads limits, and applies live updates', async () => {
  const { EventEmitter } = require('node:events');
  const { CodexUsageService } = require('../src/codexUsage');

  class FakeStream extends EventEmitter {
    constructor() { super(); this.writes = []; this.destroyed = false; }
    setEncoding() {}
    write(value) { this.writes.push(String(value)); return true; }
    end() { this.destroyed = true; }
  }

  class FakeChild extends EventEmitter {
    constructor() {
      super();
      this.stdin = new FakeStream();
      this.stdout = new FakeStream();
      this.stderr = new FakeStream();
      this.killed = false;
    }
    kill() { this.killed = true; this.emit('exit', 0); }
  }

  const child = new FakeChild();
  const states = [];
  const service = new CodexUsageService({
    version: '1.2.0',
    resolveBinary: () => ({ command: 'codex-test', source: 'test' }),
    spawnFn: () => child,
    pollMs: 600000,
    startupTimeoutMs: 5000,
    onChange: (state) => states.push(state)
  });

  await service.start();
  const init = JSON.parse(child.stdin.writes[0]);
  assert.equal(init.method, 'initialize');

  child.stdout.emit('data', JSON.stringify({ id: init.id, result: { codexHome: '/tmp/.codex' } }) + '\n');
  const sent = child.stdin.writes.map((line) => JSON.parse(line));
  assert.ok(sent.some((message) => message.method === 'initialized'));
  const read = sent.find((message) => message.method === 'account/rateLimits/read');
  assert.ok(read);

  child.stdout.emit('data', JSON.stringify({
    id: read.id,
    result: {
      rateLimits: {
        primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 100 },
        secondary: { usedPercent: 70, windowDurationMins: 10080, resetsAt: 200 }
      }
    }
  }) + '\n');

  assert.equal(service.getState().status, 'live');
  assert.equal(service.getState().windows[1].remainingPercent, 30);

  child.stdout.emit('data', JSON.stringify({
    method: 'account/rateLimits/updated',
    params: { rateLimits: { secondary: { usedPercent: 75, resetsAt: 201 } } }
  }) + '\n');
  assert.equal(service.getState().windows[1].remainingPercent, 25);
  assert.ok(states.some((state) => state.status === 'live'));

  service.stop();
});
