## 1. `/stack` 主列表 scan-first 文案調整

- [x] 1.1 更新 `index.ts` 的 item label 組裝方式，改為名稱優先的 `名稱 — description` 單行格式
- [x] 1.2 從 `/stack` 主列表 label 中移除 category 前綴，確認各分頁與 `All` 分頁都不再顯示 `[category]` 標記
- [x] 1.3 保留 parent warning 與既有 toggle 行為，確認 warning 仍會在需要時顯示，且不改變 `Enter` / `Space` 切換語意
- [x] 1.4 將傳入 `SettingsList` 的 inline label 限制在 30 個 visible columns，避免長 description 推開 `ON` / `OFF` 狀態欄

## 2. inventory 與 discover 維護規範

- [x] 2.1 將 `inventory.json.example` 內現有項目的 description 收斂為能力短語，避免分類、來源、安裝狀態 or 資源型別描述
- [x] 2.2 更新 README 的 `/stack` 與 `discover` 說明，明確寫出「discover 先加入 inventory，再人工 curate 成短描述」的維護流程
- [x] 2.3 在 README 或範例設定中補充 description 撰寫規則與 scan-first 文案範例，讓後續新增 extension 時可沿用
- [x] 2.4 調整 `/stack discover` 產生 inventory item 的行為，不再寫入 `Discovered ...` placeholder description

## 3. 驗證

- [x] 3.1 執行 `bunx tsc --noEmit`，確認 TypeScript 型別檢查通過
- [x] 3.2 執行 `bunx biome check .`，確認格式與 lint 檢查通過
- [x] 3.3 以 `pi -e .` 或本地 `/stack` 手動驗證主列表已改為名稱優先、category 已隱藏，且常見項目的狀態欄視覺上比原先更穩定
