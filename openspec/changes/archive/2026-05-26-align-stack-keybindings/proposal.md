## Why

`/stack` 目前的操作提示寫著 `←→ toggle`，但實際 toggle 是由 `Enter` / `Space` 觸發，左/右方向鍵沒有對應行為，容易誤導使用者。既有頁籤 UI 已支援循環切換頁籤，因此將左/右方向鍵納入頁籤切換並修正提示，可讓鍵盤操作語意更一致。

## What Changes

- 更新 `/stack` TUI 操作提示，明確顯示 `Enter/Space toggle`。
- 新增左/右方向鍵頁籤切換：`Left` 向左循環切換頁籤，`Right` 向右循環切換頁籤。
- 維持既有 `Tab` / `Shift+Tab` 與 `1`～`5` 頁籤快捷鍵行為不變。
- 維持 toggle 本身仍由 `SettingsList` 的 `Enter` / `Space` 觸發，不改變 persisted settings 寫入語意。

## Capabilities

### New Capabilities

- 無。

### Modified Capabilities

- `stack-switch-tabs`: 調整 `/stack` 頁籤鍵盤切換需求與操作提示，使左/右方向鍵用於頁籤切換，並明確標示 toggle 鍵為 `Enter` / `Space`。

## Impact

- 主要影響 `index.ts` 的 `/stack` 自訂 TUI input handling 與操作提示文字。
- 不新增 runtime dependency。
- 不改變 `inventory.json` schema、`settings.json` persistence schema 或 reload 行為。
