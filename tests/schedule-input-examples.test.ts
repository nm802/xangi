import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scheduleCmd } from '../src/cli/schedule-cmd.js';
import { formatXangiCmdHelp } from '../src/cli/xangi-cmd-help.js';
import { parseScheduleInput } from '../src/scheduler.js';

/** 文中の `--input "…"` の例を取り出し、`<message>` を本文に置き換える */
function inputExamples(text: string): string[] {
  return [...text.matchAll(/--input "([^"]+)"/g)].map((m) =>
    m[1].replace('<message>', 'Send a reminder')
  );
}

/** 比べやすいよう、実行時刻に依存しない形へ縮める */
function summarize(input: string) {
  const parsed = parseScheduleInput(input);
  if (!parsed) return null;
  if (parsed.type === 'cron') return { type: 'cron', expression: parsed.expression };
  return input.startsWith('2026-') ? { type: 'once', runAt: parsed.runAt } : { type: 'once' };
}

let originalEnv: NodeJS.ProcessEnv;
let tmpDir: string;

beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.TZ = 'Asia/Tokyo';
  tmpDir = mkdtempSync(join(tmpdir(), 'schedule-input-examples-'));
  delete process.env.DATA_DIR;
  process.env.WORKSPACE_PATH = tmpDir;
});

afterEach(() => {
  process.env = originalEnv;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('予定の書き方の例', () => {
  it('helpに載っている書き方はすべて予定として受け付けられる', () => {
    const examples = inputExamples(formatXangiCmdHelp('schedule_add'));

    expect(Object.fromEntries(examples.map((input) => [input, summarize(input)]))).toEqual({
      '30分後 Send a reminder': { type: 'once' },
      '15:30 Send a reminder': { type: 'once' },
      '2026-10-20 09:00 Send a reminder': { type: 'once', runAt: '2026-10-20T00:00:00.000Z' },
      '毎日 9:00 Send a reminder': { type: 'cron', expression: '0 9 * * *' },
      '毎週月曜 10:00 Send a reminder': { type: 'cron', expression: '0 10 * * 1' },
      '毎時 Send a reminder': { type: 'cron', expression: '0 * * * *' },
      'cron 0 9 * * * Send a reminder': { type: 'cron', expression: '0 9 * * *' },
    });
  });

  it('エラー文に載っている書き方も予定として受け付けられる', async () => {
    const error = await scheduleCmd('schedule_add', {
      input: 'in 1 minute リマインド',
      channel: 'ch1',
      platform: 'line',
    }).catch((e: Error) => e);
    if (!(error instanceof Error)) throw new Error('schedule_add should reject');

    const examples = inputExamples(error.message);
    expect(examples.map((input) => [input, summarize(input)])).toEqual([
      ['30分後 Send a reminder', { type: 'once' }],
      ['cron 0 9 * * * Send a reminder', { type: 'cron', expression: '0 9 * * *' }],
    ]);
  });
});
