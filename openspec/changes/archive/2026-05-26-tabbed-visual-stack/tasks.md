## 1. 資料模型與篩選器重構 (Data Refactoring)

- [x] 1.1 在 `index.ts` 中新增並定義 `TabType` 聯合型別與 `TABS` 常數分頁配置對照表
- [x] 1.2 重構 `buildSettingItems` 函數，使其支援傳入 `currentTab: TabType` 參數
- [x] 1.3 調整 `buildSettingItems` 邏輯：在非 `all` 的子分頁（如 `skills`、`prompts`、`themes`）下，解鎖並列出所有附屬於特定的 Extension 的子資源項目
- [x] 1.4 在子項目構建時，加入父 Extension 狀態檢查。若父 Extension 為 off 狀態，則子項目 Label 自動加上警示字樣：` (⚠️ Requires <Parent>)`

## 2. 頁籤 TUI 渲染與輸入攔截 (TUI Tab Bar & Input Interception)

- [x] 2.1 實作頁籤列渲染函數 `renderTabBar(currentTab, theme)`：使用「簡約底線式」風格，以 `accent` 加上加底線符號（如 `══ ALL ══` 或底線）高亮選中的頁籤，`muted` 渲染非選中頁籤
- [x] 2.2 重構 `openSelector` 函數，修改 `render` 回傳邏輯：在主畫面最頂部插入由 `renderTabBar` 產生的文字行與分隔線
- [x] 2.3 在 `openSelector` 的 `handleInput` 中加入事件攔截器：精確捕捉 `Tab`、`Shift+Tab` 以及數字鍵 `1` ~ `5`，更新 `currentTab` 狀態並阻止這些鍵往下傳入 `SettingsList`
- [x] 2.4 實作頁籤切換時的 TUI 局部更新邏輯：更換為新的 `currentTab` 後重組 `items`、重新實例化 `SettingsList`、替換 container 參照並呼叫 `tui.requestRender()`

## 3. 整合與冒煙測試驗證 (Verification)

- [x] 3.1 執行型別檢查 `bunx tsc --noEmit`，確保重構後的代碼完美通過型別驗證
- [x] 3.2 執行 Biome 格式化與風格檢查：`bunx biome check .` 並修復排版問題
- [x] 3.3 啟動本地 Pi Extension 暫時載入測試：執行 `pi -e .` 或 `/stack` 驗證分頁切換與效能
- [x] 3.4 驗證重點：測試 `Tab`/`Shift-Tab` 切換分頁流暢度、確認 0 網路/LLM 請求、確認附屬 Skills 可以獨立被 toggled 且當 parent extension 為 off 時確實顯示警告
