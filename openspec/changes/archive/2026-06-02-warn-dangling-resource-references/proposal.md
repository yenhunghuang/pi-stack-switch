## Why

`/stack` 可以正確關閉 `brainstorming` 這類 Skill resource，但若 `using-superpowers` 等仍啟用的 Skill 在內容中硬性引用它，使用者仍會看到 brainstorming 流程被觸發，容易誤以為 `/stack` toggle 失效。這需要一層 resource reference integrity 檢查，讓 dangling reference 在切換時被清楚揭露。

## What Changes

- 在 `inventory.json` 的 resource item metadata 中加入選擇性的 `references` 與 `dependsOn` 欄位，用來描述 Skill / Prompt / Theme / Extension 之間的軟引用與硬依賴。
- 當使用者關閉某個 resource 時，系統會檢查是否仍有 enabled resource 引用或依賴它；若有，顯示警告並提供「只關閉目標」、「一併關閉引用者 / 依賴者」或「取消」等選項。
- 在 `/stack list` 與 footer 狀態中顯示 dangling reference / dependency 的摘要，協助使用者理解目前 stack 的不一致狀態。
- 擴充 `/stack discover`：以保守匹配讀取已納管 Skill 內容，自動補上明確的 `references.skills` metadata；不動態修改或 patch 上游 Skill prompt 內容。
- 保留既有 `associatedResources` / Smart Tandem Toggle 語意，不把 prompt-to-prompt reference 混入 code association 機制。

## Capabilities

### New Capabilities
- `resource-reference-integrity`: 管理 resource 之間的 `references` / `dependsOn` metadata、dangling 狀態偵測、關閉時提示、list/footer 摘要，以及 discover 的保守 reference 推論。

### Modified Capabilities

## Impact

- 影響 `InventoryItem` metadata schema 與 inventory parsing。
- 影響 `/stack` TUI toggle flow、`/stack list` 輸出、footer status 計算。
- 影響 `/stack discover` 對已納管 Skills 的 metadata refresh 行為。
- 不改變 Pi resource loader 的 settings schema；仍透過既有 `packages[].skills` / top-level `skills` filter 實際啟停 resource。
- 不修改 Superpowers 或其他上游 Skill 檔案內容。
