#!/usr/bin/env node
// judge 전용 PreToolUse hook (Bash): verify.mjs 실행과 save-snapshot.mjs 저장만 허용한다.
import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const cmd = (input.tool_input?.command ?? '').trim();
const block = (why) => { console.error(`[guard-judge-bash] 차단 — ${why}\n명령: ${cmd.split('\n')[0]}`); process.exit(2); };

const SLUG = '[a-z0-9-]+';
const VERIFY = new RegExp(`^node harness/scripts/verify\\.mjs ${SLUG} (P1|P2|P3|HUMAN|P4|P5)$`);
if (VERIFY.test(cmd)) process.exit(0);

const lines = cmd.split('\n');
const SAVE = new RegExp(`^node harness/scripts/save-snapshot\\.mjs ${SLUG} (P3|P4|P5) <<'SNAP'$`);
if (SAVE.test(lines[0]) && lines.at(-1) === 'SNAP' && lines.length >= 3) {
  try { JSON.parse(lines.slice(1, -1).join('\n')); } catch { block('SNAP 본문이 JSON이 아님'); }
  process.exit(0);
}
block('judge는 verify.mjs 실행과 save-snapshot.mjs 저장만 할 수 있다');
