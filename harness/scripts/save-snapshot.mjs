#!/usr/bin/env node
// judge 전용: Figma에서 받은 스냅샷 JSON(stdin)을 해당 단계 폴더에 저장한다.
// 사용: node harness/scripts/save-snapshot.mjs <slug> <P3|P4|P5> [--runs <dir>] <<'SNAP' … SNAP
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const i = argv.indexOf('--runs');
const runs = i >= 0 ? path.resolve(argv.splice(i, 2)[1]) : path.join(ROOT, 'runs');
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
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(snap, null, 2) + '\n');
console.log(`저장: ${path.relative(ROOT, file)} (프레임 ${snap.frames.length}개)`);
