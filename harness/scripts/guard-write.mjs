#!/usr/bin/env node
// PreToolUse hook (Write|Edit|MultiEdit|NotebookEdit, 모든 세션): 쓰기 경로를 검사한다.
// 종료 코드 2 = 차단 (stderr가 Claude에게 전달됨)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!target) process.exit(0);

const rel = path.relative(ROOT, path.resolve(input.cwd ?? ROOT, target)).split(path.sep).join('/');
const block = (why) => { console.error(`[guard-write] 차단: ${rel} — ${why}`); process.exit(2); };

if (rel.startsWith('..')) process.exit(0); // 프로젝트 밖

if (rel.startsWith('runs/')) {
  if (/^runs\/[a-z0-9-]+\/input\.md$/.test(rel)) process.exit(0);
  const m = rel.match(/^runs\/[a-z0-9-]+\/(p1-research|p2-design|p3-keyscreens|p4-system|p5-screens)\/[^/]+$/);
  if (!m) block('approval.md는 사람만, state.json·verdicts·approval-request.md는 스크립트만 쓴다');
  if (rel.endsWith('/figma-snapshot.json')) block('스냅샷은 judge가 save-snapshot.mjs로만 저장한다');
  process.exit(0);
}

const PROTECTED = [/^harness\//, /^docs\//, /^\.claude\//, /^CLAUDE\.md$/, /^package(-lock)?\.json$/, /^\.harness-unlock$/];
if (PROTECTED.some((re) => re.test(rel)) && !fs.existsSync(path.join(ROOT, '.harness-unlock')))
  block('하네스 파일은 사람이 .harness-unlock 파일을 만든 뒤에만 수정할 수 있다');
process.exit(0);
