#!/usr/bin/env node
// judge 전용: Figma에서 받은 스냅샷 JSON(stdin)을 해당 단계 폴더에 저장한다.
// 사용: node harness/scripts/save-snapshot.mjs <slug> <P3|P4|P5> [--append] [--runs <dir>] <<'SNAP' … SNAP
// --append: use_figma 반환 한도(20KB) 때문에 프레임을 1개씩 받을 때, 기존 스냅샷에 프레임을 합친다 (같은 id는 교체).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const i = argv.indexOf('--runs');
const runs = i >= 0 ? path.resolve(argv.splice(i, 2)[1]) : path.join(ROOT, 'runs');
const a = argv.indexOf('--append');
const append = a >= 0 && argv.splice(a, 1).length > 0;
const [slug, gate] = argv;
const fail = (m) => { console.error(m); process.exit(2); };

if (!/^[a-z0-9-]+$/.test(slug || '')) fail('slug 형식 오류');
const rules = yaml.load(fs.readFileSync(path.join(ROOT, 'harness/rules.yaml'), 'utf8'));
const rel = rules.gates[gate]?.snapshot;
if (!rel) fail(`스냅샷이 없는 게이트: ${gate}`);

let snap;
try { snap = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { fail(`JSON 형식 오류: ${e.message}`); }
if (!Array.isArray(snap.frames)) fail('frames 배열 없음');

const file = path.join(runs, slug, rel);
if (append) {
  if (!fs.existsSync(file)) fail('--append: 기존 스냅샷 없음 — 첫 프레임은 --append 없이 저장');
  const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (prev.fileKey !== snap.fileKey) fail(`--append: fileKey 다름 (${prev.fileKey} ≠ ${snap.fileKey})`);
  const ids = new Set(snap.frames.map((f) => f.id));
  snap = { ...snap, frames: [...prev.frames.filter((f) => !ids.has(f.id)), ...snap.frames] };
}
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(snap, null, 2) + '\n');
console.log(`저장: ${path.relative(ROOT, file)} (프레임 ${snap.frames.length}개)`);
