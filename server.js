/**
 * sports-calendar — 自動更新的運動賽事行事曆 feed 服務
 * -----------------------------------------------------------------------------
 * 零依賴（只用 Node 內建模組 + 全域 fetch），Node 18+ 即可執行。
 *
 * 提供的訂閱網址（部署後）：
 *   /all.ics        全部合併
 *   /f1.ics         F1（正賽 + 排位 + 衝刺）
 *   /worldcup.ics   2026 世界盃
 *   /football.ics   曼城（跨賽事：英超 / 歐冠 / 盃賽）
 *   /nba.ics        NBA
 *   /bwf.ics        BWF 羽球（World Tour Super 300+ 與大賽）
 *   /               說明頁
 *
 * iPhone 訂閱方式：設定 → 行事曆 → 帳號 → 加入帳號 → 其他 → 加入行事曆
 * 貼上網址，例如：https://你的網域/all.ics
 * (賽事時間以 UTC 輸出，iPhone 會自動換算成台灣時間，不需另外設定。)
 * -----------------------------------------------------------------------------
 */

'use strict';
const http = require('http');

/* ============================================================================
 * CONFIG — 想改設定基本上只動這一區
 * ==========================================================================*/
const CONFIG = {
  port: process.env.PORT || 3000,

  // 賽前提醒（分鐘）。設 0 或 null 關閉。只套用在「有明確開賽時間」的賽事。
  reminderMinutes: 30,

  // 資料快取時間（分鐘）。避免每次有人開行事曆就打一次外部 API。
  cacheTtlMinutes: 360, // 6 小時

  // 各運動開關
  sports: {
    f1:       { enabled: true },
    worldcup: { enabled: true },
    football: { enabled: true },
    nba:      { enabled: true },
    mlb:      { enabled: true },
    bwf:      { enabled: true },
  },

  // ---- F1 ----
  f1: {
    // 要納入行事曆的場次類型
    includeRace: true,
    includeQualifying: true,
    includeSprint: true,
    includePractice: false, // 三次自由練習，預設不加避免太雜
  },

  // ---- 足球（football-data.org）----
  // 免費 token 註冊：https://www.football-data.org/client/register
  football: {
    token: process.env.FOOTBALL_DATA_TOKEN || '', // ← 填你的 token（或用環境變數）
    teamId: 65,      // 65 = Manchester City FC（football-data 的 team id）
    teamName: '曼城',
  },

  // ---- 世界盃（同樣走 football-data.org，共用上面的 token）----
  worldcup: {
    competitionCode: 'WC', // World Cup
  },

  // ---- NBA（balldontlie）----
  // 免費金鑰註冊：https://app.balldontlie.io
  nba: {
    apiKey: process.env.BALLDONTLIE_KEY || '', // ← 填你的金鑰（或用環境變數）
    season: 2025,     // NBA 用開季年份表示（2025 = 2025-26 賽季）
    teamId: 14,       // 14 = Los Angeles Lakers（null = 全聯盟）
    teamName: '湖人',
    maxPages: 60,     // 分頁上限保護
  },

  // ---- MLB（MLB 官方 StatsAPI，免金鑰、免註冊）----
  mlb: {
    teamId: 119,      // 119 = Los Angeles Dodgers
    teamName: '道奇',
  },
};

/* ============================================================================
 * BWF 賽程（人工維護的 curated 清單）
 * ----------------------------------------------------------------------------
 * BWF 沒有乾淨的免費 API，且賽前也拿不到逐場精確時間，因此以「賽事區間」的
 * 全天事件呈現。以下為 2026 BWF World Tour Super 300 以上 + 大賽，日期核對自
 * BWF 官方賽曆 / 維基 2026 BWF season。
 * 每年換季時更新這張表即可：https://bwfworldtour.bwfbadminton.com/calendar/
 * 日期用 [YYYY, M, D]（M 為 1–12，會自動處理，含當天）。
 * ==========================================================================*/
const BWF_2026 = [
  { name: 'Malaysia Open',        level: 'Super 1000', city: 'Kuala Lumpur',  start: [2026, 1, 6],  end: [2026, 1, 11] },
  { name: 'India Open',           level: 'Super 750',  city: 'New Delhi',     start: [2026, 1, 13], end: [2026, 1, 18] },
  { name: 'Indonesia Masters',    level: 'Super 500',  city: 'Jakarta',       start: [2026, 1, 20], end: [2026, 1, 25] },
  { name: 'Thailand Masters',     level: 'Super 300',  city: 'Bangkok',       start: [2026, 1, 27], end: [2026, 2, 1]  },
  { name: 'German Open',          level: 'Super 300',  city: 'Mülheim',       start: [2026, 2, 24], end: [2026, 3, 1]  },
  { name: 'All England Open',     level: 'Super 1000', city: 'Birmingham',    start: [2026, 3, 3],  end: [2026, 3, 8]  },
  { name: 'Swiss Open',           level: 'Super 300',  city: 'Basel',         start: [2026, 3, 10], end: [2026, 3, 15] },
  { name: 'Orléans Masters',      level: 'Super 300',  city: 'Orléans',       start: [2026, 3, 17], end: [2026, 3, 22] },
  { name: 'Thomas & Uber Cup',    level: '團體賽',      city: 'Horsens',       start: [2026, 4, 24], end: [2026, 5, 3]  },
  { name: 'Thailand Open',        level: 'Super 500',  city: 'Bangkok',       start: [2026, 5, 12], end: [2026, 5, 17] },
  { name: 'Malaysia Masters',     level: 'Super 500',  city: 'Kuala Lumpur',  start: [2026, 5, 19], end: [2026, 5, 24] },
  { name: 'Singapore Open',       level: 'Super 750',  city: 'Singapore',     start: [2026, 5, 26], end: [2026, 5, 31] },
  { name: 'Indonesia Open',       level: 'Super 1000', city: 'Jakarta',       start: [2026, 6, 2],  end: [2026, 6, 7]  },
  { name: 'Australian Open',      level: 'Super 500',  city: 'Sydney',        start: [2026, 6, 9],  end: [2026, 6, 14] },
  { name: 'Macau Open',           level: 'Super 300',  city: 'Macau',         start: [2026, 6, 16], end: [2026, 6, 21] },
  { name: 'Canada Open',          level: 'Super 300',  city: 'Markham',       start: [2026, 6, 30], end: [2026, 7, 5]  },
  { name: 'Japan Open',           level: 'Super 750',  city: 'Tokyo',         start: [2026, 7, 14], end: [2026, 7, 19] },
  { name: 'China Open',           level: 'Super 1000', city: 'Changzhou',     start: [2026, 7, 21], end: [2026, 7, 26] },
  { name: 'Chinese Taipei Open',  level: 'Super 300',  city: 'Taipei',        start: [2026, 7, 28], end: [2026, 8, 2]  }, // 主場
  { name: 'World Championships',  level: '世界錦標賽',   city: 'New Delhi',     start: [2026, 8, 17], end: [2026, 8, 23] },
  { name: 'Korea Masters',        level: 'Super 300',  city: 'Gwangju',       start: [2026, 11, 3], end: [2026, 11, 8] },
  { name: 'Japan Masters',        level: 'Super 500',  city: 'Kumamoto',      start: [2026, 11, 10],end: [2026, 11, 15]},
  { name: 'Hong Kong Open',       level: 'Super 500',  city: 'Hong Kong',     start: [2026, 11, 17],end: [2026, 11, 22]},
  { name: 'BWF World Tour Finals',level: 'Finals',     city: 'Hangzhou',      start: [2026, 12, 9], end: [2026, 12, 13]},
  // 註：2026 賽曆 9–10 月段的 Super 750/1000（如 China Masters、丹麥公開賽、法國公開賽、
  // 韓國公開賽等）BWF 尚未於官方賽曆完整定案。確定後照上面格式補進這張表即可。
];

/* ============================================================================
 * 小工具
 * ==========================================================================*/
const pad = (n) => String(n).padStart(2, '0');

// 產生 iCalendar 的 UTC 時間戳：YYYYMMDDTHHMMSSZ
function toICSDateTimeUTC(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) + 'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) + 'Z'
  );
}

// 全天事件用的日期：YYYYMMDD
function toICSDate(y, m, d) {
  return `${y}${pad(m)}${pad(d)}`;
}

// 轉義 ICS 文字欄位
function esc(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// 依 RFC5545 將過長的行折成 75 octet（用 UTF-8 位元組計）
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // 不要切在多位元組字元中間
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.slice(start, end).toString('utf8'));
    start = end;
    limit = 74; // 續行前面會加一個空白
  }
  return out.join('\r\n ');
}

// 穩定的 UID（同一場賽事永遠同一個 UID，讓行事曆能就地更新而非重複）
function makeUid(kind, id) {
  return `${kind}-${id}@sports-calendar.local`;
}

/* ============================================================================
 * 正規化事件格式
 *  timed  : { uid, summary, startUTC:Date, endUTC:Date, allDay:false, location, description, url }
 *  allDay : { uid, summary, startYMD:[y,m,d], endYMDExclusive:[y,m,d], allDay:true, location, description }
 * ==========================================================================*/

/* ---------------------------- F1（Jolpica / Ergast）---------------------- */
async function fetchF1() {
  const url = 'https://api.jolpi.ca/ergast/f1/current.json';
  const res = await fetch(url, { headers: { 'User-Agent': 'sports-calendar' } });
  if (!res.ok) throw new Error(`F1 API ${res.status}`);
  const data = await res.json();
  const races = data?.MRData?.RaceTable?.Races || [];
  const events = [];

  const addSession = (race, label, dateStr, timeStr, suffix) => {
    if (!dateStr || !timeStr) return;
    const start = new Date(`${dateStr}T${timeStr}`); // time 形如 "13:00:00Z"
    if (isNaN(start)) return;
    const durationMin = label === '正賽' ? 120 : 60;
    const end = new Date(start.getTime() + durationMin * 60000);
    const loc = [race.Circuit?.circuitName, race.Circuit?.Location?.locality, race.Circuit?.Location?.country]
      .filter(Boolean).join(', ');
    events.push({
      uid: makeUid('f1', `${race.season}-${race.round}-${suffix}`),
      summary: `🏎️ F1 ${race.raceName} — ${label}`,
      startUTC: start,
      endUTC: end,
      allDay: false,
      location: loc,
      description: `${race.raceName}（第 ${race.round} 站）${label}`,
      url: race.url || '',
    });
  };

  for (const r of races) {
    if (CONFIG.f1.includePractice) {
      addSession(r, '自由練習一', r.FirstPractice?.date, r.FirstPractice?.time, 'fp1');
      addSession(r, '自由練習二', r.SecondPractice?.date, r.SecondPractice?.time, 'fp2');
      addSession(r, '自由練習三', r.ThirdPractice?.date, r.ThirdPractice?.time, 'fp3');
    }
    if (CONFIG.f1.includeSprint && r.Sprint) {
      addSession(r, '衝刺賽', r.Sprint.date, r.Sprint.time, 'sprint');
    }
    if (CONFIG.f1.includeQualifying && r.Qualifying) {
      addSession(r, '排位賽', r.Qualifying.date, r.Qualifying.time, 'quali');
    }
    if (CONFIG.f1.includeRace) {
      addSession(r, '正賽', r.date, r.time, 'race');
    }
  }
  return events;
}

/* ------------------- football-data.org 共用抓取 --------------------------- */
async function footballDataGet(path) {
  if (!CONFIG.football.token) throw new Error('缺少 FOOTBALL_DATA_TOKEN');
  const res = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: { 'X-Auth-Token': CONFIG.football.token, 'User-Agent': 'sports-calendar' },
  });
  if (res.status === 429) throw new Error('football-data 觸發流量限制（免費版 10 次/分）');
  if (!res.ok) throw new Error(`football-data API ${res.status}`);
  return res.json();
}

function footballMatchToEvent(m, emoji, tag) {
  const start = new Date(m.utcDate);
  if (isNaN(start)) return null;
  const end = new Date(start.getTime() + 115 * 60000); // 約 1h55m
  const home = m.homeTeam?.shortName || m.homeTeam?.name || 'TBD';
  const away = m.awayTeam?.shortName || m.awayTeam?.name || 'TBD';
  const comp = m.competition?.name || '';
  const stage = m.stage && m.stage !== 'REGULAR_SEASON' ? ` [${m.stage}]` : '';
  return {
    uid: makeUid('fd', m.id),
    summary: `${emoji} ${home} vs ${away}`,
    startUTC: start,
    endUTC: end,
    allDay: false,
    location: m.venue || '',
    description: `${tag}｜${comp}${stage}`.trim(),
    url: '',
  };
}

/* ---------------------------- 曼城（跨賽事）------------------------------ */
async function fetchFootball() {
  // 用「球隊賽程」端點一次抓齊各賽事（英超 / 歐冠 / 盃賽）的未來場次
  const data = await footballDataGet(`/teams/${CONFIG.football.teamId}/matches?status=SCHEDULED`);
  const matches = data?.matches || [];
  return matches.map((m) => footballMatchToEvent(m, '⚽️', CONFIG.football.teamName))
                .filter(Boolean);
}

/* ---------------------------- 2026 世界盃 -------------------------------- */
async function fetchWorldCup() {
  const data = await footballDataGet(`/competitions/${CONFIG.worldcup.competitionCode}/matches`);
  const matches = data?.matches || [];
  return matches
    .filter((m) => m.status === 'SCHEDULED' || m.status === 'TIMED')
    .map((m) => footballMatchToEvent(m, '🏆', '世界盃'))
    .filter(Boolean);
}

/* ------------------------------- NBA ------------------------------------ */
async function fetchNBA() {
  if (!CONFIG.nba.apiKey) throw new Error('缺少 BALLDONTLIE_KEY');
  const events = [];
  let cursor = null;
  let pages = 0;
  do {
    const params = new URLSearchParams();
    params.set('seasons[]', String(CONFIG.nba.season));
    params.set('per_page', '100');
    if (cursor) params.set('cursor', String(cursor));
    if (CONFIG.nba.teamId) params.set('team_ids[]', String(CONFIG.nba.teamId));

    const res = await fetch(`https://api.balldontlie.io/v1/games?${params.toString()}`, {
      headers: { Authorization: CONFIG.nba.apiKey, 'User-Agent': 'sports-calendar' },
    });
    if (res.status === 401) throw new Error('NBA 金鑰無效');
    if (!res.ok) throw new Error(`balldontlie API ${res.status}`);
    const data = await res.json();

    for (const g of data.data || []) {
      const home = g.home_team?.full_name || 'Home';
      const away = g.visitor_team?.full_name || 'Away';
      // datetime 有明確開賽時間就用（UTC），否則退成全天事件
      if (g.datetime) {
        const start = new Date(g.datetime);
        if (!isNaN(start)) {
          const end = new Date(start.getTime() + 150 * 60000);
          events.push({
            uid: makeUid('nba', g.id), summary: `🏀 ${away} @ ${home}`,
            startUTC: start, endUTC: end, allDay: false,
            location: '', description: `NBA｜${g.season} 賽季`, url: '',
          });
          continue;
        }
      }
      if (g.date) {
        const [y, m, d] = g.date.split('T')[0].split('-').map(Number);
        const endD = new Date(Date.UTC(y, m - 1, d + 1));
        events.push({
          uid: makeUid('nba', g.id), summary: `🏀 ${away} @ ${home}`,
          allDay: true, startYMD: [y, m, d],
          endYMDExclusive: [endD.getUTCFullYear(), endD.getUTCMonth() + 1, endD.getUTCDate()],
          location: '', description: `NBA｜${g.season} 賽季（時間待定）`,
        });
      }
    }
    cursor = data.meta?.next_cursor || null;
    pages++;
  } while (cursor && pages < CONFIG.nba.maxPages);
  return events;
}

/* ------------------------------- MLB ------------------------------------ */
// MLB 官方 StatsAPI，免金鑰、免註冊，賽程含明確開賽時間（UTC）。
async function fetchMLB() {
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + 240 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    sportId: '1',
    teamId: String(CONFIG.mlb.teamId),
    startDate,
    endDate,
    gameType: 'R,F,D,L,W', // 例行賽 + 季後賽（排除熱身賽）
  });
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?${params.toString()}`, {
    headers: { 'User-Agent': 'sports-calendar' },
  });
  if (!res.ok) throw new Error(`MLB API ${res.status}`);
  const data = await res.json();
  const events = [];
  for (const day of data.dates || []) {
    for (const g of day.games || []) {
      const start = new Date(g.gameDate);
      if (isNaN(start)) continue;
      const end = new Date(start.getTime() + 180 * 60000); // 約 3 小時
      const away = g.teams?.away?.team?.name || 'Away';
      const home = g.teams?.home?.team?.name || 'Home';
      events.push({
        uid: makeUid('mlb', g.gamePk),
        summary: `⚾️ ${away} @ ${home}`,
        startUTC: start,
        endUTC: end,
        allDay: false,
        location: g.venue?.name || '',
        description: `MLB｜${CONFIG.mlb.teamName}`,
        url: '',
      });
    }
  }
  return events;
}

/* ------------------------------- BWF ------------------------------------ */
function fetchBWF() {
  return BWF_2026.map((t, i) => {
    const [ey, em, ed] = t.end;
    const endEx = new Date(Date.UTC(ey, em - 1, ed + 1)); // 全天事件 DTEND 為排除制
    return {
      uid: makeUid('bwf', `${t.name}-${t.start.join('')}`.replace(/\s+/g, '')),
      summary: `🏸 ${t.name}（${t.level}）`,
      allDay: true,
      startYMD: t.start,
      endYMDExclusive: [endEx.getUTCFullYear(), endEx.getUTCMonth() + 1, endEx.getUTCDate()],
      location: t.city,
      description: `BWF World Tour｜${t.level}｜${t.city}`,
    };
  });
}

/* ============================================================================
 * ICS 組裝
 * ==========================================================================*/
function eventToVEVENT(ev, stampUTC) {
  const lines = ['BEGIN:VEVENT'];
  lines.push(`UID:${ev.uid}`);
  lines.push(`DTSTAMP:${toICSDateTimeUTC(stampUTC)}`);

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(...ev.startYMD)}`);
    lines.push(`DTEND;VALUE=DATE:${toICSDate(...ev.endYMDExclusive)}`);
  } else {
    lines.push(`DTSTART:${toICSDateTimeUTC(ev.startUTC)}`);
    lines.push(`DTEND:${toICSDateTimeUTC(ev.endUTC)}`);
  }

  lines.push(`SUMMARY:${esc(ev.summary)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.url) lines.push(`URL:${esc(ev.url)}`);

  // 賽前提醒（只加在有明確開賽時間的賽事）
  if (!ev.allDay && CONFIG.reminderMinutes) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${esc(ev.summary)}`);
    lines.push(`TRIGGER:-PT${CONFIG.reminderMinutes}M`);
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  return lines;
}

function buildICS(events, calName) {
  const stamp = new Date();
  const ttlMin = CONFIG.cacheTtlMinutes;
  let out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//sports-calendar//TW//ZH',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:Asia/Taipei',
    `REFRESH-INTERVAL;VALUE=DURATION:PT${ttlMin}M`,
    `X-PUBLISHED-TTL:PT${ttlMin}M`,
  ];
  for (const ev of events) out = out.concat(eventToVEVENT(ev, stamp));
  out.push('END:VCALENDAR');
  return out.map(foldLine).join('\r\n') + '\r\n';
}

/* ============================================================================
 * 快取 + feed 定義
 * ==========================================================================*/
const cache = new Map(); // key -> { at:number, events:[] }

async function getEvents(key, fetcher) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CONFIG.cacheTtlMinutes * 60000) return hit.events;
  try {
    const events = await fetcher();
    cache.set(key, { at: now, events });
    return events;
  } catch (err) {
    console.warn(`[${key}] 取得失敗：${err.message}`);
    if (hit) return hit.events;   // 用舊快取撐著，不讓整個 feed 壞掉
    return [];
  }
}

const FEEDS = {
  f1:       { name: 'F1',          enabled: () => CONFIG.sports.f1.enabled,       load: () => getEvents('f1', fetchF1) },
  worldcup: { name: '2026 世界盃',  enabled: () => CONFIG.sports.worldcup.enabled, load: () => getEvents('worldcup', fetchWorldCup) },
  football: { name: '曼城',         enabled: () => CONFIG.sports.football.enabled, load: () => getEvents('football', fetchFootball) },
  nba:      { name: 'NBA 湖人',     enabled: () => CONFIG.sports.nba.enabled,      load: () => getEvents('nba', fetchNBA) },
  mlb:      { name: 'MLB 道奇',     enabled: () => CONFIG.sports.mlb.enabled,      load: () => getEvents('mlb', fetchMLB) },
  bwf:      { name: 'BWF 羽球',     enabled: () => CONFIG.sports.bwf.enabled,      load: () => Promise.resolve(fetchBWF()) },
};

async function loadFeed(key) {
  if (key === 'all') {
    const all = [];
    for (const [k, f] of Object.entries(FEEDS)) {
      if (!f.enabled()) continue;
      all.push(...await f.load());
    }
    return { events: all, name: '運動賽事（全部）' };
  }
  const f = FEEDS[key];
  if (!f || !f.enabled()) return null;
  return { events: await f.load(), name: f.name };
}

/* ============================================================================
 * HTTP 伺服器
 * ==========================================================================*/
function indexHTML(host) {
  const base = `https://${host}`;
  const rows = ['all', 'f1', 'worldcup', 'football', 'nba', 'mlb', 'bwf']
    .filter((k) => k === 'all' || FEEDS[k].enabled())
    .map((k) => {
      const label = k === 'all' ? '全部合併' : FEEDS[k].name;
      return `<tr><td>${label}</td><td><code>${base}/${k}.ics</code></td></tr>`;
    }).join('');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>運動賽事行事曆</title>
<style>
  body{font-family:-apple-system,"PingFang TC",system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}
  h1{font-size:1.4rem} table{border-collapse:collapse;width:100%;margin:16px 0}
  td{border-bottom:1px solid #eee;padding:8px 6px;font-size:.95rem} code{background:#f4f4f5;padding:2px 6px;border-radius:5px;font-size:.82rem;word-break:break-all}
  ol{padding-left:1.2em} .tip{background:#f0f7ff;border-left:3px solid #3b82f6;padding:10px 14px;border-radius:6px;font-size:.9rem}
</style></head><body>
<h1>🗓️ 運動賽事行事曆 feed</h1>
<p>複製下列任一網址到 iPhone 訂閱，賽程更新會自動同步。</p>
<table>${rows}</table>
<h2 style="font-size:1.05rem">iPhone 訂閱步驟</h2>
<ol>
  <li>設定 → 行事曆 → 帳號 → 加入帳號 → 其他</li>
  <li>加入「已訂閱的行事曆」</li>
  <li>貼上上面的網址 → 下一步 → 儲存</li>
</ol>
<p class="tip">時間以 UTC 儲存，iPhone 會自動換算成台灣時間；賽前 ${CONFIG.reminderMinutes} 分鐘會提醒（有明確開賽時間的賽事）。</p>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${CONFIG.port}`;
    const url = new URL(req.url, `http://${host}`);
    const path = url.pathname;

    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHTML(host));
      return;
    }
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    const m = path.match(/^\/(all|f1|worldcup|football|nba|mlb|bwf)\.ics$/);
    if (m) {
      const feed = await loadFeed(m[1]);
      if (!feed) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('該賽事目前已停用');
        return;
      }
      const ics = buildICS(feed.events, feed.name);
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${m[1]}.ics"`,
        'Cache-Control': `public, max-age=${CONFIG.cacheTtlMinutes * 60}`,
      });
      res.end(ics);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('伺服器錯誤');
  }
});

function warnMissingKeys() {
  const missing = [];
  if ((CONFIG.sports.football.enabled || CONFIG.sports.worldcup.enabled) && !CONFIG.football.token)
    missing.push('FOOTBALL_DATA_TOKEN（世界盃 + 曼城）');
  if (CONFIG.sports.nba.enabled && !CONFIG.nba.apiKey)
    missing.push('BALLDONTLIE_KEY（NBA）');
  if (missing.length) console.warn('⚠️  尚未設定金鑰，對應賽事會略過：\n   - ' + missing.join('\n   - '));
}

// 只有「直接執行 server.js」時才啟動 HTTP 伺服器。
// 被 generate.js 以 require 載入時不會啟動，只借用上面的函式（單一來源）。
if (require.main === module) {
  server.listen(CONFIG.port, () => {
    console.log(`sports-calendar 已啟動：http://localhost:${CONFIG.port}`);
    warnMissingKeys();
  });
}

module.exports = { CONFIG, FEEDS, loadFeed, buildICS, warnMissingKeys };
