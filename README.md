# 🗓️ sports-calendar — 自動更新的運動賽事行事曆

把你在意的賽事變成一條 **iPhone 可訂閱的 `.ics` 行事曆**。訂閱一次，之後賽程有異動會自動同步。零依賴（只用 Node 內建模組），一個 `server.js` 就是全部。

**內建賽事**：F1 · 2026 世界盃 · 曼城（跨賽事）· NBA 湖人 · MLB 道奇 · BWF 羽球

---

## 提供的訂閱網址

| 網址 | 內容 |
|---|---|
| `/all.ics` | 全部合併 |
| `/f1.ics` | F1（正賽 + 排位 + 衝刺） |
| `/worldcup.ics` | 2026 世界盃 |
| `/football.ics` | 曼城（英超 / 歐冠 / 盃賽） |
| `/nba.ics` | NBA 湖人 |
| `/mlb.ics` | MLB 道奇 |
| `/bwf.ics` | BWF World Tour（Super 300 以上）+ 世錦賽 / 湯優盃 / 年終賽 |

打開根網址 `/` 會有一頁說明，直接列出你這台主機的所有訂閱網址。

---

## 一、拿金鑰（2 分鐘，都免費）

沒填的金鑰會自動略過那個賽事，服務不會壞掉。**F1、MLB（道奇）、BWF 都不需要任何金鑰**，部署完馬上能用。只有世界盃、曼城、NBA 需要下面兩把免費金鑰。

| 賽事 | 服務 | 註冊 |
|---|---|---|
| 世界盃 + 曼城 | football-data.org | <https://www.football-data.org/client/register> |
| NBA | balldontlie | <https://app.balldontlie.io> |

拿到後，複製 `.env.example` 成 `.env` 填進去（或在部署平台設環境變數）：

```
FOOTBALL_DATA_TOKEN=你的token
BALLDONTLIE_KEY=你的金鑰
```

---

## 二、本機先跑跑看

需要 **Node.js 18 以上**。

```bash
node server.js
```

瀏覽器開 <http://localhost:3000> 看說明頁，或 <http://localhost:3000/bwf.ics> 直接看輸出。

---

## 三、部署到有 HTTPS 的網址（訂閱一定要 HTTPS）

### 最省事：Render 免費方案

1. 把這個資料夾推到一個 GitHub repo。
2. 到 <https://render.com> → New → Web Service → 連你的 repo。
3. 設定：
   - **Build Command**：留空
   - **Start Command**：`node server.js`
4. Environment → 加入 `FOOTBALL_DATA_TOKEN`、`BALLDONTLIE_KEY`。
5. 部署完成後會拿到一個網址，例如 `https://sports-calendar-xxxx.onrender.com`。

> 免費方案閒置久了會休眠，第一次打開行事曆可能要等幾秒喚醒，屬正常。

### 或：家中主機 / Mac + Cloudflare Tunnel

`node server.js` 跑在本機，再用 `cloudflared tunnel` 對外，即可拿到 HTTPS 網址，不必開放路由器埠。

---

## 四、iPhone 訂閱

1. **設定 → 行事曆 → 帳號 → 加入帳號 → 其他**
2. 選 **加入「已訂閱的行事曆」**
3. 貼上網址（例：`https://你的網域/all.ics`）→ 下一步 → 儲存

搞定。時間以 UTC 儲存，iPhone 會**自動換算成台灣時間**；有明確開賽時間的賽事會在 **賽前 30 分鐘提醒**。

---

## ⭐ 不想付費？兩條都是 $0

**路線 A｜伺服器版（你已經有的）跑在 Render 免費方案 = $0。**
那個 US$7/月只是「不想要冷啟動」的選配。對行事曆來說，冷啟動等幾秒完全無感，所以**維持免費方案即可，不用改任何東西**。

**路線 B｜無伺服器版（`generate.js`）= $0，還能全自動。**
不架伺服器，改成產生靜態 `.ics` 檔放 GitHub，iPhone 訂閱那個網址；再用 GitHub 內建的排程幫你定期重新產生。完全免費、也不用顧一台機器。

### 無伺服器版怎麼用

1. **產生檔案**：在專案資料夾執行
   ```bash
   node generate.js
   ```
   會在 `dist/` 產出 `all.ics`、`f1.ics`、`mlb.ics`…等（免金鑰的 F1 / 道奇 / BWF 一定有；世界盃・曼城・NBA 有設金鑰才有）。

2. **放上 GitHub（拿到穩定訂閱網址）**：把整個資料夾（含 `dist/`）推到一個 GitHub repo。iPhone 訂閱這種網址：
   ```
   https://raw.githubusercontent.com/<你的帳號>/<repo>/main/dist/all.ics
   ```
   訂閱步驟跟前面第四節一樣。**只要 repo 裡的檔案更新，iPhone 訂閱就會跟著更新。**

3. **定期自動更新（$0、免伺服器）**：本專案附了 `.github/workflows/update.yml`，推上 GitHub 後會**每 12 小時自動重新產生並提交**，你的 iPhone 訂閱就一直保持最新。
   - 到 repo → Settings → Secrets and variables → Actions，加入 `FOOTBALL_DATA_TOKEN`、`BALLDONTLIE_KEY`（沒加就跳過那幾個賽事）。
   - 想手動更新：Actions 頁面按一下 **Run workflow** 即可。

> **或者「定期給我（Claude）更新」**：你也可以不排程，需要時回來找我重新產生最新的 `.ics`，把 `dist/` 換掉推上去就好。適合懶得設定 Actions、只想偶爾更新的情況。

> **最陽春：一次性匯入**（不訂閱）：直接把 `dist/all.ics` AirDrop／寄到 iPhone，點一下把賽事加進行事曆。缺點是不會自動更新，重匯可能出現重複，所以還是建議用上面的「訂閱」方式。

---

## 五、想改設定？只動 `server.js` 最上面的 `CONFIG`

- `reminderMinutes`：賽前提醒分鐘數，設 `0` 關閉。
- `cacheTtlMinutes`：多久重抓一次資料（預設 6 小時）。
- `sports.*.enabled`：個別賽事開關。
- `f1.includePractice`：要不要把三次自由練習也加進來。
- `football.teamId`：換一支球隊。目前 `65` = 曼城；到 <https://www.football-data.org> 查其他球隊 id 換上即可。
- `nba.teamId`：目前 `14` = 湖人；`null` = 全聯盟。
- `nba.season`：NBA 賽季用開季年份表示（`2025` = 2025-26 賽季）。
- `mlb.teamId`：目前 `119` = 道奇；換隊到 <https://statsapi.mlb.com/api/v1/teams?sportId=1> 查 id。

---

## 六、BWF 賽程怎麼維護

BWF 沒有乾淨的免費 API，且賽前拿不到逐場精確時間，所以用 **賽事區間的全天事件** 呈現，賽程表寫在 `server.js` 的 `BWF_2026` 陣列裡。

- 每年換季時，照現有格式更新這張表：官方賽曆 <https://bwfworldtour.bwfbadminton.com/calendar/>
- 目前已收錄 2026 年 Super 300 以上 + 大賽（含 7/28–8/2 **台北公開賽** 主場）。
- 註：2026 賽曆 **9–10 月段** 的 Super 750/1000（丹麥 / 法國 / 韓國公開賽、China Masters 等）BWF 官方尚未完整定案，確定後補進陣列即可。

---

---

## 七、更新機制

分兩層：

**① 資料自動更新（不用你動手）**
F1、世界盃、曼城、湖人、道奇的賽程都是伺服器每 6 小時（`cacheTtlMinutes`）向來源 API 重抓一次。新增場次、改期、確定開賽時間都會自動反映；iPhone 那端也會定期回來重新抓 feed。整季不需要你維護。

**② 需要你手動的部分（很少）**
- **BWF**：手工維護的清單，換季或官方補上 9–10 月賽事時，更新 `server.js` 的 `BWF_2026` 陣列。
- **每年一次**：把 `nba.season` 改成新賽季開季年份（MLB 用日期區間、會自己滾動，不用改）。
- **程式本身**：要加賽事或改設定時，改 `server.js` 後重新部署即可。用 Render + GitHub 的話，`git push` 就會自動重新部署，不必手動操作。

## 八、費用

**在免費額度內可以做到每月 US$0。**

| 項目 | 費用 |
|---|---|
| 這套程式 | 免費（你自己擁有） |
| F1（Jolpica）/ MLB（官方 StatsAPI）/ BWF | 免費、免金鑰 |
| 世界盃・曼城（football-data.org） | 免費方案 |
| NBA（balldontlie） | 免費方案 |
| 主機（Render 免費方案） | US$0（閒置會休眠，冷啟動要等幾秒） |
| 網址 | Render 免費 `*.onrender.com` 子網域即可 |

**兩種 $0 做法**：
- **無伺服器版**（`generate.js` + GitHub Actions）：完全免費、可全自動，不用顧機器。**推薦。**
- **伺服器版 + Render 免費方案**：也是 $0，只是閒置後第一次開會冷啟動幾秒。

**唯一的選配花費**：若要伺服器 24 小時常駐、零冷啟動，Render 付費方案約 **US$7/月**；或家中主機 / Mac + Cloudflare Tunnel，一樣 US$0（只多一點電費）。

> 註：NBA balldontlie 免費方案有流量限制，且部分場次「精確開賽時間」可能要付費方案才有——本工具在拿不到時間時會自動退成全天事件，不會壞。道奇（MLB 官方 API）則一律有精確時間。

---

## 資料來源

- **F1** — Jolpica（Ergast 後繼），免金鑰。
- **世界盃 / 曼城** — football-data.org 免費方案。
- **NBA** — balldontlie 免費方案。
- **MLB** — MLB 官方 StatsAPI，免金鑰。
- **BWF** — 官方賽曆人工維護（見上）。

## 授權

MIT
