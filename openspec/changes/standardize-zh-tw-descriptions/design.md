## Context

`InventoryItem.description` 目前實務上被當成單一字串使用；discover 也可能把 manifest 原文或 placeholder 寫回 inventory。既有規範已要求 description 是能力短語、不是來源 metadata，本次只補齊 locale fallback 與空值預設。

## Goals / Non-Goals

**Goals:**

- 支援 `description` 為字串或 locale map。
- 顯示端集中使用同一個 resolver：`zh-TW` → 字串 → `未提供描述`。
- discover 不再產生 placeholder description。
- 用最小 pure function 測試鎖住 fallback 行為。

**Non-Goals:**

- 不做完整 i18n framework。
- 不自動翻譯第三方英文 description。
- 不新增 dependency 或遠端 API。

## Decisions

- 新增小型 `resolveDescription(description, locale = "zh-TW")` pure function，而不是散落在 UI 與 discover 各處判斷。
  - 理由：一處修 fallback，測試也只測一處。
  - 替代方案：全面導入 i18n dictionary；目前需求太小，先不做。
- 型別允許 `string | Record<string, string>`。
  - 理由：相容既有 inventory 字串，又能讓 curated inventory 寫 `zh-TW`。
- discover 對 manifest description 只在有可用文字時寫入，否則省略欄位；UI 再顯示 `未提供描述`。
  - 理由：inventory 不應永久保存 placeholder。

## Risks / Trade-offs

- 第三方英文 manifest 仍會 fallback 顯示英文 → 這是刻意保守；要繁中一致需人工 curate inventory。
- `description` 物件若沒有 `zh-TW` 也沒有可用字串 → UI 顯示 `未提供描述`，不猜測其他 locale。
