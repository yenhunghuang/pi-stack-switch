## Why

當前 `/stack` 指令的終端機互動介面（TUI）僅能顯示扁平且過長的資源清單。隨著管理的套件（extensions）、技能（skills）、提示詞（prompts）與主題（themes）數量增長，使用者難以快速在單一清單中定位目標，且無法針對個別技能進行開關（因為非孤兒的子資源目前被強制隱藏）。

本變更旨在引入**簡約底線式分類頁籤 (Tabbed View)** 與優化過濾架構，讓使用者能透過 `Tab`/`Shift+Tab` 或數字鍵 `1`~`5` 快速切換資源大類。這不僅大幅提升可視化程度與操作便利性，更因其純本地運算、不需呼叫 LLM 的設計，實現 **0 Token 額外消耗**。

## What Changes

- **分類頁籤介面 (Tabbed Interface)**：在 `/stack` 介面的頂部引入「簡約底線式」頁籤列，分為：`All`、`Extensions`、`Skills`、`Prompts`、`Themes` 五大分類。
- **鍵盤快捷切換支持 (Keyboard Shortcuts)**：
  - 支援 `Tab` 向右切換分頁、`Shift+Tab` 向左切換分頁。
  - 支援數字鍵 `1` ~ `5` 鍵盤直達對應頁籤。
- **本地零 Token 記憶體過濾 (Zero-Token In-Memory Filtering)**：切換頁籤時直接在本地內存中過濾並重新實例化 `SettingsList`，不消耗任何網路與 AI API 額度。
- **狀態定位保留 (Cursor Position Reset/Preserve)**：切換分頁時自動重置選中 index 為 `0`，而進行其他互動時維持焦點，確保體驗流暢。

## Capabilities

### New Capabilities
- `stack-switch-tabs`: 引入 TUI 分類頁籤列、多功能鍵盤快捷切換熱鍵（Tab/Shift-Tab/1-5），以及零 Token 消耗的本地資料分組過濾機制。

### Modified Capabilities

## Impact

- **`index.ts`**：需要重構主命令 `/stack` 的 `openSelector` 與 `buildSettingItems` 邏輯，加入分頁狀態維護、鍵盤輸入攔截與動態 `SettingsList` 重建。
- **鍵盤與主題相容性**：不會影響 Warp Terminal 或其他標準 ANSI 終端機的主題着色與鍵盤事件傳遞。
