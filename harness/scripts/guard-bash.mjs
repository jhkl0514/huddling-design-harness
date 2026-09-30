#!/usr/bin/env node
// PreToolUse hook (Bash, 모든 세션): 보호 파일을 Bash로 우회해 쓰는 것을 막는다.
// 완전한 차단은 아니다 — 보호 파일 이름이 들어간 쓰기 명령만 잡는다.
import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const cmd = input.tool_input?.command ?? '';
const block = (why) => { console.error(`[guard-bash] 차단 — ${why}`); process.exit(2); };

if (cmd.includes('.harness-unlock')) block('.harness-unlock은 사람이 직접 만들고 지운다');

const PROTECTED = /(approval\.md|state\.json|verdicts\/|figma-snapshot\.json|rules\.yaml)/;
const WRITES = /(>|\btee\b|\bsed\s+-i|\bcp\b|\bmv\b|\brm\b|\btouch\b|\btruncate\b|\bpython3?\b|\bnode\s+-e|\bperl\b|\bdd\b|\bln\b)/;
if (PROTECTED.test(cmd) && WRITES.test(cmd)) block('보호 파일(approval.md, state.json, verdicts, figma-snapshot.json, rules.yaml)에 쓰는 명령');
process.exit(0);
