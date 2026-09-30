#!/usr/bin/env node
// 판정 스크립트 — 통과/실패는 이 스크립트의 종료 코드로만 정한다.
// 사용: node harness/scripts/verify.mjs <slug> <P1|P2|P3|HUMAN|P4|P5> [--runs <dir>]
// 종료 코드: 0 통과 · 1 실패 또는 승인 대기 · 2 오류 · 3 차단
// 모든 수치와 허용 목록은 harness/rules.yaml에서만 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORDER = ['P1', 'P2', 'P3', 'HUMAN', 'P4', 'P5'];
const EXIT = { pass: 0, fail: 1, waiting: 1, rejected: 1, error: 2, blocked: 3 };

class GateError extends Error {}

// ---------- 입력 ----------

function parseArgs(argv) {
  const args = { runs: path.join(ROOT, 'runs') };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') args.runs = path.resolve(argv[++i]);
    else rest.push(argv[i]);
  }
  [args.slug, args.gate] = rest;
  return args;
}

function makeReader(runDir) {
  return (rel) => {
    const file = path.join(runDir, rel);
    if (!fs.existsSync(file)) throw new GateError(`파일 없음: ${rel}`);
    return fs.readFileSync(file, 'utf8');
  };
}

function readJson(read, rel) {
  try {
    return JSON.parse(read(rel));
  } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError(`JSON 형식 오류: ${rel} (${e.message})`);
  }
}

// ---------- 마크다운 표 ----------

const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l) => /^\s*\|?\s*:?-{3,}/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());

function tables(md) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!(isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1]))) continue;
    const header = cells(lines[i]);
    const rows = [];
    for (i += 2; i < lines.length && isRow(lines[i]); i++) {
      const c = cells(lines[i]);
      rows.push(Object.fromEntries(header.map((h, k) => [h, c[k] ?? ''])));
    }
    out.push({ header, rows });
  }
  return out;
}

function findTable(md, cols, file, { optional = false } = {}) {
  const t = tables(md).find((t) => cols.every((c) => t.header.includes(c)));
  if (!t && !optional) throw new GateError(`${file}: 열 [${cols.join(', ')}] 표를 찾지 못함`);
  return t ? t.rows : null;
}

const nums = (s = '') => (s.match(/\d+/g) || []).map(Number);
const blank = (s) => s === undefined || s.trim() === '' || s.trim() === '-';
const viol = (rule, where, detail) => ({ rule, where, detail });

// ---------- 게이트 ----------

function gateP1(ctx) {
  const g = ctx.rules.gates.P1;
  const cols = ctx.rules.templates_columns;
  const v = [];

  const refs = findTable(ctx.read('p1-research/references.md'), cols.references, 'references.md');
  if (refs.length < g.references_min)
    v.push(viol('references_min', 'references.md', `레퍼런스 ${refs.length}개 < ${g.references_min}개`));
  const urlRe = new RegExp(g.reference_url_pattern);
  const refNums = new Set();
  for (const r of refs) {
    refNums.add(Number(r['번호']));
    if (!urlRe.test(r['UI Bowl URL']))
      v.push(viol('reference_url_pattern', `references.md #${r['번호']}`, `URL 형식 불일치: ${r['UI Bowl URL'] || '(비어 있음)'}`));
  }

  const ins = findTable(ctx.read('p1-research/insights.md'), cols.insights, 'insights.md');
  if (ins.length < g.insights_min)
    v.push(viol('insights_min', 'insights.md', `반영 포인트 ${ins.length}개 < ${g.insights_min}개`));
  for (const r of ins) {
    const src = nums(r['출처 번호']);
    if (src.length < g.insight_source_min)
      v.push(viol('insight_source_min', `insights.md #${r['번호']}`, '출처 번호 없음'));
    for (const n of src.filter((n) => !refNums.has(n)))
      v.push(viol('insight_source_exists', `insights.md #${r['번호']}`, `없는 레퍼런스 번호 ${n}`));
  }
  return { v };
}

function loadScreens(ctx) {
  return findTable(ctx.read('p2-design/screens.md'), ctx.rules.templates_columns.screens, 'screens.md');
}

function gateP2(ctx) {
  const g = ctx.rules.gates.P2;
  const cols = ctx.rules.templates_columns;
  const v = [];
  let returnTo;

  const md = ctx.read('p2-design/screens.md');
  const screens = findTable(md, cols.screens, 'screens.md');
  const insNums = new Set(
    findTable(ctx.read('p1-research/insights.md'), cols.insights, 'insights.md').map((r) => Number(r['번호'])),
  );

  if (screens.length < g.screens_min)
    v.push(viol('screens_min', 'screens.md', `화면 ${screens.length}개 < ${g.screens_min}개`));

  const s1 = g.star1_private_default;
  const oos = g.out_of_scope;
  for (const s of screens) {
    const name = s['화면'];
    const where = `screens.md › ${name}`;
    if (!g.screen_names_allowed.includes(name))
      v.push(viol('screen_names_allowed', where, `PRD 16장 핵심 화면이 아님: ${name}`));

    const us = s['관련 US'].match(/US-\d+/g) || [];
    if (us.length < g.us_per_screen_min) v.push(viol('us_per_screen_min', where, '관련 US 없음'));
    for (const u of us.filter((u) => !g.us_allowed.includes(u)))
      v.push(viol('us_allowed', where, `story-service.md에 없는 유저스토리: ${u}`));

    const ip = nums(s['반영 포인트 번호']);
    if (ip.length < g.insight_per_screen_min) {
      v.push(viol('insight_per_screen_min', where, '반영 포인트 0개 → P1로 복귀'));
      returnTo = 'P1';
    }
    for (const n of ip.filter((n) => !insNums.has(n)))
      v.push(viol('insight_exists', where, `insights.md에 없는 반영 포인트 ${n}`));

    // ★1 멤버 자료는 기본 비공개
    const comp = s[oos.column] ?? '';
    const vis = s[s1.column];
    const hasField = comp.includes(s1.field_keyword);
    if (hasField && blank(vis))
      v.push(viol('★1 star1_private_default', where, `공개 범위 필드가 있는데 "${s1.column}" 비어 있음`));
    if (!blank(vis) && vis.trim() !== s1.required_value)
      v.push(viol('★1 star1_private_default', where, `기본값이 "${vis}" (허용: ${s1.required_value})`));
    if (hasField && comp.includes(s1.sale_option) && !comp.includes(s1.sale_option_marker))
      v.push(viol('★1 star1_private_default', where, `"${s1.sale_option}" 옵션에 "${s1.sale_option_marker}" 표기 없음`));

    // 범위 밖 키워드 (구성 열만)
    for (const kw of oos.keywords) {
      const count = comp.split(kw).length - 1;
      if (count > oos.max) v.push(viol('out_of_scope', where, `범위 밖 키워드 "${kw}" ${count}회`));
    }
  }

  // ★2 판매 자산은 검수 통과 필수
  const s2 = g.star2_review_required;
  if (screens.some((s) => s2.applies_to_screens.includes(s['화면']))) {
    const tr = findTable(md, cols.transitions, 'screens.md', { optional: true });
    if (!tr) {
      v.push(viol('★2 star2_review_required', 'screens.md', '판매 신청 상태 전이 표 없음'));
    } else {
      const states = new Set(tr.flatMap((r) => [r.from, r.to]));
      for (const st of s2.required_states.filter((st) => !states.has(st)))
        v.push(viol('★2 star2_review_required', 'screens.md › 상태 전이', `필수 상태 없음: ${st}`));
      for (const [a, b] of s2.forbidden_transitions)
        if (tr.some((r) => r.from === a && r.to === b))
          v.push(viol('★2 star2_review_required', 'screens.md › 상태 전이', `금지된 직행 전이: ${a} → ${b}`));
    }
  }
  return { v, returnTo };
}

// ---------- design.md 검사 (Figma 스냅샷) ----------

const normColor = (c) => String(c).toLowerCase().replace(/\s+/g, '');

function lineHeightRatio(lh, size) {
  if (typeof lh === 'number') return lh;
  if (lh && lh.unit === 'PIXELS') return lh.value / size;
  if (lh && lh.unit === 'PERCENT') return lh.value / 100;
  return null; // AUTO 등은 허용 목록에 없음
}

function radiiOf(n) {
  if (n.cornerRadius === undefined) return [];
  return Array.isArray(n.cornerRadius) ? n.cornerRadius : [n.cornerRadius];
}

function designCheck(ctx, snapRel, expectedIds, { frameSize }) {
  const d = ctx.rules.design_check;
  const v = [];
  const snap = readJson(ctx.read, snapRel);
  if (!Array.isArray(snap.frames)) throw new GateError(`${snapRel}: frames 배열 없음`);

  // 지문 대조 — 에이전트가 적은 node id 목록과 판정자가 Figma에서 읽은 프레임이 같아야 한다
  const snapIds = new Set(snap.frames.map((f) => f.id));
  for (const id of expectedIds.filter((id) => !snapIds.has(id)))
    v.push(viol('fingerprint', snapRel, `산출물에 적힌 node ${id}가 Figma 스냅샷에 없음`));
  for (const id of [...snapIds].filter((id) => !expectedIds.includes(id)))
    v.push(viol('fingerprint', snapRel, `Figma 스냅샷의 node ${id}가 산출물에 없음`));

  const allowedColors = new Set(d.colors.map(normColor));
  const accent = normColor(d.accent.color);
  const typoKey = (s, w, l) => `${s}/${w}/${Math.round(l * 100) / 100}`;
  const allowedTypo = new Set(d.typography.map(([s, w, l]) => typoKey(s, w, l)));

  for (const f of snap.frames) {
    if (frameSize && (f.width !== d.frame.width || f.height !== d.frame.height))
      v.push(viol('frame', f.name, `프레임 ${f.width}×${f.height} (허용: ${d.frame.width}×${d.frame.height})`));

    let accentNodes = 0;
    for (const n of [f, ...(f.nodes || [])]) {
      const where = n === f ? f.name : `${f.name} › ${n.name}`;
      const isCta = n.name.endsWith(d.cta.suffix);

      // 색
      let hasAccent = false;
      for (const c of [...(n.fills || []), ...(n.strokes || [])].map(normColor)) {
        if (!allowedColors.has(c)) v.push(viol('colors', where, `허용 목록에 없는 색 ${c}`));
        if (c === accent) hasAccent = true;
      }
      if (hasAccent) {
        accentNodes++;
        if (n.name.endsWith(d.accent.forbidden_on_suffix))
          v.push(viol('accent', where, `CTA에 액센트 ${d.accent.color} 사용`));
      }

      // 모서리
      const exc = d.radius_exceptions.find((e) => n.name.startsWith(e.prefix));
      for (const r of radiiOf(n)) {
        if (exc) {
          const want = exc.ratio * Math.min(n.width, n.height);
          if (Math.abs(r - want) > 1) v.push(viol('radius', where, `모서리 ${r} (허용: 한 변의 ${exc.ratio * 100}% ≈ ${want})`));
        } else if (!d.radius.includes(r)) {
          v.push(viol('radius', where, `모서리 ${r} (허용: ${d.radius.join('/')})`));
        }
      }

      // CTA
      if (isCta) {
        const rs = radiiOf(n);
        if (rs.length === 0 || rs.some((r) => r !== d.cta.radius))
          v.push(viol('cta', where, `CTA 모서리 ${rs.join('/') || '없음'} (허용: ${d.cta.radius})`));
        if (!(n.height >= d.cta.min_height))
          v.push(viol('cta', where, `CTA 높이 ${n.height} < ${d.cta.min_height}`));
      }

      // 간격
      if (n.layout) {
        const vals = [n.layout.itemSpacing, ...(n.layout.padding || [])].filter((x) => x !== undefined);
        for (const s of vals)
          if (!d.spacing.includes(s)) v.push(viol('spacing', where, `간격 ${s} (허용: ${d.spacing.join('/')})`));
      }

      // 타이포
      if (n.text) {
        const t = n.text;
        if (!d.font_family.includes(t.fontFamily)) v.push(viol('font_family', where, `폰트 ${t.fontFamily}`));
        if (!d.letter_spacing.includes(t.letterSpacing ?? 0))
          v.push(viol('letter_spacing', where, `자간 ${t.letterSpacing}`));
        const lh = lineHeightRatio(t.lineHeight, t.fontSize);
        if (lh === null || !allowedTypo.has(typoKey(t.fontSize, t.fontWeight, lh)))
          v.push(viol('typography', where, `타이포 ${t.fontSize}/${t.fontWeight}/${lh ?? 'AUTO'}는 design.md 표에 없음`));
      }

      // 그림자
      const shadows = (n.effects || []).filter((e) => /SHADOW/.test(e.type));
      if (shadows.length > d.shadows.max && !d.shadows.exceptions.includes(n.name))
        v.push(viol('shadows', where, `그림자 ${shadows.length}개`));
    }
    if (accentNodes > d.accent.max_per_frame)
      v.push(viol('accent', f.name, `액센트 요소 ${accentNodes}개 > ${d.accent.max_per_frame}개`));
  }
  return v;
}

// ---------- 사람 승인 ----------

function approvalHash(ctx) {
  const h = crypto.createHash('sha256');
  for (const rel of ctx.rules.gates.HUMAN.hash_inputs) h.update(rel + '\0' + ctx.read(rel) + '\0');
  return h.digest('hex').slice(0, 12);
}

function gateHUMAN(ctx) {
  const g = ctx.rules.gates.HUMAN;
  const cur = approvalHash(ctx);
  const file = path.join(ctx.runDir, g.file);
  if (!fs.existsSync(file))
    return { status: 'waiting', hash: cur, detail: `${g.file} 없음 — 팀장이 작성해야 함 (hash: ${cur})` };

  const lines = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const hashLine = lines.find((l) => /^hash:/.test(l));
  const decision = lines.find((l) => !/^hash:/.test(l)) ?? '';
  const given = hashLine?.replace(/^hash:\s*/, '');
  if (given !== cur)
    return { status: 'waiting', hash: cur, detail: `승인 대상이 바뀌었거나 hash가 없음 — 현재 hash: ${cur}` };
  if (new RegExp(g.accept).test(decision)) {
    ctx.state.approval = { hash: cur, at: new Date().toISOString() };
    return { v: [], hash: cur };
  }
  if (new RegExp(g.reject).test(decision)) return { status: 'rejected', returnTo: 'P2', hash: cur, detail: decision };
  return { status: 'waiting', hash: cur, detail: `첫 줄이 "승인" 또는 "반려: 이유"가 아님: ${decision}` };
}

function checkApproval(ctx) {
  if (!ctx.state.approval) return { status: 'waiting', detail: '팀장 승인(HUMAN) 전' };
  if (approvalHash(ctx) !== ctx.state.approval.hash) {
    ctx.state.approval = null;
    ctx.state.stage = 'HUMAN';
    return { status: 'blocked', detail: '승인 뒤 screens.md 또는 keyscreens.md가 바뀜 — 승인 무효, 다시 승인 필요' };
  }
  return null;
}

// ---------- Figma 단계 ----------

function gateP3(ctx) {
  const g = ctx.rules.gates.P3;
  const cols = ctx.rules.templates_columns;
  const v = [];
  const screens = loadScreens(ctx);
  const ks = findTable(ctx.read('p3-keyscreens/keyscreens.md'), cols.keyscreens, 'keyscreens.md');

  const { min, max, all_if_screens_lte } = g.keyscreens;
  const [lo, hi] = screens.length <= all_if_screens_lte ? [screens.length, screens.length] : [min, max];
  if (ks.length < lo || ks.length > hi)
    v.push(viol('keyscreens', 'keyscreens.md', `키스크린 ${ks.length}개 (허용: ${lo}~${hi}개)`));
  const names = new Set(screens.map((s) => s['화면']));
  for (const k of ks.filter((k) => !names.has(k['화면'])))
    v.push(viol('keyscreens', 'keyscreens.md', `screens.md에 없는 화면: ${k['화면']}`));

  v.push(...designCheck(ctx, g.snapshot, ks.map((k) => k['node id']), { frameSize: true }));
  return { v };
}

function gateP4(ctx) {
  const g = ctx.rules.gates.P4;
  const d = ctx.rules.design_check;
  const gate = checkApproval(ctx);
  if (gate) return gate;
  const v = [];

  const t = readJson(ctx.read, 'p4-system/tokens.json');
  const colors = new Set(d.colors.map(normColor));
  for (const [k, c] of Object.entries(t.colors || {}))
    if (!colors.has(normColor(c))) v.push(viol('colors', `tokens.json › colors.${k}`, `허용 목록에 없는 색 ${c}`));
  for (const [k, r] of Object.entries(t.radius || {}))
    if (!d.radius.includes(r)) v.push(viol('radius', `tokens.json › radius.${k}`, `모서리 ${r}`));
  for (const [k, s] of Object.entries(t.spacing || {}))
    if (!d.spacing.includes(s)) v.push(viol('spacing', `tokens.json › spacing.${k}`, `간격 ${s}`));
  const typo = new Set(d.typography.map((x) => x.join('/')));
  for (const [k, x] of Object.entries(t.typography || {}))
    if (!typo.has([].concat(x).join('/'))) v.push(viol('typography', `tokens.json › typography.${k}`, `조합 ${[].concat(x).join('/')}`));

  const comps = findTable(ctx.read('p4-system/components.md'), ctx.rules.templates_columns.components, 'components.md');
  v.push(...designCheck(ctx, g.snapshot, comps.map((c) => c['node id']), { frameSize: false }));
  return { v };
}

function gateP5(ctx) {
  const g = ctx.rules.gates.P5;
  const gate = checkApproval(ctx);
  if (gate) return gate;
  const v = [];
  const built = findTable(ctx.read('p5-screens/screens.md'), ctx.rules.templates_columns.screens_built, 'p5-screens/screens.md');
  if (g.all_screens_from_P2) {
    const have = new Set(built.map((b) => b['화면']));
    for (const s of loadScreens(ctx).filter((s) => !have.has(s['화면'])))
      v.push(viol('all_screens_from_P2', 'p5-screens/screens.md', `P2 화면 누락: ${s['화면']}`));
  }
  v.push(...designCheck(ctx, g.snapshot, built.map((b) => b['node id']), { frameSize: true }));
  return { v };
}

const GATES = { P1: gateP1, P2: gateP2, P3: gateP3, HUMAN: gateHUMAN, P4: gateP4, P5: gateP5 };

// ---------- 실행 ----------

function writeApprovalRequest(ctx, hash) {
  const g = ctx.rules.gates.HUMAN;
  const body = [
    '# 컨셉 확정 요청',
    '',
    '팀장이 p2-design/screens.md와 p3-keyscreens/keyscreens.md(Figma)를 확인한 뒤,',
    `같은 폴더에 ${g.file}를 아래 두 줄로 직접 작성해 주세요. 에이전트는 이 파일을 쓸 수 없습니다.`,
    '',
    '```',
    '승인            ← 또는 "반려: 이유"',
    `hash: ${hash}`,
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ctx.runDir, g.request_file), body);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const finish = (status, extra = {}) => {
    const out = { gate: args.gate, slug: args.slug, status, exit: EXIT[status], at: new Date().toISOString(), ...extra };
    console.log(JSON.stringify(out, null, 2));
    process.exit(EXIT[status]);
  };

  if (!args.slug || !ORDER.includes(args.gate))
    finish('error', { detail: `사용법: verify.mjs <slug> <${ORDER.join('|')}> [--runs <dir>]` });

  let rules;
  try {
    rules = yaml.load(fs.readFileSync(path.join(ROOT, 'harness/rules.yaml'), 'utf8'));
  } catch (e) {
    finish('error', { detail: `rules.yaml 읽기 실패: ${e.message}` });
  }

  const runDir = path.join(args.runs, args.slug);
  if (!fs.existsSync(runDir)) finish('error', { detail: `실행 폴더 없음: ${runDir}` });

  const statePath = path.join(runDir, 'state.json');
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { slug: args.slug, stage: 'P1', fails: {}, approval: null, history: [] };
  const ctx = { rules, runDir, state, read: makeReader(runDir) };
  const limit = rules.gates.retry_limit;

  const save = (status, result) => {
    const verdict = {
      gate: args.gate,
      status,
      exit: EXIT[status],
      at: new Date().toISOString(),
      fails: state.fails[args.gate] || 0,
      return_to: result.returnTo ?? (status === 'fail' ? args.gate : undefined),
      hash: result.hash,
      detail: result.detail,
      violations: result.v || [],
    };
    fs.mkdirSync(path.join(runDir, 'verdicts'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'verdicts', `${args.gate}.json`), JSON.stringify(verdict, null, 2) + '\n');
    state.history.push({ gate: args.gate, status, at: verdict.at });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
    console.log(JSON.stringify(verdict, null, 2));
    process.exit(EXIT[status]);
  };

  if ((state.fails[args.gate] || 0) >= limit)
    save('blocked', { detail: `${args.gate} ${limit}회 실패로 차단됨 — 사람이 확인 후 state.json을 정리해야 함` });

  let result;
  try {
    result = GATES[args.gate](ctx);
  } catch (e) {
    if (!(e instanceof GateError)) throw e;
    save('error', { detail: e.message });
  }

  let status = result.status || (result.v.length ? 'fail' : 'pass');
  if (status === 'fail') {
    state.fails[args.gate] = (state.fails[args.gate] || 0) + 1;
    if (state.fails[args.gate] >= limit) status = 'blocked';
    if (result.returnTo) state.stage = result.returnTo;
  } else if (status === 'pass') {
    state.fails[args.gate] = 0;
    state.stage = ORDER[ORDER.indexOf(args.gate) + 1] ?? 'DONE';
    if (args.gate === 'P3') writeApprovalRequest(ctx, approvalHash(ctx));
  } else if (status === 'rejected') {
    state.approval = null;
    state.stage = result.returnTo;
  }
  save(status, result);
}

main();
