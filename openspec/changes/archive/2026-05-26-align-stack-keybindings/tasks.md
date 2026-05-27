## 1. TUI Keybinding 行為調整

- [x] 1.1 更新 `/stack` 頂部操作提示文字，移除誤導性的 `←→ toggle`，改為明確標示 `←→/Tab tabs` 與 `Enter/Space toggle`
- [x] 1.2 在 `openSelector` 的 `handleInput` 中攔截 `Right` 方向鍵，呼叫既有 `cycleTab(1)` 並避免事件傳入 `SettingsList`
- [x] 1.3 在 `openSelector` 的 `handleInput` 中攔截 `Left` 方向鍵，呼叫既有 `cycleTab(-1)` 並避免事件傳入 `SettingsList`
- [x] 1.4 確認 `Tab` / `Shift+Tab` 與 `1`～`5` 既有頁籤切換行為維持不變，`Enter` / `Space` 仍由 `SettingsList` 處理 toggle

## 2. 驗證

- [x] 2.1 執行 `bunx tsc --noEmit`，確認 TypeScript 型別檢查通過
- [x] 2.2 執行 `bunx biome check .`，確認格式與 lint 檢查通過
- [x] 2.3 以 `pi -e .` 或本地 `/stack` 手動驗證提示文字、左/右頁籤切換、`Enter` / `Space` toggle 均符合預期
