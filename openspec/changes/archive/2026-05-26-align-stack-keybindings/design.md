## Context

`/stack` 以 `ctx.ui.custom` 組出頁籤列與 `SettingsList`。目前 input handling 已在 `SettingsList` 前攔截 `Tab`、`Shift+Tab` 與 `1`～`5` 來切換頁籤，其他輸入則交給 `SettingsList`，因此 toggle 實際由 `SettingsList` 的 `Enter` / `Space` 完成。畫面提示仍寫成 `←→ toggle`，但左/右方向鍵沒有自訂行為，造成提示與實際操作不一致。

## Goals / Non-Goals

**Goals:**

- 讓 `/stack` 操作提示準確標示 `Enter/Space toggle`。
- 讓 `Left` / `Right` 方向鍵在頁籤列中向左/向右循環切換。
- 延續既有 `Tab` / `Shift+Tab` 與 `1`～`5` 頁籤切換行為。
- 保持頁籤切換為本地記憶體操作，不觸發 settings 寫入、reload 或模型/API 呼叫。

**Non-Goals:**

- 不改變 `SettingsList` 的一般 toggle 行為或 keybinding 定義。
- 不更動 `inventory.json` 或 `settings.json` schema。
- 不新增可設定 keybinding 系統。

## Decisions

1. **在 `/stack` 自訂 input handler 攔截左/右方向鍵。**
   - 做法：沿用既有 `matchesKey` 與 `cycleTab`，在 `list.handleInput(data)` 前加入 `left` / `right` 分支。
   - 理由：頁籤切換邏輯已集中於 `cycleTab`，新增方向鍵只需補一層快捷鍵，不需修改 `SettingsList`。
   - 替代方案：修改 `SettingsList` 讓左/右切值；但目前 toggle 為二元值且已有 `Enter` / `Space`，改動共用元件會擴大影響面。

2. **將提示文字改為明確區分 tabs 與 toggle。**
   - 做法：把 `←→ toggle` 改為類似 `←→/Tab tabs · Enter/Space toggle` 的提示。
   - 理由：提示需反映實際互動模型，避免使用者以為左/右會改變 on/off。
   - 替代方案：只移除 `←→ toggle`，不新增左/右行為；但使用者明確要求左/右也用來切換頁籤，且方向鍵符合頁籤導覽直覺。

## Risks / Trade-offs

- [Risk] 搜尋模式下左/右方向鍵無法用於移動搜尋輸入游標。 → Mitigation：目前搜尋提示以 `/ search` 與鍵入文字為主，且 `SettingsList` 的搜尋輸入未暴露頁籤內游標編輯需求；若未來搜尋框需要完整文字編輯，可再增加模式判斷。
- [Risk] 使用者可能期待左/右切換 on/off。 → Mitigation：提示明確寫為 `Enter/Space toggle`，左/右只標示為 tabs。
