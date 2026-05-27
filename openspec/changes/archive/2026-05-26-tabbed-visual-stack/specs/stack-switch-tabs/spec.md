## ADDED Requirements

### Requirement: Tabbed Interface Rendering
系統 SHALL 在 `/stack` 介面的頂部渲染一個包含 5 個分類的頁籤列：`All`、`Extensions`、`Skills`、`Prompts`、`Themes`。選中的當前頁籤 SHALL 以主題的 `accent` 顏色與粗體樣式高亮顯示，而非選中的頁籤則以 `muted` 顏色顯示。頁籤與下方的設定清單之間 SHALL 渲染一條簡約底線作為視覺分隔。

#### Scenario: Active Tab Highlighting
- **WHEN** 使用者輸入 `/stack` 指令開啟介面
- **THEN** 系統 SHALL 預設選中 `All` 頁籤並將其以 `accent` 顏色高亮，且正確渲染頁籤底下的簡約分隔線。

### Requirement: Keyboard-based Tab Switching
系統 SHALL 攔截鍵盤輸入。當偵測到 `Tab` 時，向右循環切換頁籤；當偵測到 `Shift+Tab` 時，向左循環切換頁籤。當偵測到數字鍵 `1` ~ `5` 時，直接切換至對應頁籤（1 代表 All，2 代表 Extensions，3 代表 Skills，4 代表 Prompts，5 代表 Themes）。在切換頁籤後，系統 SHALL 在記憶體中依選中的類型動態過濾並重構設定列表。

#### Scenario: Numeric Shortcut Switching
- **WHEN** 使用者按下鍵盤上的 `3` 鍵
- **THEN** 系統 SHALL 將當前頁籤切換至 `Skills`，並僅在 `SettingsList` 中顯示技能類型的設定項目。

### Requirement: Non-Orphan Resource Visibility and Toggle
在特定的分頁頁籤下（如 `Skills`、`Prompts`、`Themes`），系統 SHALL 完整列出該類型下所有受管理的資源，不論該資源是否附屬於特定的 Extension（非孤兒資源）。使用者 SHALL 能夠獨立開關這些子資源。若某個附屬資源被開啟，但其父 Extension 處於關閉狀態時，系統 SHALL 在該項目 Label 旁顯示警告標誌 `(⚠️ Requires <Parent>)`。

#### Scenario: Toggling Non-Orphan Skill
- **WHEN** 使用者在 `Skills` 分頁選中一個附屬於 `Taskplane` 的技能並將其開關狀態切換為 `on`
- **THEN** 系統 SHALL 獨立寫入對應的子項目開關模式至 `settings.json`；若 `Taskplane` 為關閉，則該項目 Label 應顯示 `(⚠️ Requires Taskplane)` 警示。

### Requirement: Zero-Token Local Performance
所有頁籤的切換、過濾和重構操作 MUST 完全在本地記憶體中執行。系統 SHALL 避免在使用者進行頁籤切換或開關選擇時呼叫任何 AI 模型或遠端 API，以確保極致的低延遲，並達成 0 額外 Token 消耗。

#### Scenario: High Performance Local Switch
- **WHEN** 使用者在離線狀態下快速連續按下 `Tab` 鍵切換頁籤
- **THEN** 系統 SHALL 在 5 毫秒內流暢更新並重繪 TUI 介面，且不會拋出任何網路請求或呼叫大語言模型。
