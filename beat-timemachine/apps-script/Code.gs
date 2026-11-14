/**
 * 비트 타임머신 기록표 (구글 시트 + Apps Script)
 *
 * 1) 새 구글 시트를 만들고  확장 프로그램 > Apps Script  에 이 코드를 통째로 붙여 넣기
 * 2) 위쪽 함수 목록에서 「setup」을 골라 ▶ 실행 (권한 허용)
 *    → 학급코드표, 3학년 1반 ~ 9반, 그외 시트가 만들어지고 학번마다 학급코드가 부여됨
 * 3) 배포 > 새 배포 > 유형: 웹 앱 / 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 * 4) 나온 웹 앱 URL(…/exec)을 게임의 beat-timemachine/config.js 에 넣기
 */

const GRADE = 3;            // 학년
const CLASSES = 9;          // 1반 ~ 9반
const FIRST_NO = 0;         // 번호 시작 (30100 → 00번)
const LAST_NO = 28;         // 번호 끝   (30128 → 28번)
const CODE_SHEET = '학급코드표';
const OTHER_SHEET = '그외';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0 O 1 I 제외
const CODE_LEN = 4;

const HEAD = ['기록ID', '저장 시각', '학번', '닉네임', '스테이지', '시대', '결과', '랭크', '점수',
  '가락 잡기(%)', '셈여림 정확도(%)', 'PERFECT', '최대 콤보', '연습 모드', '감상 문장', '비고'];

function className_(c) { return GRADE + '학년 ' + c + '반'; }

/** 처음 한 번 실행: 시트와 학급코드를 만든다. 이미 있는 코드는 바꾸지 않는다. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  let cs = ss.getSheetByName(CODE_SHEET);
  if (!cs) {
    cs = ss.insertSheet(CODE_SHEET, 0);
    const used = {};
    const rows = [['학번', '반', '번호', '학급코드', '이름(선택)']];
    for (let c = 1; c <= CLASSES; c++) {
      for (let n = FIRST_NO; n <= LAST_NO; n++) {
        const sid = String(GRADE * 10000 + c * 100 + n);
        let code;
        do { code = randomCode_(); } while (used[code]);
        used[code] = true;
        rows.push([sid, c, n, code, '']);
      }
    }
    cs.getRange(1, 1, rows.length, 5).setNumberFormat('@').setValues(rows);
    cs.setFrozenRows(1);
    cs.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#ffe9a8');
    cs.getRange(2, 4, rows.length - 1, 1).setFontFamily('Roboto Mono').setFontWeight('bold');
    cs.autoResizeColumns(1, 5);
  }
  for (let c = 1; c <= CLASSES; c++) recordSheet_(className_(c));
  recordSheet_(OTHER_SHEET);
  const s1 = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  ss.toast('준비 완료! 학급코드표를 확인하세요.');
}

function randomCode_() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  return s;
}

function recordSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#d9d2ff');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sh.getRange('C:C').setNumberFormat('@');
  }
  return sh;
}

/** 학번과 학급코드가 학급코드표와 일치하면 그 반 시트 이름, 아니면 null */
function matchClass_(sid, code) {
  sid = String(sid || '').trim();
  code = String(code || '').trim().toUpperCase();
  if (!/^\d{5}$/.test(sid) || !code) return null;
  const cs = SpreadsheetApp.getActive().getSheetByName(CODE_SHEET);
  if (!cs) return null;
  const vals = cs.getRange(2, 1, cs.getLastRow() - 1, 4).getValues();
  for (const r of vals) {
    if (String(r[0]).trim() === sid) {
      return String(r[3]).trim().toUpperCase() === code ? className_(Number(r[1])) : null;
    }
  }
  return null;
}

function safe_(v, max) {
  v = String(v == null ? '' : v).slice(0, max || 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;   // 수식으로 해석되지 않게
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** 로그인 화면에서 학급코드 확인 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'verify') {
    const cls = matchClass_(p.sid, p.code);
    return json_({ ok: true, verified: !!cls, sheet: cls || OTHER_SHEET });
  }
  return json_({ ok: true, msg: '비트 타임머신 기록표가 작동 중입니다.' });
}

/** 게임 기록·감상 문장 저장 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const d = JSON.parse(e.postData.contents);
    const cls = matchClass_(d.sid, d.code);
    const sh = recordSheet_(cls || OTHER_SHEET);
    const id = safe_(d.id, 40);

    if (d.type === 'reflection') {
      const last = sh.getLastRow();
      let row = -1;
      if (last > 1) {
        const ids = sh.getRange(2, 1, last - 1, 1).getValues();
        for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) { row = i + 2; break; }
      }
      if (row > 0) sh.getRange(row, 15).setValue(safe_(d.text, 1000));
      else sh.appendRow([id, new Date(), safe_(d.sid, 10), safe_(d.nick, 20), '', '', '', '', '', '', '', '', '', '', safe_(d.text, 1000), '감상만 제출']);
    } else {
      const note = cls ? '' : (d.sid ? '학번·학급코드 불일치' : '학번 없음');
      sh.appendRow([id, new Date(), safe_(d.sid, 10), safe_(d.nick, 20), Number(d.stage) || '', safe_(d.era, 20),
        safe_(d.result, 10), safe_(d.rank, 2), Number(d.score) || 0, Number(d.notePct) || 0, Number(d.dynPct) || 0,
        Number(d.perfect) || 0, Number(d.maxCombo) || 0, d.practice ? '예' : '', '', note]);
    }
    return json_({ ok: true, verified: !!cls, sheet: sh.getName() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
