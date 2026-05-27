## Context

當前 `pi-stack-switch` 的 `/stack` 指令透過 `openSelector` 函數啟動了一個自訂的 TUI 元件。此元件在內部實例化了 `SettingsList`（來自 `@mariozechner/pi-tui`）來呈現可切換的資源。

目前的實作有兩個關鍵侷限：
1. `buildSettingItems` 僅輸出 `extensions`（擴充套件）與 `orphans`（孤兒資源），強制隱藏了所有附屬於 Extension 下的 Skills、Prompts 與 Themes，導致使用者無法獨立微調。
2. 介面為扁平且長度無限制的單一清單。

由於 `@mariozechner/pi-tui` 的程式碼是唯讀的 Peer Dependency，我們必須在不修改外部依賴庫的前提下，完全在本地套件的 `index.ts` 內完成頁籤與動態渲染的優化。

## Goals / Non-Goals

**Goals:**
- 在不破壞現有 TUI 渲染迴圈的前提下，於介面頂部加入「底線式頁籤列 (Tab Bar)」，提供 `All`、`Extensions`、`Skills`、`Prompts`、`Themes` 五大靜態分頁。
- 支援透過 `Tab` / `Shift+Tab` 循環切換頁籤，並支援數字鍵 `1` ~ `5` 進行直達快捷切換。
- 支援在 `Skills`、`Prompts`、`Themes` 等子分頁中完整展示非孤兒 (non-orphan) 資源，並提供獨立開關控制，同時附帶父套件狀態相依警示 `(⚠️ Requires <Parent>)`。
- 保證所有過濾和 UI 重新建置皆在本地記憶體中完成，**不進行任何外部 LLM 呼叫，確保 0 Token 消耗**。

**Non-Goals:**
- 不修改 `@mariozechner/pi-tui` 或任何外部依賴的原始碼。
- 不引入動態的業務分類分頁（僅限於資源類型），以極簡化代碼體積。
- 不建立自訂的底層 UI 畫布或文字渲染器，完全複用現有的 `Container`、`Text` 與 `SettingsList` 機制。

## Decisions

### 1. 動態重構 SettingsList 實例 (Dynamic Re-Instantiation)
由於 `SettingsList` 沒有暴露出替換內部 `items` 的公共 API（`items` 與 `filteredItems` 皆為內部私有成員），當使用者切換分頁時，我們無法直接修改已存在的 list 實例。
- **決策**：當分頁狀態 `currentTab` 變更時，直接在 `Container` 中移除舊的 `SettingsList` 元件，並依據新的篩選列表重新 `new SettingsList(...)`。
- **考量替代方案**：
  - *替代方案 1*：透過 TypeScript `as any` 強制改寫 `list.items`。
    - *淘汰原因*：雖然可行，但這嚴重依賴底層類型的私有實作。如果未來 Pi 的 `SettingsList` 內部變更了變數命名，此改動將會失效。重新實例化新物件是極其安全且高效的（耗時 < 1ms）。

### 2. 本地輸入攔截機制 (Keyboard Event Interception)
為了讓 `Tab`/`Shift+Tab` 與 `1`~`5` 的按鍵能精準控制分頁切換，我們必須在按鍵事件到達 `SettingsList` 之前進行攔截。
- **決策**：在 `openSelector` 返回的 `handleInput` 方法中，優先對上述按鍵進行偵測與邏輯處理。
  - 當攔截到分頁切換鍵時，更新 `currentTab`、重新構建 `SettingsList` 實例，然後呼叫 `tui.requestRender()` 更新畫面。
  - 對於其他常規按鍵（例如方向鍵 `Up`/`Down`、`Space`、`Esc`），則直接轉發（Forward）給當前的 `list.handleInput(data)`。
- **考量替代方案**：
  - *替代方案 1*：只支援 `Tab` 切換。
    - *淘汰原因*：對於擁有許多分頁或高頻使用的開發者，`1`~`5` 的直達數字鍵能帶來顯著的高效體驗。

### 3. 子分頁解鎖非孤兒資源 (Unlocking Non-Orphan Child Resources)
- **決策**：優化 `buildSettingItems` 方法。除了支援 `All` 分頁的簡化視圖（隱藏非孤兒資源，以保持首頁乾淨），在 `Skills`、`Prompts`、`Themes` 分頁下，將自動解鎖並列出所有對應資源。
  - 每個項目會顯示隸屬關係，並在父套件為關閉狀態時加上相依性警告：` (⚠️ Requires <ParentName>)`。
  - 點擊開關時，只操作對應資源在 `settings.json` 中該 package filter 下的子陣列。

## Risks / Trade-offs

- **[Risk]** 在 Warp 終端機中，`Tab` 或 `Shift+Tab` 鍵可能與終端機本身的快捷鍵或自動補全衝突。
  - **[Mitigation]** Warp 終端機在 raw input 交互模式下會完美轉發 Tab 事件給底層進程。此外，本設計提供的 **數字鍵 `1` ~ `5` 直達功能** 作為最堅固的備用方案，確保使用者在任何終端環境下都能無阻礙操作。
- **[Risk]** 切換頁籤重構 SettingsList 實例可能導致選中游標遺失。
  - **[Mitigation]** 在切換分頁時，我們會預設將新分頁的 selectedIndex 重置為 `0`（符合常規分頁邏輯）；如果是相同的分頁重構，則在重新實例化後，透過強制設定 `(list as any).selectedIndex = oldSelectedIndex` 來完美保留游標位置。
