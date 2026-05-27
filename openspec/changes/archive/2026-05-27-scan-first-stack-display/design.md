## Context

`/stack` 目前以 `SettingsList` 呈現 toggle 清單，主列表文字是把 category、parent label、item label、warning 與 description 全部串成單一 `label` 欄位，再由 `SettingsList` 在右側顯示 `on/off` value。這個元件會對齊左側 label，但不提供獨立的 description 欄或固定寬度的狀態欄，因此只要某些 item label 過長，右側狀態就會更容易視覺錯位。

這次變更的目標不是重寫底層 TUI 元件，而是在既有 `SettingsList` 約束下，把 `/stack` 收斂成 scan-first 的操作面板。探索結果已確認使用者優先在乎的是：快速看到工具名稱、用很短的能力描述輔助辨識、盡量減少 category 與冗長文案帶來的噪音。對於新 discover 到的 extension，使用者也接受以 inventory 人工 curate description 的方式維持一致性，而不是引入自動摘要或新 metadata schema。

## Goals / Non-Goals

**Goals:**

- 讓 `/stack` 主列表優先呈現 `名稱 — 短描述`，把掃描重心放回工具名稱本身。
- 移除主列表中的 category 前綴，降低與現有 tabs 重複的分類訊號。
- 以較短且一致的 description 風格，降低 `SettingsList` 中單一 label 過長導致狀態欄錯位的頻率。
- 建立 inventory / discover 的 description 維護規範，讓新增 extension 時能延續 scan-first copy 風格。
- 在不改變 toggle、persist、reload 行為的前提下完成調整。

**Non-Goals:**

- 不實作自訂三欄式 TUI renderer，也不取代 `SettingsList`。
- 不新增自動生成 extension description 的能力。
- 不改變 `inventory.json`、`settings.json` 的 schema。
- 不處理更廣泛的排序、搜尋、分組或 keybinding 重設計。

## Decisions

1. **沿用 `SettingsList`，以 copy 縮短與 label 組裝策略優化掃描體驗。**
   - 做法：維持既有 `SettingsList` + `SettingItem.label` 模型，改為輸出名稱優先的 `label — description` 文案，並縮短 description。
   - 理由：目前問題主要來自文案密度與單行過長，而不是 toggle 機制本身。沿用現有元件可保持變更面小，也避免為了三欄排版改寫整個互動元件。
   - 替代方案：改成自訂 row renderer，分離名稱、description、status 三欄。淘汰原因是影響面過大，且超出這次以 scan-first 文案調整為主的 scope。

2. **主列表不再顯示 category，description 一律是能力短語。**
   - 做法：從 item label 中移除 `[category]` 前綴；description 只保留能力資訊，例如 `LSP / ast-grep`、`使用者確認`、`網頁 / 外部檢索`。
   - 理由：tabs 已經提供主要分類軸，category 在主列表中多半是重複訊號。能力短語比來源或分類更能支援快速切換決策。
   - 替代方案：保留 category，但只顯示冒號後半段。淘汰原因是仍會讓分類文字先於名稱出現，不符合 scan-first 目標。

3. **把 description 規範視為 inventory curate 規則，而不是 discover 自動化邏輯。**
   - 做法：discover 只把新 extension 寫入 inventory，不自動產生 `Discovered ...` placeholder description；再透過範例 inventory 與 README 說明人工整理為短描述的規範。
   - 理由：extension 能力描述需要領域判斷，自動產生很容易退化成來源或安裝狀態說明；人工 curate 雖多一步，但可確保列表品質。
   - 替代方案：在 discover 階段自動生成 description。淘汰原因是目前可用資訊不足，容易產生 `Discovered global package` 這類無助於切換決策的文案。

4. **沿用 `SettingsList`，但先把 inline label 壓到其 30 欄對齊模型內。**
   - 做法：主列表仍輸出 scan-first 的 `名稱 — description`，但在交給 `SettingsList` 前先依 30 個 visible columns 截斷，並把完整 label 放到 selected item description 顯示。
   - 理由：`SettingsList` 會以 30 欄 label slot 對齊 value；若 label 本身超過 30 欄，`ON` / `OFF` 會被推開。先截斷可在不改寫元件的前提下維持狀態欄穩定。
   - 替代方案：改成自訂三欄 renderer。淘汰原因是影響面仍較大，且目前只需要讓既有 `SettingsList` 的 value 欄視覺穩定。

## Risks / Trade-offs

- [Risk] description 壓得過短後，部分 extension 的功能辨識度可能下降。 → Mitigation：以「能力關鍵詞」為下限，避免縮成過度抽象或只剩品牌名重複的文字。
- [Risk] inline label 截斷後，未選取列可能看不到完整描述或 parent warning 細節。 → Mitigation：把完整 label 放到 selected item description，保留檢視完整內容的方式。
- [Risk] discover 新增項目後若未人工 curate，清單風格會再次不一致。 → Mitigation：在 README 與範例 inventory 明確寫出 description 規則，讓 curate 成為 discover 後的預設維護步驟。
