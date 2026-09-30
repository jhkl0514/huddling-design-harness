#!/usr/bin/env node
// hook 회귀 테스트 — guard 스크립트에 가짜 hook 입력을 넣어 허용(0)/차단(2)을 확인한다.
// 사용: npm run test:guards
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const S = (f) => path.join(ROOT, 'harness/scripts', f);
const unlocked = fs.existsSync(path.join(ROOT, '.harness-unlock'));
let failed = 0;

function check(name, script, input, want) {
  const r = spawnSync('node', [S(script)], { input: JSON.stringify({ cwd: ROOT, ...input }), encoding: 'utf8' });
  const ok = r.status === want;
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✘'} ${script} — ${name}: exit ${r.status} (기대 ${want})${r.stderr ? '  ' + r.stderr.trim().split('\n')[0] : ''}`);
}

const write = (p) => ({ tool_name: 'Write', tool_input: { file_path: p } });
const bash = (c) => ({ tool_name: 'Bash', tool_input: { command: c } });
const figmaCode = (first) => {
  const [, ...rest] = fs.readFileSync(S('figma-snapshot.js'), 'utf8').split('\n');
  return { tool_name: 'mcp__claude_ai_Figma__use_figma', tool_input: { code: [first, ...rest].join('\n') } };
};

// guard-write
check('단계 폴더 쓰기 허용', 'guard-write.mjs', write('runs/my-assets/p2-design/screens.md'), 0);
check('input.md 허용', 'guard-write.mjs', write('runs/my-assets/input.md'), 0);
check('approval.md 차단', 'guard-write.mjs', write('runs/my-assets/approval.md'), 2);
check('state.json 차단', 'guard-write.mjs', write('runs/my-assets/state.json'), 2);
check('verdicts 차단', 'guard-write.mjs', write('runs/my-assets/verdicts/P2.json'), 2);
check('스냅샷 직접 쓰기 차단', 'guard-write.mjs', write('runs/my-assets/p3-keyscreens/figma-snapshot.json'), 2);
check('다른 단계 하위 폴더 차단', 'guard-write.mjs', write('runs/my-assets/p2-design/x/y.md'), 2);
check(`rules.yaml (잠금 ${unlocked ? '해제' : '상태'})`, 'guard-write.mjs', write('harness/rules.yaml'), unlocked ? 0 : 2);
check('프로젝트 밖 허용', 'guard-write.mjs', write('/tmp/x.md'), 0);

// guard-bash
check('verify 실행 허용', 'guard-bash.mjs', bash('node harness/scripts/verify.mjs my-assets P2'), 0);
check('상태 읽기 허용', 'guard-bash.mjs', bash('cat runs/my-assets/state.json'), 0);
check('echo로 승인 위조 차단', 'guard-bash.mjs', bash('echo 승인 > runs/my-assets/approval.md'), 2);
check('state.json 삭제 차단', 'guard-bash.mjs', bash('rm runs/my-assets/state.json'), 2);
check('잠금 해제 파일 생성 차단', 'guard-bash.mjs', bash('touch .harness-unlock'), 2);

// guard-judge-bash
check('verify 허용', 'guard-judge-bash.mjs', bash('node harness/scripts/verify.mjs my-assets P3'), 0);
check('스냅샷 저장 허용', 'guard-judge-bash.mjs', bash(`node harness/scripts/save-snapshot.mjs my-assets P3 <<'SNAP'\n{"frames":[]}\nSNAP`), 0);
check('스냅샷 이어 저장 허용', 'guard-judge-bash.mjs', bash(`node harness/scripts/save-snapshot.mjs my-assets P3 --append <<'SNAP'\n{"frames":[]}\nSNAP`), 0);
check('명령 이어붙이기 차단', 'guard-judge-bash.mjs', bash('node harness/scripts/verify.mjs my-assets P3; rm -rf runs'), 2);
check('JSON 아닌 본문 차단', 'guard-judge-bash.mjs', bash(`node harness/scripts/save-snapshot.mjs my-assets P3 <<'SNAP'\nrm -rf /\nSNAP`), 2);
check('다른 명령 차단', 'guard-judge-bash.mjs', bash('ls runs'), 2);

// guard-judge-figma
check('고정 코드 + IDS 허용', 'guard-judge-figma.mjs', figmaCode('const IDS = ["1:2", "3:4", "I5:6;7:8"];'), 0);
check('IDS 줄에 코드 삽입 차단', 'guard-judge-figma.mjs', figmaCode('const IDS = []; figma.currentPage.children[0].remove();'), 2);
const tampered = figmaCode('const IDS = ["1:2"];');
tampered.tool_input.code += '\nfigma.currentPage.children[0].remove();';
check('본문 변경 차단', 'guard-judge-figma.mjs', tampered, 2);

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
