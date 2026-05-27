## Why

目前 `/stack` 的 `Skills`、`Prompts`、`Themes` 分頁在資源數量變多時仍以平面清單呈現，使用者需要掃描大量同層項目才能找到目標資源。這些子資源其實已透過 `source` 與 parent Extension 形成父子關係，因此應以符合現有 `/stack` 風格的可折疊父子清單呈現，降低掃描成本並保留既有操作語意。

## What Changes

- 在 `Skills`、`Prompts`、`Themes` 分頁中，依 `source` 父子關係將 child resources 收納於 parent Extension row 下方。
- Parent row 使用現有 SettingsList 風格的單列呈現：`▾/▸ <Extension Label>` 作為 label，右側 value 顯示 child 啟用摘要（例如 `1/2 ON`）。
- Parent row 的 `Enter` / `Space` 只負責展開 / 收合，不切換實際資源開關；實際 toggle 仍由 child row 執行。
- `Extensions` 分頁維持既有 flat list 與 toggle 行為。
- 無 parent `source` 的 standalone Skills / Prompts / Themes 以 `Standalone` root bucket 收納。
- 搜尋時暫時展開所有 parent，確保被收合的 child resources 仍可被搜尋；搜尋清空後恢復使用者原本的折疊狀態。
- Parent Extension 關閉時，警告資訊集中呈現在 parent row 與其選取 description，避免每個 child 重複顯示警告造成列表噪音。
- 修正 SettingsList value theme 對非 `on` / `off` 自訂值的呈現，使 `1/2 ON` 類摘要能以現有視覺語言正確顯示。

## Capabilities

### New Capabilities

### Modified Capabilities
- `stack-switch-tabs`: `/stack` 的 tab-specific list rendering 從純 flat list 延伸為 parent-child collapsible rendering，並更新搜尋、警告與視覺一致性要求。

## Impact

- 主要影響 `index.ts` 中的 `/stack` UI item 建構、SettingsList interaction handling、搜尋狀態追蹤與 value theme rendering。
- `inventory.json` schema 不需新增欄位；沿用既有 `source` 作為父子關係來源。
- 不新增 runtime dependency，不改變 settings.json 寫入格式。
- 既有 `Extensions` 分頁與資源 toggle persistence 行為應保持相容。
