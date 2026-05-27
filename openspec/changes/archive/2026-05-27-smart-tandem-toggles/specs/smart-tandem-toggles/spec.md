## ADDED Requirements

### Requirement: Associated Resources Metadata
系統 SHALL 支援在 `inventory.json` 中，為每個 `InventoryItem` 定義選擇性的 `associatedResources` 欄位（其中包含 `extensions?: string[]`），用來宣告該 Skill 或 Prompt 所直接綁定的 Extension 程式模組檔案路徑。

#### Scenario: Metadata declaration of associated resources
- **WHEN** 系統加載 `inventory.json`，且某個 Skill 定義了具有 `associatedResources.extensions` 的結構
- **THEN** 系統 SHALL 成功將其解析為對應的強型別元數據，在 UI 渲染與連動過濾中使用。

### Requirement: Smart Tandem Resource Toggling
當使用者在 `/stack` 介面切換某個 Skill 或 Prompt 的開關狀態時，系統 SHALL 檢查該項目是否具有 `associatedResources.extensions`。若有，系統 SHALL 對列出的程式模組路徑自動套用相同的開關狀態：關閉時自動加入 `-`（負向過濾），開啟時自動拔除 `-`，確保程式碼與提示詞同步存亡。

#### Scenario: Automated joint toggling of associated code
- **WHEN** 使用者關閉 `Brainstorm (Skill)`，該項目聲明了關聯的程式模組 `extensions/brainstorm.ts`
- **THEN** 系統 SHALL 自動在 `settings.json` 的對應 package 的 `extensions` 陣列中寫入 `-extensions/brainstorm.ts`，並在重新開啟 `Brainstorm (Skill)` 時將其完全移除。

### Requirement: Single Entrypoint Shared Conflict Warning
當要連動關閉的程式碼模組是共享入口檔 `index.ts` 時，系統 SHALL 檢查同一個套件下是否還有其他仍然處於「啟用 (on)」狀態的兄弟項目。如果有，系統 SHALL 彈出 TUI Confirm Dialog，警告使用者該代碼正被共享，並提供「一併關閉主套件（100% 關閉乾淨）」或「僅關閉提示詞（保留程式背景運行）」兩個選項。如果沒有其他啟用的兄弟項目，系統 SHALL 無感自動連動關閉 `index.ts`。

#### Scenario: Shared index.ts interactive confirm warning
- **WHEN** 使用者在同套件的 `Code Review` 仍啟用時，手動將 `Brainstorm` 關閉，且 `Brainstorm` 的關聯程式為 `index.ts`
- **THEN** 系統 SHALL 彈出 TUI Confirm Dialog，提示共享入口衝突，並在使用者選擇後執行對應的變更。

#### Scenario: Single-entrypoint automatic cascade when alone
- **WHEN** 使用者在同套件的 `Code Review` 已經是關閉時，將最後一個啟用的 `Brainstorm` 關閉
- **THEN** 系統 SHALL 不彈出對話框，直接自動連動關閉 `index.ts` 程式載入。

### Requirement: Deep Package Resource Auto-Discovery
當執行 `/stack discover` 時，系統 SHALL 深度掃描該套件本機實體路徑。除了新增 Extension 外，系統 SHALL 遞迴掃描套件根目錄下的 `skills/`、`prompts/` 資源資料夾。若發現資源，系統 SHALL 將其自動抽取、建立 `source` 父子關聯，並自動寫入 `inventory.json` 對應的資源陣列中。

#### Scenario: Deep scanning of complex package folder
- **WHEN** 使用者執行 `/stack discover` 且系統偵測到一個名為 `superpower` 的新套件，且其硬碟目錄下包含 `skills/brainstorm/SKILL.md`
- **THEN** 系統 SHALL 成功將其辨識為獨立 Skill，自動將其 `source` 設為 `superpower`，並寫入 `inventory.skills` 中。

### Requirement: Heuristic Associated Code Matching
當智慧解析器在 discover 階段偵測到子資源時，系統 SHALL 依據檔名與特徵目錄自動匹配連動程式。若特徵相同，系統 SHALL 自動在生成項目時，於 `inventory.json` 預填 `associatedResources` 連動設定。

#### Scenario: Matchmaking links skill with extension file
- **WHEN** 系統在掃描時發現 `skills/brainstorm/SKILL.md`，並在對稱的 `extensions/` 底下發現 `brainstorm.ts`
- **THEN** 系統 SHALL 自動為該 `skills/brainstorm` 項目新增 `associatedResources: { extensions: ["extensions/brainstorm.ts"] }` 連動宣告並寫入配置。

### Requirement: Standalone Resource Auto-Discovery
當執行 `/stack discover` 時，系統 SHALL 掃描 pi 預設載入的 standalone Skills、Prompts、Themes 位置。若發現尚未存在於 `inventory.json` 的純資源，系統 SHALL 將其加入對應分類，且 SHALL NOT 設定 parent `source` 或 `associatedResources`。

#### Scenario: Discover standalone skill from ~/.agents
- **WHEN** 使用者執行 `/stack discover`，且 `~/.agents/skills/ai-sdk/SKILL.md` 存在但尚未在 inventory 中
- **THEN** 系統 SHALL 將其加入 `inventory.skills`，並使用絕對檔案路徑作為 `path`，讓後續 toggle 可寫入 top-level `skills` filter。

#### Scenario: Discover standalone prompt and theme
- **WHEN** 使用者執行 `/stack discover`，且 `.pi/prompts/review.md` 與 `.pi/themes/team.json` 存在但尚未在 inventory 中
- **THEN** 系統 SHALL 分別將其加入 `inventory.prompts` 與 `inventory.themes`，並保留為無 parent 的 top-level 資源。
