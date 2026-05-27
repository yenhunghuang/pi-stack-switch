## 1. 重構首頁與分頁（移除 All 頁籤）

- [x] 1.1 修改 `index.ts` 中的 `TABS` 與 `TabType`，將 `all` 移除，確保僅留 Extensions、Skills、Prompts、Themes
- [x] 1.2 調整 `openSelector` 中 TUI 初始加載與 `currentTab` 預設值為 `extensions`，並更新頂部 TabBar 渲染
- [x] 1.3 更新 `cycleTab` 與鍵盤快捷鍵（數字鍵 1-4 直接切換），確保不殘留 `All` 的 1 號熱鍵映射

## 2. 擴充 Inventory 型別與智慧連動過濾（Tandem Toggle）

- [x] 2.1 修改 `index.ts` 中 `InventoryItem` 的 TypeScript Interface 定義，加入選擇性的 `associatedResources?: { extensions?: string[] }` 屬性
- [x] 2.2 重構 `applyToggle` 函數，在 toggle 狀態時，若 `item` 具有關聯模組，自動呼叫輔助函數，在 `settings.json` 的 `extensions` 陣列中同步寫入或拔除關聯程式路徑的 `-` 符號
- [x] 2.3 確保連動恢復機制：當開啟（on）子項目時，連動寫入能乾淨地移除 settings 中對應的 `-path/to/ext.ts` 字串而不留下多餘空格或逗號

## 3. 實作 TUI Confirm Dialog（共用入口衝突處理）

- [x] 3.1 在 TUI 事件切換邏輯中加入安全檢查：如果要連動關閉的檔案包含 `index.ts`，且同一個 package 旗下還有其他在 `on` 狀態的兄弟資源，則攔截變更
- [x] 3.2 實作 TUI 交互式 Confirm Dialog 對話框，向使用者展示依賴警示，並提供「一併關閉主套件 (套件 JS 完全卸載)」與「僅關閉提示詞 (保留程式背景運行)」兩個選項
- [x] 3.3 對接 Dialog 選項：若選擇一併關閉，則一併將主 Extension 的 state 設為 `off` 並連動寫入；若僅關閉提示詞，則按一般邏輯只關閉 `SKILL.md`

## 4. 升級 /stack discover 智慧深度解析（Deep Package Inspector）

- [x] 4.1 在 `runDiscover` 或其呼叫的輔助函數中，實作遞迴讀取本地磁碟套件資料夾 `skills/`、`prompts/` 及 `themes/` 下文件的邏輯
- [x] 4.2 實作 Heuristic Matchmaking 對稱特徵匹配演算法（路徑關鍵字比對、同名比對、主入口 index.ts 兜底綁定）
- [x] 4.3 重構 `inventoryItemFromUnmanaged` 及 discover 寫入邏輯，使解析出的子資源與對應預填的 `associatedResources` 能夠一併追加寫入到 `inventory.json` 當中
- [x] 4.4 擴充 discover，使 standalone Skills、Prompts、Themes 預設載入位置也能自動追加至 `inventory.json` 並以 top-level filter 納管

## 5. 測試與驗證

- [x] 5.1 執行 `bunx tsc --noEmit`，確認 TypeScript 編譯與型別檢查全數通過
- [x] 5.2 執行 `bunx biome check .` 與 `bunx biome format --write .` 確保代碼排版完美
- [x] 5.3 依據規格場景，手動在 pi 環境中進行測試：
  - 驗證無 `All` 分頁且預設為 `Extensions`
  - 驗證切換模組化套件（多子項，不同檔案）時能自動加減號
  - 驗證切換單一入口套件（共用 index.ts）時，若有兄弟項目啟用則彈出 Confirm Dialog 流程運作順暢
  - 驗證執行 `/stack discover` 能夠深度解析並自動預填 `associatedResources` 連動結構
  - 驗證 `ai-sdk` 這類 standalone Skill 及純 Prompts/Themes 能被 discover 納管，並能透過 `/stack` 寫入 top-level filter
