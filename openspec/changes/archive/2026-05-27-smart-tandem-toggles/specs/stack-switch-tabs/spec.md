## MODIFIED Requirements

### Requirement: Tabbed Interface Rendering
系統 SHALL 在 `/stack` 介面的頂部渲染一個包含 4 個分類的頁籤列：`Extensions`、`Skills`、`Prompts`、`Themes`。選中的當前頁籤 SHALL 以主題的 `accent` 顏色與粗體樣式高亮顯示，而非選中的頁籤則以 `muted` 顏色顯示。頁籤與下方的設定清單之間 SHALL 渲染一條簡約底線作為視覺分隔。本系統 SHALL NOT 渲染 `All` 頁籤，且 SHALL 預設將 `Extensions` 分頁作為首頁開啟。

#### Scenario: Active Tab Highlighting
- **WHEN** 使用者輸入 `/stack` 指令開啟介面
- **THEN** 系統 SHALL 預設選中 `Extensions` 頁籤並將其以 `accent` 顏色高亮，且正確渲染頁籤底下的簡約分隔線，並且不顯示 `All` 頁籤。

### Requirement: Keyboard-based Tab Switching
系統 SHALL 攔截鍵盤輸入。當偵測到 `Tab` 或 `Right` 方向鍵時，向右循環切換頁籤；當偵測到 `Shift+Tab` 或 `Left` 方向鍵時，向左循環切換頁籤。當偵測到數字鍵 `1` ~ `4` 時，直接切換至對應頁籤（1 代表 Extensions，2 代表 Skills，3 代表 Prompts，4 代表 Themes）。在切換頁籤後，系統 SHALL 在記憶體中依選中的類型動態過濾並重構設定列表。頁籤切換 SHALL NOT 觸發任何資源 toggle 或 settings 寫入；資源 toggle SHALL 由 `Enter` / `Space` 觸發。

#### Scenario: Numeric Shortcut Switching
- **WHEN** 使用者按下鍵盤上的 `2` 鍵
- **THEN** 系統 SHALL 將當前頁籤切換至 `Skills`，並僅在 `SettingsList` 中顯示技能類型的設定項目。

#### Scenario: Arrow Key Tab Switching
- **WHEN** 使用者在 `/stack` 介面按下 `Right` 方向鍵
- **THEN** 系統 SHALL 向右循環切換到下一個頁籤，且 SHALL NOT 切換目前選取項目的 on/off 狀態。

#### Scenario: Left Arrow Tab Switching
- **WHEN** 使用者在 `/stack` 介面按下 `Left` 方向鍵
- **THEN** 系統 SHALL 向左循環切換到上一個頁籤，且 SHALL NOT 切換目前選取項目的 on/off 狀態。
