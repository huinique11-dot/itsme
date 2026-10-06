// "나" 피규어 그리기: 사람 모양 틀 안에 음식 조각을 콜라주로 채운다.
export const FW = 300;
export const FH = 440;
const HEAD = { x: 150, y: 66, r: 54 };
const INK = '#3a2b22';

let bodyCache;
export function bodyPath() {
  if (bodyCache) return bodyCache;
  const p = new Path2D();
  p.roundRect(130, 108, 40, 34, 10); // 목
  p.roundRect(84, 128, 132, 160, [56, 56, 40, 40]); // 몸통
  p.roundRect(97, 262, 48, 148, [20, 20, 26, 26]); // 왼다리
  p.roundRect(155, 262, 48, 148, [20, 20, 26, 26]); // 오른다리
  const arm = new Path2D();
  arm.roundRect(-21, 0, 42, 132, 21);
  p.addPath(arm, new DOMMatrix().translate(100, 146).rotate(30)); // 왼팔
  p.addPath(arm, new DOMMatrix().translate(200, 146).rotate(-30)); // 오른팔
  bodyCache = p;
  return p;
}

function headPath() {
  const p = new Path2D();
  p.arc(HEAD.x, HEAD.y, HEAD.r, 0, Math.PI * 2);
  return p;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const probe = document.createElement('canvas').getContext('2d');
const BOX = { x: 0, y: 100, w: FW, h: 315 };
const inBody = (x, y) => probe.isPointInPath(bodyPath(), x, y);

let bodyArea;
function area() {
  if (bodyArea) return bodyArea;
  let hit = 0;
  for (let y = BOX.y; y < BOX.y + BOX.h; y += 3)
    for (let x = BOX.x; x < BOX.x + BOX.w; x += 3) if (inBody(x, y)) hit++;
  return (bodyArea = hit * 9);
}

// 몸 안에 고르게 퍼진 M개의 자리 (best-candidate 샘플링)
const slotCache = new Map();
function slots(seed, M) {
  const key = seed + ':' + M;
  if (slotCache.has(key)) return slotCache.get(key);
  const r = rng(seed);
  const pick = () => {
    for (;;) {
      const x = BOX.x + r() * BOX.w;
      const y = BOX.y + r() * BOX.h;
      if (inBody(x, y)) return { x, y };
    }
  };
  const pts = [];
  for (let i = 0; i < M; i++) {
    let best, bestD = -1;
    for (let k = 0; k < 14; k++) {
      const c = pick();
      let d = Infinity;
      for (const p of pts) d = Math.min(d, (p.x - c.x) ** 2 + (p.y - c.y) ** 2);
      if (d > bestD) { bestD = d; best = c; }
    }
    pts.push(best);
  }
  const out = { pts, size: Math.sqrt(area() / M) * 1.9 };
  slotCache.set(key, out);
  return out;
}

function defaultFace(ctx) {
  const { x, y } = HEAD;
  ctx.fillStyle = '#ffe2c2';
  ctx.fillRect(x - 60, y - 60, 120, 120);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(x - 19, y - 6, 5, 7, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 19, y - 7, 5, 7, -0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(240,120,110,.45)';
  ctx.beginPath(); ctx.arc(x - 32, y + 12, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 32, y + 11, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x + 1, y + 10, 15, 0.2 * Math.PI, 0.82 * Math.PI); ctx.stroke();
}

/**
 * @param ctx  캔버스 2D 컨텍스트
 * @param data { pieces: 이미지[], face: 이미지|null }
 * @param seed 날짜로 만든 시드 (같은 날은 항상 같은 배치)
 * @param scale 캔버스 배율
 */
export function drawFigure(ctx, { pieces, face }, seed, scale = 1) {
  const body = bodyPath();
  const head = headPath();
  const r = rng(seed ^ 0x9e3779b9);

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, FW, FH);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 받침대 그림자
  ctx.fillStyle = 'rgba(58,43,34,.13)';
  ctx.beginPath(); ctx.ellipse(150, 418, 82, 11, 0, 0, Math.PI * 2); ctx.fill();

  // 삐뚤빼뚤 크레용 외곽선 (몸 채우기 아래에 깔아서 바깥 테두리만 보이게)
  ctx.strokeStyle = INK;
  for (let k = 0; k < 3; k++) {
    ctx.save();
    ctx.translate((r() - 0.5) * 3, (r() - 0.5) * 3);
    ctx.lineWidth = 8 - k * 2;
    ctx.globalAlpha = k ? 0.45 : 0.9;
    ctx.stroke(body);
    ctx.stroke(head);
    ctx.restore();
  }

  ctx.fillStyle = pieces.length ? '#f1dfc1' : '#fffdf6';
  ctx.fill(body);

  if (pieces.length) {
    const N = pieces.length;
    const M = Math.min(54, Math.max(24, N * 3));
    const { pts, size } = slots(seed, M);
    // 조각 순서를 섞어서 같은 음식이 몰리지 않게
    const order = pieces.map((_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    ctx.save();
    ctx.clip(body);
    pts.forEach((p, i) => {
      const img = pieces[order[i % N]];
      const s = size * (0.85 + r() * 0.5);
      const ratio = img.width / img.height;
      const dw = ratio >= 1 ? s : s * ratio;
      const dh = ratio >= 1 ? s / ratio : s;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((r() - 0.5) * 1.1);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    });
    ctx.restore();
  } else {
    ctx.save();
    ctx.clip(body);
    ctx.setLineDash([6, 9]);
    ctx.strokeStyle = 'rgba(58,43,34,.25)';
    ctx.lineWidth = 3;
    ctx.stroke(body);
    ctx.restore();
  }

  // 얼굴
  ctx.save();
  ctx.clip(head);
  if (face) ctx.drawImage(face, HEAD.x - HEAD.r, HEAD.y - HEAD.r, HEAD.r * 2, HEAD.r * 2);
  else defaultFace(ctx);
  ctx.restore();
  ctx.save();
  ctx.translate((r() - 0.5) * 2, (r() - 0.5) * 2);
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.stroke(head);
  ctx.restore();

  ctx.restore();
}
