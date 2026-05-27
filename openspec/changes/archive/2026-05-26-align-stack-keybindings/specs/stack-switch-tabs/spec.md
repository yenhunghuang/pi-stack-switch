## ADDED Requirements

### Requirement: Accurate Keyboard Hint Rendering
系統 SHALL 在 `/stack` 介面中顯示與實際鍵盤操作一致的提示文字。提示 MUST 明確標示 `Enter` / `Space` 用於切換目前選取項目的 on/off 狀態，且 MUST 將 `Left` / `Right` 或 `←→` 標示為頁籤切換用途，而非 toggle 用途。

#### Scenario: Hint Describes Toggle Keys Accurately
- **WHEN** 使用者輸入 `/stack` 指令開啟介面
- **THEN** 系統 SHALL 顯示 `Enter` / `Space` 可用於 toggle 的提示，且 SHALL NOT 顯示 `←→ toggle` 這類把左/右方向鍵描述為 toggle 的提示。

## MODIFIED Requirements

### Requirement: Keyboard-based Tab Switching
系統 SHALL 攔截鍵盤輸入。當偵測到 `Tab` 或 `Right` 方向鍵時，向右循環切換頁籤；當偵測到 `Shift+Tab` 或 `Left` 方向鍵時，向左循環切換頁籤。當偵測到數字鍵 `1` ~ `5` 時，直接切換至對應頁籤（1 代表 All，2 代表 Extensions，3 代表 Skills，4 代表 Prompts，5 代表 Themes）。在切換頁籤後，系統 SHALL 在記憶體中依選中的類型動態過濾並重構設定列表。頁籤切換 SHALL NOT 觸發任何資源 toggle 或 settings 寫入；資源 toggle SHALL 由 `Enter` / `Space` 觸發。

#### Scenario: Numeric Shortcut Switching
- **WHEN** 使用者按下鍵盤上的 `3` 鍵
- **THEN** 系統 SHALL 將當前頁籤切換至 `Skills`，並僅在 `SettingsList` 中顯示技能類型的設定項目。

#### Scenario: Arrow Key Tab Switching
- **WHEN** 使用者在 `/stack` 介面按下 `Right` 方向鍵
- **THEN** 系統 SHALL 向右循環切換到下一個頁籤，且 SHALL NOT 切換目前選取項目的 on/off 狀態。

#### Scenario: Left Arrow Tab Switching
- **WHEN** 使用者在 `/stack` 介面按下 `Left` 方向鍵
- **THEN** 系統 SHALL 向左循環切換到上一個頁籤，且 SHALL NOT 切換目前選取項目的 on/off 狀態。
