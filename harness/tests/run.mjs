#!/usr/bin/env node
// 게이트 회귀 테스트 — 게이트마다 통과 예시와 실패 예시를 만들어 verify.mjs 종료 코드를 확인한다.
// 사용: npm test
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VERIFY = path.join(ROOT, 'harness/scripts/verify.mjs');

// ---------- 통과하는 기준 실행 (주제: 내 자산) ----------

const table = (header, rows) =>
  [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const references = (n = 5, url = (i) => `https://uibowl.io/screens/${i}`) =>
  table(['번호', '서비스', '화면', 'UI Bowl URL'], Array.from({ length: n }, (_, i) => [i + 1, `서비스${i + 1}`, '자산 목록', url(i + 1)]));

const insights = (rows = [[1, '카드형 자산 목록', '1, 2'], [2, '상태 칩으로 검수 단계 표시', '3'], [3, '공개 범위 세그먼트', '4, 5']]) =>
  table(['번호', '반영 포인트', '출처 번호'], rows);

const SCREEN_ROWS = [
  ['내 자산', 'US-3, US-4', '1, 2', '자산 목록, 새 자산 등록 버튼', '-'],
  ['자산 상세', 'US-4', '2, 3', '설명, 파일, 공개 범위 선택(비공개/멤버 공개/판매 신청 seller 전용), 판매 신청 상태', '비공개'],
];
const TRANSITIONS = [
  ['임시저장', '검수 대기'],
  ['검수 대기', '수정 요청'],
  ['검수 대기', '승인됨'],
  ['검수 대기', '반려'],
  ['수정 요청', '검수 대기'],
];
const screens = (rows = SCREEN_ROWS, tr = TRANSITIONS) =>
  table(['화면', '관련 US', '반영 포인트 번호', '구성', '공개 범위 기본값'], rows) +
  (tr ? '\n\n## 판매 신청 상태 전이\n\n' + table(['from', 'to'], tr) : '') + '\n';

const frame = (id, name, extra = []) => ({
  id, name, width: 390, height: 844, fills: ['#ffffff'],
  nodes: [
    { id: `${id}-1`, name: '등록.cta', fills: ['#141414'], cornerRadius: 9999, width: 358, height: 48, layout: { itemSpacing: 8, padding: [0, 16, 0, 16] } },
    { id: `${id}-2`, name: 'title', fills: ['#141414'], text: { fontFamily: 'Pretendard', fontSize: 28, fontWeight: 700, lineHeight: 1.3, letterSpacing: 0 } },
    { id: `${id}-3`, name: 'lead', fills: ['#707070'], text: { fontFamily: 'Pretendard', fontSize: 17, fontWeight: 300, lineHeight: { unit: 'PERCENT', value: 150 }, letterSpacing: 0 } },
    { id: `${id}-4`, name: 'card', fills: ['#ffffff'], strokes: ['#f0f0f0'], cornerRadius: 24, layout: { itemSpacing: 12, padding: [24, 24, 24, 24] } },
    { id: `${id}-5`, name: 'badge-popular', fills: ['#0066ff'], cornerRadius: 9999, width: 60, height: 24 },
    { id: `${id}-6`, name: 'app-icon/claude', fills: ['#f3f3f3'], cornerRadius: 14.4, width: 48, height: 48 },
    ...extra,
  ],
});

function baseRun(dir) {
  const w = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  };
  w('p1-research/references.md', references());
  w('p1-research/insights.md', insights());
  w('p2-design/screens.md', screens());
  w('p3-keyscreens/keyscreens.md', table(['화면', 'node id'], [['내 자산', '1:1'], ['자산 상세', '1:2']]));
  w('p3-keyscreens/figma-snapshot.json', { frames: [frame('1:1', '내 자산'), frame('1:2', '자산 상세')] });
  w('p4-system/tokens.json', {
    colors: { ink: '#141414', canvas: '#ffffff', accent: '#0066ff' },
    radius: { sm: 16, md: 24, full: 9999 },
    spacing: { xs: 8, md: 16 },
    typography: { body: [15, 400, 1.5], 'heading-1': [28, 700, 1.3] },
  });
  w('p4-system/components.md', table(['컴포넌트', 'node id'], [['button-primary', '2:1']]));
  w('p4-system/figma-snapshot.json', {
    frames: [{ id: '2:1', name: 'button-primary', width: 120, height: 48, fills: ['#141414'], cornerRadius: 9999, nodes: [] }],
  });
  w('p5-screens/screens.md', table(['화면', 'node id'], [['내 자산', '3:1'], ['자산 상세', '3:2']]));
  w('p5-screens/figma-snapshot.json', { frames: [frame('3:1', '내 자산'), frame('3:2', '자산 상세')] });
  return w;
}

// ---------- 실행 도우미 ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
let n = 0;
let failed = 0;

function run(slug, gate) {
  const r = spawnSync('node', [VERIFY, slug, gate, '--runs', tmp], { encoding: 'utf8' });
  let out = {};
  try { out = JSON.parse(r.stdout); } catch { out = { raw: r.stdout + r.stderr }; }
  return { code: r.status, out };
}

function scenario(name, setup, steps) {
  const slug = `case-${++n}`;
  const dir = path.join(tmp, slug);
  const w = baseRun(dir);
  setup?.(w, dir);
  for (const [gate, want, check] of steps) {
    const { code, out } = run(slug, gate);
    const extra = check ? check(out, w, dir) : true;
    const ok = code === want && extra !== false;
    if (!ok) failed++;
    const why = (out.violations || []).slice(0, 2).map((v) => `${v.rule}: ${v.detail}`).join(' · ') || out.detail || '';
    console.log(`${ok ? '✔' : '✘'} ${name} — ${gate} exit ${code} (기대 ${want})${why ? `  ${why}` : ''}`);
  }
}

const approve = (decision) => (out, w) => { w('approval.md', `${decision}\nhash: ${out.hash}\n`); };

// ---------- 시나리오 ----------

scenario('전체 통과', null, [
  ['P1', 0], ['P2', 0], ['P3', 0],
  ['HUMAN', 1, approve('승인')],
  ['HUMAN', 0], ['P4', 0], ['P5', 0],
]);

scenario('P1 실패: 레퍼런스 4개', (w) => w('p1-research/references.md', references(4)), [['P1', 1]]);
scenario('P1 실패: UI Bowl 아닌 URL', (w) => w('p1-research/references.md', references(5, (i) => `https://dribbble.com/${i}`)), [['P1', 1]]);
scenario('P1 차단: 같은 게이트 3회 실패', (w) => w('p1-research/references.md', references(4)), [['P1', 1], ['P1', 1], ['P1', 3], ['P1', 3]]);

scenario('P2 실패 ★1: 공개 범위 기본값이 멤버 공개', (w) =>
  w('p2-design/screens.md', screens([SCREEN_ROWS[0], [...SCREEN_ROWS[1].slice(0, 4), '멤버 공개']])), [['P2', 1]]);
scenario('P2 실패 ★1: 판매 신청에 seller 전용 표기 없음', (w) =>
  w('p2-design/screens.md', screens([SCREEN_ROWS[0], ['자산 상세', 'US-4', '2', '공개 범위 선택(비공개/멤버 공개/판매 신청)', '비공개']])), [['P2', 1]]);
scenario('P2 실패 ★2: 임시저장 → 승인됨 직행', (w) =>
  w('p2-design/screens.md', screens(SCREEN_ROWS, [['임시저장', '승인됨']])), [['P2', 1]]);
scenario('P2 실패: 범위 밖 키워드(결제)', (w) =>
  w('p2-design/screens.md', screens([['내 자산', 'US-4', '1', '자산 목록, 결제 버튼', '-'], SCREEN_ROWS[1]])), [['P2', 1]]);
scenario('P2 복귀: 반영 포인트 0개 화면 → P1', (w) =>
  w('p2-design/screens.md', screens([['내 자산', 'US-3', '-', '자산 목록', '-'], SCREEN_ROWS[1]])),
  [['P2', 1, (out) => out.return_to === 'P1']]);

scenario('P3 실패: 그림자와 허용 밖 색', (w) =>
  w('p3-keyscreens/figma-snapshot.json', {
    frames: [frame('1:1', '내 자산', [{ id: 'x', name: 'card', fills: ['#ff0000'], cornerRadius: 24, effects: [{ type: 'DROP_SHADOW' }] }]), frame('1:2', '자산 상세')],
  }), [['P3', 1]]);
scenario('P3 실패: CTA에 액센트, 모서리 8', (w) =>
  w('p3-keyscreens/figma-snapshot.json', {
    frames: [frame('1:1', '내 자산', [{ id: 'y', name: '구매.cta', fills: ['#0066ff'], cornerRadius: 8, height: 40 }]), frame('1:2', '자산 상세')],
  }), [['P3', 1]]);
scenario('P3 실패: 지문 불일치 (export와 Figma 다름)', (w) =>
  w('p3-keyscreens/figma-snapshot.json', { frames: [frame('1:1', '내 자산'), frame('9:9', '자산 상세')] }), [['P3', 1]]);

scenario('HUMAN 반려 → P2', null, [
  ['P3', 0],
  ['HUMAN', 1, approve('반려: 판매 신청 상태가 잘 안 보임')],
  ['HUMAN', 1, (out) => out.status === 'rejected' && out.return_to === 'P2'],
]);
scenario('승인 뒤 설계 변경 → 승인 무효(차단)', null, [
  ['P3', 0],
  ['HUMAN', 1, approve('승인')],
  ['HUMAN', 0, (out, w) => { w('p2-design/screens.md', screens() + '\n<!-- 승인 뒤 수정 -->\n'); }],
  ['P4', 3],
]);
scenario('P4 실패: 승인 전 실행', null, [['P4', 1]]);
scenario('P4 실패: 토큰 모서리 8', (w, dir) => {
  const t = JSON.parse(fs.readFileSync(path.join(dir, 'p4-system/tokens.json'), 'utf8'));
  t.radius.card = 8;
  w('p4-system/tokens.json', t);
}, [['P3', 0], ['HUMAN', 1, approve('승인')], ['HUMAN', 0], ['P4', 1]]);
scenario('P5 실패: 자산 상세 화면 누락', (w) => {
  w('p5-screens/screens.md', table(['화면', 'node id'], [['내 자산', '3:1']]));
  w('p5-screens/figma-snapshot.json', { frames: [frame('3:1', '내 자산')] });
}, [['P3', 0], ['HUMAN', 1, approve('승인')], ['HUMAN', 0], ['P5', 1]]);
scenario('오류: 파일 없음', (w, dir) => fs.rmSync(path.join(dir, 'p1-research/insights.md')), [['P1', 2]]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);
