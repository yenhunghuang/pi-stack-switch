## Why

當使用者在 `/stack` 中關閉附屬於某個 Extension 套件的子項目（如 Skills 或 Prompts）時，雖然系統提示詞中移了對應的 Markdown，但 Extension 主程式的 JS 代碼（例如背景 Listener）依然在運行，導致出現「明明關了子項目、背景卻仍留有痕跡」的幽靈運行現象。此外，現有的 `All` 分頁與 `Extensions` 有高度重複，且隱藏子項目後有些語意不清，需要簡化。更進一步，使用者新安裝套件後，手動建立 `inventory.json` 並填寫複雜的程式連動依賴非常繁瑣，需要自動化。

此變更旨在：
1. 移除冗餘的 `All` 頁籤，將首頁預設為乾淨的 `Extensions` 分頁。
2. 實現「智慧型資源連動過濾（Smart Tandem Toggles）」，在關閉子項（如 Skill）時，自動對其關聯的 Extension 程式碼模組在 `settings.json` 中加上負向過濾，在開啟時自動恢復。
3. 升級 `/stack discover` 為 **智慧套件深度解析器 (Deep Package Inspector)**：自動掃描新裝套件在本機目錄下的子資源（Skills/Prompts），並利用對稱路徑匹配（Heuristic Matchmaking）演算法，全自動生成並預填 `associatedResources` 連動元數據。
4. 將非 package child 的 standalone Skills、Prompts、Themes 納入 inventory 管理，讓 `ai-sdk`、個人 prompt、local theme 這類純資源也能透過 `/stack` 開關。
5. 提供友善的 TUI 對話框，以應對共享單一入口檔（如 `index.ts`）的套件，避免誤殺其他共用功能。

## What Changes

- **移除 All 分頁**：首頁頁籤預設改為 `Extensions`，降低無腦使用者的認知載入；`Skills`、`Prompts` 等分頁作為進階調校後台。
- **擴充 Inventory 元數據**：在 `inventory.json` 中加入 `associatedResources` 欄位，允許 Skill/Prompt 聲明其關聯的 Extension JS 模組路徑（相對於套件根目錄）。
- **自動連動過濾（Tandem Toggle）**：在 toggle 子項目時，系統會自動在 `settings.json` 中對 `associatedResources.extensions` 中列出的程式路徑加上 `-` 或拔除 `-`，確保程式碼與提示詞同步存亡。
- **單一入口共享警告**：若關閉的子項目其關聯的程式碼是套件唯一的 `index.ts`（共享入口），系統會跳出確認 TUI 對話框，引導使用者選擇「一併關閉主套件」或「僅關閉提示詞」。
- **智慧解析與自動 Matchmaking (Smart Discover)**：升級 `/stack discover` 工作流。當偵測到新 Extension 時，主動遞迴掃描其本機目錄下的 `skills/`、`prompts/` 資源，自動抽取並寫入 `inventory.json`，並利用命名與路徑特徵匹配，全自動預填 `associatedResources`。
- **Standalone 資源納管**：`/stack discover` 會掃描 pi 預設載入位置（例如 `~/.agents/skills/`、`~/.pi/agent/skills/`、`.pi/prompts/`、`.pi/themes/`），將純 Skills、Prompts、Themes 以 top-level inventory item 形式納管。

## Capabilities

### New Capabilities

- `smart-tandem-toggles`: 實現 Skill/Prompt 與 Extension 程式代碼模組的智慧連動過濾。當子資源切換狀態時，同步修改 settings 中的 extensions 過濾條件；並在共享 index.ts 時提供 TUI Confirm Dialog 交互。同時整合 `/stack discover` 本地目錄深度掃描、standalone Skills/Prompts/Themes 納管與智慧連動關係自動生成。

### Modified Capabilities

- `stack-switch-tabs`: 移除 `/stack` 介面的 `All` 分頁，將預設開啟的頁籤調整為 `Extensions`。

## Impact

- 影響 `index.ts` 的 `TABS` 定義、`openSelector` TUI 分頁邏輯。
- 擴充 `inventory.json` 的 TS 型別宣告（`InventoryItem`）以支援新元數據。
- 影響 `applyToggle` 邏輯，當 toggle 資源時，需遞迴檢查與連動修改同 package 下關聯的 extensions 陣列。
- 升級 `runDiscover` 模組，引入 `fs.readdir` 及目錄結構分析邏輯。
- `runDiscover` 需同時掃描 package child resources 與 standalone Skills/Prompts/Themes 預設目錄，並避免重複加入 inventory。
- 需要引入 TUI 互動式的 Confirm Dialog 介面。
- 不破壞現有的 `settings.json` 架構與既有開關狀態。
