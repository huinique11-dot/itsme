import * as db from './db.js';
import { Editor } from './cutout.js';
import { drawFigure, hashStr, FW, FH } from './figure.js';

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const WD = '일월화수목금토';
const prettyDate = (k) => { const d = parseKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; };

const editor = new Editor($('#editor'));
let todayKey = keyOf(new Date());
let globalFace = null;
let shownMonth = new Date();
shownMonth.setDate(1);

// ---------- 이미지 ----------
const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    }));
  }
  return imgCache.get(src);
}

function fileToImg(file) {
  const url = URL.createObjectURL(file);
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { res(im); URL.revokeObjectURL(url); };
    im.onerror = () => { rej(new Error('사진을 못 읽었어요')); URL.revokeObjectURL(url); };
    im.src = url;
  });
}

const toURL = (canvas) => {
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
};

// ---------- 데이터 ----------
const getDay = async (k) => (await db.get('days', k)) || { date: k, pieces: [] };

async function paint(canvas, day, isToday) {
  const faceSrc = day.face || (isToday ? globalFace : null);
  const [pieces, face] = await Promise.all([
    Promise.all(day.pieces.map((p) => loadImg(p.src))),
    faceSrc ? loadImg(faceSrc) : null,
  ]);
  drawFigure(canvas.getContext('2d'), { pieces, face }, hashStr(day.date), canvas.width / FW);
}

async function saveDay(day) {
  if (!day.pieces.length) return db.del('days', day.date);
  if (day.date === todayKey && globalFace) day.face = globalFace;
  const t = document.createElement('canvas');
  t.width = FW * 0.6;
  t.height = FH * 0.6;
  await paint(t, day, day.date === todayKey);
  day.thumb = toURL(t);
  return db.put('days', day.date, day);
}

// ---------- 오늘의 나 ----------
const timeOf = (t) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}`; };

function pieceList(ul, day, editable) {
  ul.innerHTML = '';
  day.pieces.forEach((p, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--tilt', `${((hashStr(p.id) % 13) - 6)}deg`);
    li.innerHTML = `<img alt="먹은 음식"><span>${timeOf(p.t)}</span>`;
    li.querySelector('img').src = p.src;
    if (editable) {
      const b = document.createElement('button');
      b.className = 'x';
      b.textContent = '✕';
      b.title = '빼기';
      b.addEventListener('click', async () => {
        if (!confirm('이거 뺄까요?')) return;
        day.pieces.splice(i, 1);
        await saveDay(day);
        renderToday();
      });
      li.append(b);
    }
    ul.append(li);
  });
}

async function renderToday(pop) {
  const day = await getDay(todayKey);
  $('#today-label').textContent = prettyDate(todayKey);
  await paint($('#today-canvas'), day, true);
  $('#empty-hint').hidden = day.pieces.length > 0;
  $('#count').textContent = day.pieces.length ? `${day.pieces.length}개` : '';
  pieceList($('#pieces'), day, true);
  if (pop) {
    const c = $('#today-canvas');
    c.classList.remove('pop');
    void c.offsetWidth;
    c.classList.add('pop');
  }
}

async function addFood(files) {
  for (const file of files) {
    let img;
    try { img = await fileToImg(file); } catch (e) { toast(e.message); continue; }
    const cut = await editor.open(img, 'food');
    if (!cut) continue;
    tick();
    const day = await getDay(todayKey);
    day.pieces.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, src: toURL(cut), t: Date.now() });
    await saveDay(day);
    await renderToday(true);
    toast(['냠! 쏙 들어갔어요', '오늘의 나에 추가!', '맛있었겠다~'][day.pieces.length % 3]);
  }
}

async function setFace(file) {
  let img;
  try { img = await fileToImg(file); } catch (e) { toast(e.message); return; }
  const cut = await editor.open(img, 'face');
  if (!cut) return;
  globalFace = toURL(cut);
  await db.put('kv', 'face', globalFace);
  tick();
  const day = await getDay(todayKey);
  day.face = globalFace;
  if (day.pieces.length) await saveDay(day);
  await renderToday(true);
  toast('얼굴이 바뀌었어요!');
}

function bindInput(sel, fn) {
  const input = $(sel);
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    if (files.length) fn(files);
  });
}
bindInput('#in-camera', addFood);
bindInput('#in-album', addFood);
bindInput('#in-face', (f) => setFace(f[0]));

// ---------- 그림 저장 ----------
async function exportDay(key) {
  const day = await getDay(key);
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 1080;
  const x = c.getContext('2d');
  x.fillStyle = '#fdf6e3';
  x.fillRect(0, 0, c.width, c.height);
  const fig = document.createElement('canvas');
  fig.width = FW * 2;
  fig.height = FH * 2;
  await paint(fig, day, key === todayKey);
  x.drawImage(fig, 60, 150);
  x.fillStyle = '#3a2b22';
  x.textAlign = 'center';
  x.font = '56px "Gamja Flower", "Gaegu", cursive';
  x.fillText(`${prettyDate(key)}의 나`, 360, 95);
  x.font = '34px "Gamja Flower", "Gaegu", cursive';
  x.fillText(`먹은 것 ${day.pieces.length}개로 만들었어요 · 내가 먹는 게 나`, 360, 1040);
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `나-${key}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}
$('#btn-save').addEventListener('click', () => exportDay(todayKey));

// ---------- 나 수납장 ----------
async function renderShelf() {
  const y = shownMonth.getFullYear();
  const m = shownMonth.getMonth();
  $('#month-label').textContent = `${y}년 ${m + 1}월`;
  const lo = `${y}-${pad(m + 1)}-01`;
  const hi = `${y}-${pad(m + 1)}-31`;
  const rows = await db.range('days', lo, hi);
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const grid = $('#grid');
  grid.innerHTML = '';
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < first; i++) grid.append(Object.assign(document.createElement('div'), { className: 'cubby blank' }));
  for (let d = 1; d <= last; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`;
    const rec = byDate.get(k);
    const cell = document.createElement('button');
    cell.className = 'cubby';
    if (k === todayKey) cell.classList.add('today');
    if (k > todayKey) { cell.classList.add('future'); cell.disabled = true; }
    cell.innerHTML = `<span class="num">${d}</span>`;
    if (rec && rec.thumb) {
      const im = document.createElement('img');
      im.src = rec.thumb;
      im.alt = `${d}일의 나`;
      cell.append(im);
      cell.classList.add('filled');
    } else if (k === todayKey) {
      cell.insertAdjacentHTML('beforeend', '<em>만드는<br>중…</em>');
    }
    if (rec || k === todayKey) cell.addEventListener('click', () => openViewer(k));
    else if (k < todayKey) cell.disabled = true;
    grid.append(cell);
  }
  const n = rows.filter((r) => r.pieces.length).length;
  $('#month-stat').textContent = n ? `이번 달 모은 나: ${n}개 · 먹은 음식 ${rows.reduce((s, r) => s + r.pieces.length, 0)}개` : '아직 수납장이 비어 있어요';
}

$('#prev').addEventListener('click', () => { shownMonth.setMonth(shownMonth.getMonth() - 1); renderShelf(); });
$('#next').addEventListener('click', () => { shownMonth.setMonth(shownMonth.getMonth() + 1); renderShelf(); });

let viewingKey;
async function openViewer(k) {
  if (k === todayKey) { switchView('today'); return; }
  viewingKey = k;
  const day = await getDay(k);
  $('#v-title').textContent = `${prettyDate(k)}의 나`;
  await paint($('#v-canvas'), day, false);
  pieceList($('#v-pieces'), day, false);
  $('#viewer').showModal();
}
$('#v-close').addEventListener('click', () => $('#viewer').close());
$('#v-save').addEventListener('click', () => exportDay(viewingKey));

// ---------- 탭 ----------
function switchView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'shelf') renderShelf();
  else renderToday();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));

// ---------- 0시 ~ 0시 ----------
function tick() {
  const now = new Date();
  const k = keyOf(now);
  if (k !== todayKey) {
    todayKey = k;
    renderToday();
    if ($('#view-shelf').classList.contains('active')) renderShelf();
    toast('새로운 하루! 어제의 나는 수납장에 들어갔어요');
  }
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.ceil((mid - now) / 60000);
  $('#countdown').textContent = `자정까지 ${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}
setInterval(tick, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

// ---------- 기타 ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// 제목 글자를 하나씩 삐뚤빼뚤하게
const title = $('#title');
title.innerHTML = [...title.textContent]
  .map((ch, i) => ch === ' ' ? ' ' : `<span style="--r:${((i * 37) % 15) - 7}deg;--y:${((i * 53) % 7) - 3}px">${ch}</span>`)
  .join('');

(async function init() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  globalFace = (await db.get('kv', 'face')) || null;
  tick();
  if (document.fonts) await document.fonts.ready;
  renderToday();
})();
