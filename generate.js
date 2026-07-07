#!/usr/bin/env node
/**
 * generate.js — 無伺服器版：產生靜態 .ics 檔
 * -----------------------------------------------------------------------------
 * 跟 server.js 共用同一份抓取/組裝邏輯（require 進來），差別只在於「寫成檔案」
 * 而不是「架伺服器」。
 *
 * 用法：
 *   node generate.js
 * 產出：
 *   dist/all.ics, dist/f1.ics, dist/worldcup.ics, dist/football.ics,
 *   dist/nba.ics, dist/mlb.ics, dist/bwf.ics
 *
 * 之後把 dist/ 推到 GitHub，iPhone 訂閱那個 raw 網址即可（見 README「無伺服器版」）。
 * 免金鑰的賽事（F1 / MLB 道奇 / BWF）就算沒設 token 也會照常產出。
 * -----------------------------------------------------------------------------
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadFeed, buildICS, warnMissingKeys } = require('./server.js');

const OUT_DIR = path.join(__dirname, 'dist');
const FEEDS_TO_WRITE = ['all', 'f1', 'worldcup', 'football', 'nba', 'mlb', 'bwf'];

(async () => {
  warnMissingKeys();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let total = 0;
  // 先產 all（會把各賽事抓一次、寫進快取），後面個別 feed 直接吃快取，不重複打 API。
  for (const key of FEEDS_TO_WRITE) {
    const feed = await loadFeed(key);
    if (!feed) {
      console.log(`-  ${key.padEnd(9)} 已停用，略過`);
      continue;
    }
    const ics = buildICS(feed.events, feed.name);
    fs.writeFileSync(path.join(OUT_DIR, `${key}.ics`), ics, 'utf8');
    console.log(`✓  ${key.padEnd(9)} ${String(feed.events.length).padStart(3)} 筆`);
    if (key !== 'all') total += feed.events.length;
  }

  // 附一個 index.html 方便在 GitHub Pages 上直接看有哪些訂閱網址
  const listItems = FEEDS_TO_WRITE
    .map((k) => `<li><code>${k}.ics</code></li>`).join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>運動賽事行事曆</title>` +
    `<h1>運動賽事行事曆</h1><p>可訂閱的檔案：</p><ul>${listItems}</ul>`, 'utf8');

  console.log(`\n完成：共 ${total} 筆事件，輸出於 ${OUT_DIR}/`);
  console.log('把 dist/ 推到 GitHub 後，iPhone 訂閱該檔案的 raw 網址即可。');
})().catch((err) => {
  console.error('產生失敗：', err);
  process.exit(1);
});
