const IDS = [];
// ↑ judge가 바꿀 수 있는 줄은 첫 줄(IDS)뿐이다. 나머지는 guard-judge-figma.mjs가 원본과 한 글자씩 대조한다.
// 읽기 전용: Figma 노드를 읽어 verify.mjs가 검사할 스냅샷 JSON을 돌려준다. 아무것도 수정하지 않는다.
const WEIGHT = { Thin: 100, ExtraLight: 200, 'Extra Light': 200, Light: 300, Regular: 400, Medium: 500,
  SemiBold: 600, 'Semi Bold': 600, Bold: 700, ExtraBold: 800, 'Extra Bold': 800, Black: 900 };
const ch = (x) => Math.round(x * 255);
const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => ch(x).toString(16).padStart(2, '0')).join('');

function paints(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p.visible !== false).flatMap((p) => {
    if (p.type === 'SOLID') {
      const a = Math.round((p.opacity ?? 1) * 100) / 100;
      return [a < 1 ? `rgba(${ch(p.color.r)},${ch(p.color.g)},${ch(p.color.b)},${a})` : hex(p.color)];
    }
    if (p.type.startsWith('GRADIENT')) return ['gradient'];
    return []; // IMAGE·VIDEO 등 콘텐츠는 검사하지 않는다
  });
}

function radius(n) {
  if (!('cornerRadius' in n)) return undefined;
  if (n.cornerRadius !== figma.mixed) return n.cornerRadius;
  return [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius];
}

function describe(n) {
  const base = { id: n.id, name: n.name, type: n.type, width: n.width, height: n.height };
  if ('effects' in n) base.effects = n.effects.filter((e) => e.visible !== false).map((e) => ({ type: e.type }));
  if (n.type === 'TEXT') {
    const segs = n.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'fills']);
    return segs.map((s, i) => ({
      ...base,
      name: segs.length > 1 ? `${n.name}#${i}` : n.name,
      fills: paints(s.fills),
      text: {
        fontFamily: s.fontName.family,
        fontSize: s.fontSize,
        fontWeight: WEIGHT[s.fontName.style] ?? s.fontName.style,
        lineHeight: s.lineHeight.unit === 'AUTO' ? { unit: 'AUTO' } : s.lineHeight,
        letterSpacing: s.letterSpacing.value,
      },
    }));
  }
  const out = { ...base, fills: paints(n.fills), strokes: paints(n.strokes), cornerRadius: radius(n) };
  if ('layoutMode' in n && n.layoutMode !== 'NONE')
    out.layout = { itemSpacing: n.itemSpacing, padding: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft] };
  return [out];
}

const frames = [];
for (const id of IDS) {
  const f = await figma.getNodeByIdAsync(id);
  if (!f) { frames.push({ id, name: '(없음)', width: 0, height: 0, nodes: [] }); continue; }
  const [self] = describe(f);
  const nodes = 'findAll' in f ? f.findAll((n) => n.visible !== false).flatMap(describe) : [];
  frames.push({ ...self, nodes });
}
return { fileKey: figma.fileKey, fetchedAt: new Date().toISOString(), frames };
