// 사진에서 음식만 오려내는 편집기.
// - 자동: 사진 가장자리에서부터 식탁·그릇처럼 밋밋한 영역을 지워 나간다.
// - 동그라미: 그릇 안쪽만 동그랗게.
// - 손으로: 손가락으로 음식 둘레를 그린다.
const MAX_SIDE = 900;
const OUT_SIDE = 420;

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Editor {
  constructor(dlg) {
    this.dlg = dlg;
    this.cv = dlg.querySelector('#ed-canvas');
    this.ctx = this.cv.getContext('2d');
    this.title = dlg.querySelector('#ed-title');
    this.hint = dlg.querySelector('#ed-hint');
    this.sizeRow = dlg.querySelector('#ed-size-row');
    this.size = dlg.querySelector('#ed-size');
    this.toolBtns = [...dlg.querySelectorAll('[data-tool]')];

    this.toolBtns.forEach((b) => b.addEventListener('click', () => this.setTool(b.dataset.tool)));
    this.size.addEventListener('input', () => { this.circleMask(); this.draw(); });
    dlg.querySelector('#ed-cancel').addEventListener('click', () => this.finish(null));
    dlg.querySelector('#ed-ok').addEventListener('click', () => this.finish(this.result()));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.finish(null); });

    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerup', (e) => this.up(e));
    this.cv.addEventListener('pointercancel', (e) => this.up(e));
  }

  /** @returns Promise<canvas|null> */
  open(img, mode) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const k = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    const w = Math.round(iw * k);
    const h = Math.round(ih * k);
    this.src = mk(w, h);
    this.src.getContext('2d').drawImage(img, 0, 0, w, h);
    this.mask = mk(w, h);
    this.cv.width = w;
    this.cv.height = h;
    this.mode = mode;
    this.center = { x: w / 2, y: h / 2 };
    this.lasso = null;

    const food = mode === 'food';
    this.title.textContent = food ? '음식만 오려내기 ✂️' : '얼굴 맞추기 🙂';
    this.toolBtns.forEach((b) => (b.hidden = !food && b.dataset.tool !== 'circle'));
    this.size.value = food ? 80 : 60;
    this.setTool(food ? 'auto' : 'circle');

    this.dlg.showModal();
    return new Promise((res) => (this.resolve = res));
  }

  finish(value) {
    if (!this.resolve) return;
    this.dlg.close();
    const res = this.resolve;
    this.resolve = null;
    res(value);
  }

  setTool(tool) {
    this.tool = tool;
    this.toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    this.sizeRow.hidden = tool !== 'circle';
    const hints = {
      auto: '그릇이랑 식탁을 알아서 지워봤어요. 이상하면 다른 방법!',
      circle: this.mode === 'face' ? '끌어서 얼굴을 동그라미 안에 맞춰요' : '끌어서 옮기고, 아래로 크기를 맞춰요',
      lasso: '손가락으로 음식 둘레를 쭉— 그려요',
      all: '사진 통째로 넣어요',
    };
    this.hint.textContent = hints[tool];
    if (tool === 'auto') {
      if (!this.autoMask()) {
        this.hint.textContent = '자동으로는 잘 안 되네요… 동그라미로 해볼게요';
        this.tool = 'circle';
        this.sizeRow.hidden = false;
        this.toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === 'circle'));
        this.circleMask();
      }
    } else if (tool === 'circle') this.circleMask();
    else if (tool === 'all') this.fillMask();
    else if (tool === 'lasso') this.fillMask();
    this.draw();
  }

  // ---------- 마스크 만들기 ----------
  fillMask() {
    const m = this.mask.getContext('2d');
    m.clearRect(0, 0, this.mask.width, this.mask.height);
    m.fillStyle = '#fff';
    m.fillRect(0, 0, this.mask.width, this.mask.height);
  }

  radius() {
    return (Math.min(this.mask.width, this.mask.height) / 2) * (this.size.value / 100);
  }

  circleMask() {
    const m = this.mask.getContext('2d');
    m.clearRect(0, 0, this.mask.width, this.mask.height);
    m.fillStyle = '#fff';
    m.beginPath();
    m.arc(this.center.x, this.center.y, this.radius(), 0, Math.PI * 2);
    m.fill();
  }

  lassoMask(pts) {
    const m = this.mask.getContext('2d');
    m.clearRect(0, 0, this.mask.width, this.mask.height);
    m.fillStyle = '#fff';
    m.beginPath();
    pts.forEach((p, i) => (i ? m.lineTo(p.x, p.y) : m.moveTo(p.x, p.y)));
    m.closePath();
    m.fill();
  }

  // 가장자리에서 시작해 비슷한 색(식탁)과 하얗고 밋밋한 색(그릇)을 따라 지워 나간다.
  autoMask() {
    const W = this.src.width;
    const H = this.src.height;
    const k = Math.min(1, 240 / Math.max(W, H));
    const w = Math.max(8, Math.round(W * k));
    const h = Math.max(8, Math.round(H * k));
    const small = mk(w, h);
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(this.src, 0, 0, w, h);
    const px = sctx.getImageData(0, 0, w, h).data;
    const N = w * h;

    const plate = new Uint8Array(N);
    const cx = w / 2;
    const cy = h / 2;
    const rr = Math.min(w, h) / 2;
    for (let i = 0; i < N; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      const x = i % w, y = (i / w) | 0;
      const far = Math.hypot(x - cx, y - cy) / rr;
      // 가운데 하얀 음식(밥 등)은 지키고, 바깥쪽 하얀/회색 영역만 그릇으로 본다
      plate[i] = sat < 0.1 && max > 175 && far > 0.32 ? 1 : 0;
    }

    const bg = new Uint8Array(N);
    const q = new Int32Array(N);
    let head = 0, tail = 0;
    const seed = (i) => { if (!bg[i]) { bg[i] = 1; q[tail++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    const TOL = 13;
    while (head < tail) {
      const i = q[head++];
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) {
        if (j < 0 || j >= N || bg[j]) continue;
        const d = Math.max(
          Math.abs(px[i * 4] - px[j * 4]),
          Math.abs(px[i * 4 + 1] - px[j * 4 + 1]),
          Math.abs(px[i * 4 + 2] - px[j * 4 + 2]),
        );
        if (d < TOL || plate[j]) { bg[j] = 1; q[tail++] = j; }
      }
    }

    // 자잘한 부스러기는 버리고 큰 덩어리만 남기기
    const label = new Int32Array(N);
    const sizes = [0];
    for (let s = 0; s < N; s++) {
      if (bg[s] || label[s]) continue;
      const id = sizes.length;
      let n = 0;
      head = tail = 0;
      q[tail++] = s;
      label[s] = id;
      while (head < tail) {
        const i = q[head++];
        n++;
        const x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of nb) {
          if (j < 0 || j >= N || bg[j] || label[j]) continue;
          label[j] = id;
          q[tail++] = j;
        }
      }
      sizes.push(n);
    }
    const biggest = Math.max(0, ...sizes);
    const keepMin = biggest * 0.12;
    let kept = 0;
    const out = sctx.createImageData(w, h);
    for (let i = 0; i < N; i++) {
      if (label[i] && sizes[label[i]] >= keepMin) {
        out.data[i * 4 + 3] = 255;
        out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255;
        kept++;
      }
    }
    const ratio = kept / N;
    if (ratio < 0.04 || ratio > 0.96) return false;

    sctx.clearRect(0, 0, w, h);
    sctx.putImageData(out, 0, 0);
    const m = this.mask.getContext('2d');
    m.clearRect(0, 0, W, H);
    m.imageSmoothingEnabled = true;
    m.filter = 'blur(1.5px)';
    m.drawImage(small, 0, 0, W, H);
    m.filter = 'none';
    return true;
  }

  // ---------- 그리기 ----------
  composite() {
    const c = mk(this.src.width, this.src.height);
    const x = c.getContext('2d');
    x.drawImage(this.mask, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.drawImage(this.src, 0, 0);
    return c;
  }

  draw() {
    const { ctx, cv } = this;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = 0.22;
    ctx.drawImage(this.src, 0, 0);
    ctx.globalAlpha = 1;
    if (!(this.tool === 'lasso' && this.lasso)) ctx.drawImage(this.composite(), 0, 0);
    const lw = Math.max(3, cv.width / 140);
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#e8574b';
    ctx.lineJoin = ctx.lineCap = 'round';
    if (this.tool === 'circle') {
      ctx.setLineDash([lw * 3, lw * 2]);
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, this.radius(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.tool === 'lasso' && this.lasso) {
      ctx.beginPath();
      this.lasso.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  pos(e) {
    const b = this.cv.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * this.cv.width,
      y: ((e.clientY - b.top) / b.height) * this.cv.height,
    };
  }

  down(e) {
    this.cv.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    if (this.tool === 'lasso') this.lasso = [p];
    if (this.tool === 'circle') this.drag = { x: p.x - this.center.x, y: p.y - this.center.y };
    this.draw();
  }

  move(e) {
    const p = this.pos(e);
    if (this.tool === 'lasso' && this.lasso) {
      this.lasso.push(p);
      this.draw();
    } else if (this.tool === 'circle' && this.drag) {
      this.center = { x: p.x - this.drag.x, y: p.y - this.drag.y };
      this.circleMask();
      this.draw();
    }
  }

  up() {
    if (this.tool === 'lasso' && this.lasso) {
      if (this.lasso.length > 8) this.lassoMask(this.lasso);
      this.lasso = null;
    }
    this.drag = null;
    this.draw();
  }

  // ---------- 결과: 남은 부분만 꼭 맞게 잘라서 ----------
  result() {
    const comp = this.composite();
    const w = comp.width, h = comp.height;
    const a = this.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (a[(y * w + x) * 4 + 3] > 10) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return null;
    let bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (this.mode === 'face') {
      // 얼굴은 동그라미를 감싸는 정사각형으로
      const r = this.radius();
      x0 = this.center.x - r; y0 = this.center.y - r; bw = bh = r * 2;
    }
    const k = Math.min(1, OUT_SIDE / Math.max(bw, bh));
    const out = mk(Math.max(1, Math.round(bw * k)), Math.max(1, Math.round(bh * k)));
    out.getContext('2d').drawImage(this.mode === 'face' ? this.src : comp, x0, y0, bw, bh, 0, 0, out.width, out.height);
    return out;
  }
}
