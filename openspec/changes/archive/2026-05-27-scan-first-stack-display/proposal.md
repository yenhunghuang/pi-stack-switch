## Why

`/stack` 主要用來快速管理越來越多的 pi extensions，但目前主列表把 category 與較長的描述混在同一行，掃描重心容易從工具名稱偏移，且在 `SettingsList` 既有版面限制下會讓狀態欄位更不穩定。需要把 `/stack` 收斂成 scan-first 的切換介面，讓使用者先快速辨識工具，再決定是否切換。

## What Changes

- 將 `/stack` 主列表文案調整為 scan-first 顯示：以 `名稱 — 短描述` 為主，不再顯示 category 前綴。
- 將 `inventory.json` 中用於主列表的 description 收斂為能力短語，不使用分類、來源、安裝狀態或資源型別描述。
- 以較短、較一致的 inline description，搭配 30 欄 label 截斷，降低 `SettingsList` 內 label 過長造成的狀態欄錯位問題。
- 補充 `discover` / inventory 維護規範：新發現的 extension 先加入 inventory，不自動填入 placeholder description，再由人工 curate 成 scan-first 的短描述。
- 更新範例 inventory 與 README，讓後續新增 extension 時能沿用同一套描述風格。

## Capabilities

### New Capabilities

- 無。

### Modified Capabilities

- `stack-switch-tabs`: 調整 `/stack` 主列表的 item 呈現方式，改為名稱優先的 scan-first 顯示，移除 category 前綴，並要求 inline description 以簡短能力描述為主。

## Impact

- 主要影響 `index.ts` 中 `/stack` 列表 item label 的組裝方式。
- 影響 `inventory.json.example` 與 README 中對 description / discover 維護流程的說明。
- 不新增 runtime dependency。
- 不改變 `settings.json` persistence schema、toggle 語意或 reload 行為。
