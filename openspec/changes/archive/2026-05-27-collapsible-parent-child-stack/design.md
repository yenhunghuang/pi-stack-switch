## Context

`/stack` 目前使用 pi 內建 `SettingsList` 呈現可切換資源。`Extensions`、`Skills`、`Prompts`、`Themes` 以頁籤分開，但每個分頁內仍是平面清單。當 skills 數量增加時，使用者需要在大量同層 rows 中掃描目標項目。

現有資料模型已具備父子關係：child resources 透過 `source` 指向 parent Extension，`buildSettingItems` 也已建立 `childrenByParent` 與 `parentByChild`。因此這次變更應優先重用既有關係，不引入 category 分組、不新增 inventory schema，並維持目前 `/stack` 的視覺語言：tab bar、簡約分隔線、SettingsList row、右側 value 欄、`● ON` / `○ OFF` 狀態符號與 muted help text。

## Goals / Non-Goals

**Goals:**

- 在 `Skills`、`Prompts`、`Themes` 分頁中，以 parent Extension 為 root row 呈現可折疊父子清單。
- 保持 `Extensions` 分頁現有 flat list 與 toggle 行為。
- Parent row 僅作為 UI fold/unfold 控制，不寫入 settings、不切換 extension 或 child 狀態。
- Child row 保留既有 `Enter` / `Space` toggle 行為與 settings persistence。
- 搜尋時能找到被收合 parent 底下的 child resources。
- 視覺設計必須像現有 `/stack` 的自然延伸，而非引入全新的 tree explorer UI。

**Non-Goals:**

- 不使用 `category` 欄位建立 tree 或分組。
- 不新增巢狀 TUI component、不修改 `@mariozechner/pi-tui` / `@earendil-works/pi-tui` 的 `SettingsList` 實作。
- 不改變 `inventory.json` schema、不改變 settings.json filter 寫入格式。
- 不讓 parent row 承擔 bulk toggle；若要切換 Extension 本身，仍在 `Extensions` 分頁操作。

## Decisions

### Decision 1: 以 `source` 父子關係建構樹，而非 `category`

`Skills`、`Prompts`、`Themes` 的 child item 若有 `source`，就歸入對應 parent Extension root；沒有 `source` 的 item 則歸入 `Standalone` root。這符合 pi extension package 的實際載入關係，也避免使用者把 category 誤解為依賴或啟用關係。

替代方案是使用 `category` 做折疊分組，但 category 是人工標籤，可能跨 package、跨用途，不能表達 parent Extension 是否關閉，也不能支援現有 tandem toggle 與 warning 語意。

### Decision 2: 在應用層把 tree 攤平成 `SettingItem[]`

`SettingsList` 只接受 flat `SettingItem[]`。本變更會在 `buildSettingItems` 中注入 parent rows，並根據 fold state 決定是否加入 child rows。這讓實作能沿用既有 `SettingsList` 的搜尋、捲動、description 與 keyboard handling，不需要修改外部 TUI component。

Parent row 使用特殊 id，例如 `parent:<tab>:<parentId>`；child row 維持既有 `<resourceType>:<itemId>`。`onChange` 收到 parent id 時只更新 fold state 並重建清單，**且藉由在 `SettingsList` 實例重建後顯式修正其 `selectedIndex`，使游標維持鎖定在目前折疊的 parent row，保持選取位置不跳回第一行**；收到 child id 時才執行既有 toggle 與 persistence flow。

### Decision 3: Parent row 視覺維持目前 SettingsList 風格

Parent row label 採用簡潔符號與名稱，例如：

```text
▾ Pi Lens                     1/2 ON
  ast-grep                    ● ON
  LSP Navigation              ○ OFF
```

- `▾` 表示展開，`▸` 表示收合。
- child row 僅縮排兩格，不再顯示 `Pi Lens › ast-grep` 前綴。
- parent row 右側 value 顯示 child 啟用摘要，例如 `1/2 ON`。
- 不使用 emoji-heavy tree、不新增 box、不改變 tab bar 或 help text 的整體風格。

這讓父子結構改善掃描性，同時仍像現有 flat list 的延伸。

### Decision 4: Parent disabled warning 集中在 parent row

若 parent Extension 關閉但 child resources 中仍有啟用項目，parent row 顯示簡短警示，例如：

```text
▾ Pi Lens                     ⚠ 1/2 ON
```

選到 parent row 時，description 顯示詳細說明，例如 `Pi Lens extension is off. Enable it from Extensions tab.`。Child row 不再逐項重複 `(⚠️ Requires <Parent>)`，避免 tree 展開後每列都帶警告造成掃描噪音。

### Decision 5: 搜尋進入暫時全展開模式並支援符號正規化

收合 parent 會讓 child rows 不存在於 `SettingItem[]`，因此需要避免搜尋漏掉 folded children。設計上維護外部 `searchQuery` 狀態：

- 搜尋從空字串變為非空時，重建清單並暫時忽略 fold state，讓所有 parent child rows 進入 `SettingsList`。
- 搜尋持續輸入期間不反覆重建，避免干擾 `SettingsList` 的私有 search input 狀態。
- 搜尋透過 backspace 清空時，重建回一般模式並恢復使用者原本的 fold state。
- **搜尋字元在比對與輸入時，會過濾並正規化掉 `-`、`_`、`/` 等常見符號，例如輸入 `ai-sdk` 會自動以 `aisdk` 與 label 進行模糊比對，避免比對中斷。此外，`/` 僅供開啟/結束搜尋，不會被填入搜尋關鍵字。**
- 切換頁籤時清空外部 search state，維持目前每個分頁重建清單的操作模型。

### Decision 6: 修正 value theme 的 fallback

目前 custom value renderer 對非空、非 `on` 的值都會顯示為 `○ OFF`。Parent row 需要顯示 `1/2 ON` 或 `⚠ 1/2 ON` 這類 summary，因此 value renderer 應明確處理：

- `""` → 空字串
- `"on"` → 既有 `● ON` success 樣式
- `"off"` → 既有 `○ OFF` muted 樣式
- 其他字串 → 保留原文字，使用與現有 accent/muted 調性一致的 summary 樣式

### Decision 7: 穩定項目排序與不跳動的 Extensions 分頁

為了防止 toggle 啟用狀態時，清單項目因重排序而使游標在畫面上跳動，`Extensions` 分頁取消原本基於 `on` / `off` 狀態的分組和動態重新排序。所有項目維持固定的字母排序結構，無論 toggle 開或關，項目在清單中的索引均保持穩定不變。

### Decision 8: 穩定的單列描述區與空白占位防跳動

為了避免在列表上下移動游標、聚焦在不同 row 時，因部分 row 缺少 description 導致列表總渲染行數忽多忽少，我們在 `buildSettingItems` 中對每個 item 都強制生成並保留一個單行描述 slot。如果該 item 原本沒有描述（`description` 為 undefined），則會填充單個空格（`" "`）作為占位符。這使整個 TUI 在上下移動時總高度保持穩定不變，防止畫面整體上下跳動一行。

## Risks / Trade-offs

- [Risk] Parent row 使用 `Enter` / `Space` fold/unfold，child row 使用同鍵 toggle，可能需要使用者理解目前選到的是 parent 還是 child。→ Mitigation: parent row 使用 `▾/▸` 與 `1/2 ON` summary，不使用 `● ON` / `○ OFF`，降低與 toggle row 混淆。
- [Risk] 搜尋狀態鏡像可能與 `SettingsList` 私有 search input 不一致。→ Mitigation: 只在空/非空邊界重建，搜尋中途交由 `SettingsList` 管理；tab switch 時重置 search state。
- [Risk] Unicode `▾/▸` 在少數 terminal 顯示寬度可能不一致。→ Mitigation: 使用 `visibleWidth` / `truncateToWidth` 既有工具計算與截斷，必要時可退回 ASCII marker。
- [Risk] Parent rows 與 child rows 混入既有 enabled/disabled 排序可能破壞樹結構。→ Mitigation: tree mode 不套用全域 enabled-first 分組，而是在每個 parent group 內排序 child rows；`Extensions` 分頁維持既有排序。
