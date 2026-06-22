## Why

`/stack` 與 `/stack discover` 目前直接沿用 extension manifest 的描述，導致繁中環境下同一份清單混用中文、英文、空白與 discover placeholder。這讓掃描項目時成本變高，也違反 inventory description 應為精煉能力短語的既有規範。

## What Changes

- 允許 inventory item description 使用 locale map，例如 `description: { "zh-TW": "能力短語" }`。
- `/stack` 顯示 description 時依序 fallback：`description["zh-TW"]`、字串 `description`、`未提供描述`。
- `/stack discover` 寫入 extension inventory 時使用相同 fallback，避免空白與 `Discovered global package` 類 placeholder。
- 補上 smoke test 覆蓋 description fallback 與 placeholder 行為。

## Capabilities

### New Capabilities

### Modified Capabilities

- `stack-switch-tabs`: 主列表與 discover 的 description 呈現規則需支援繁中 fallback 與未提供描述預設值。

## Impact

- `index.ts` 的 inventory description 型別、讀取、顯示與 discover 寫入流程。
- `inventory.json.example` 的 description 範例。
- `smoke-reference-integrity.ts` 的 pure function 測試。
