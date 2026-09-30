#!/usr/bin/env node
// judge 전용 PreToolUse hook (use_figma): 고정된 figma-snapshot.js와 같은 코드만 허용한다.
// 바꿀 수 있는 것은 첫 줄의 IDS 배열뿐이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const block = (why) => { console.error(`[guard-judge-figma] 차단 — ${why}`); process.exit(2); };

const norm = (s) => s.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();
const [first, ...rest] = norm(input.tool_input?.code ?? '').split('\n');
const [, ...fixed] = norm(fs.readFileSync(path.join(ROOT, 'harness/scripts/figma-snapshot.js'), 'utf8')).split('\n');

if (!/^const IDS = \[\s*("[0-9A-Za-z:;-]+"\s*,?\s*)*\];$/.test(first)) block('첫 줄은 const IDS = ["1:2", ...]; 형식이어야 한다');
if (rest.join('\n') !== fixed.join('\n')) block('figma-snapshot.js와 다른 코드 — judge는 Figma를 읽기만 한다');
process.exit(0);
