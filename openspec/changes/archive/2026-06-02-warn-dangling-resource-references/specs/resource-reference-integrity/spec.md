## ADDED Requirements

### Requirement: Resource Reference Metadata
系統 SHALL 支援在 `inventory.json` 的每個 `InventoryItem` 中定義選擇性的 `references` 與 `dependsOn` metadata。兩者 SHALL 以 resource type 分群，支援 `extensions`、`skills`、`prompts`、`themes` 陣列；陣列內容 SHALL 解析為同 type inventory item 的 target reference。

`references` SHALL 表示軟引用：source resource 可在 target disabled 時繼續 enabled，但系統需要警告。`dependsOn` SHALL 表示硬依賴：source resource 在 target disabled 時仍 enabled 代表更嚴重的不一致，系統需要在 warning 中以 dependency 語意呈現。

#### Scenario: Parse skill-to-skill references
- **WHEN** 系統載入 inventory，且 `using-superpowers` item 定義 `references.skills: ["brainstorming"]`
- **THEN** 系統 SHALL 將它解析為 `using-superpowers` 到 `brainstorming` Skill 的軟引用關係。

#### Scenario: Parse skill-to-skill hard dependency
- **WHEN** 系統載入 inventory，且 `using-superpowers` item 定義 `dependsOn.skills: ["brainstorming"]`
- **THEN** 系統 SHALL 將它解析為 `using-superpowers` 到 `brainstorming` Skill 的硬依賴關係。

### Requirement: Conservative Reference Resolution
系統 SHALL 以保守規則解析 `references` 與 `dependsOn` target。對每個 target 字串，系統 SHALL 優先比對同 type item 的 exact `id`，再比對 normalized `path`，再比對唯一的 normalized `label`。若 target 無法解析或解析結果不唯一，系統 SHALL NOT 產生 graph edge，且 SHALL NOT 因該 target 執行 cascade toggle。

#### Scenario: Resolve by exact id
- **WHEN** `references.skills` 包含 `brainstorming`，且 inventory.skills 中存在 `id` 為 `brainstorming` 的 item
- **THEN** 系統 SHALL 將該 reference 解析到該 item。

#### Scenario: Ignore ambiguous target
- **WHEN** `references.skills` 包含 `review`，但 inventory.skills 中有多個 label normalized 後皆可比對 `review` 且沒有 exact id 或 path match
- **THEN** 系統 SHALL NOT 產生 reference edge，且 SHALL NOT 自動關閉任何 candidate item。

### Requirement: Dangling Reference Detection
系統 SHALL 能依目前 enabled state 計算 dangling references 與 dangling dependencies。當 source resource enabled 且其 reference / dependency target resource disabled 時，該 edge SHALL 被視為 dangling。系統 SHALL 分別保留 edge kind，以便 UI 區分 `references disabled ...` 與 `depends on disabled ...`。

#### Scenario: Detect enabled skill referencing disabled skill
- **WHEN** `using-superpowers` Skill enabled，`brainstorming` Skill disabled，且 `using-superpowers` references `brainstorming`
- **THEN** 系統 SHALL 回報一個 dangling soft reference，指出 source 為 `using-superpowers`、target 為 `brainstorming`。

#### Scenario: Detect enabled skill depending on disabled skill
- **WHEN** `using-superpowers` Skill enabled，`brainstorming` Skill disabled，且 `using-superpowers` dependsOn `brainstorming`
- **THEN** 系統 SHALL 回報一個 dangling hard dependency，指出 source 為 `using-superpowers`、target 為 `brainstorming`。

### Requirement: Toggle Warning Before Creating Dangling State
當使用者在 `/stack` TUI 中執行 toggle，且該操作會造成新的 dangling reference 或 dangling dependency 時，系統 SHALL 在寫入 settings 前顯示 warning dialog。Dialog SHALL 列出被切換的 resource、受影響的 enabled source resources，以及 edge kind。使用者 SHALL 能選擇「只套用目前 toggle」、「一併關閉列出的 source resources」或「取消」。

#### Scenario: Warn when disabling referenced skill
- **WHEN** 使用者關閉 `brainstorming` Skill，且 `using-superpowers` Skill enabled 並 references `brainstorming`
- **THEN** 系統 SHALL 在寫入 settings 前顯示 dangling reference warning，列出 `using-superpowers` 仍引用 `brainstorming`，並提供只關閉 `brainstorming`、一併關閉 `using-superpowers`、取消三種處理方式。

#### Scenario: Warn when enabling source with disabled dependency
- **WHEN** `brainstorming` Skill disabled，使用者啟用 `using-superpowers` Skill，且 `using-superpowers` dependsOn `brainstorming`
- **THEN** 系統 SHALL 在寫入 settings 前顯示 dangling dependency warning，說明 `using-superpowers` 依賴已關閉的 `brainstorming`。

#### Scenario: Cancel dangling-producing toggle
- **WHEN** dangling warning dialog 顯示後，使用者選擇取消
- **THEN** 系統 SHALL NOT 改變該 toggle 的 in-memory enabled state，且 SHALL NOT 寫入 settings.json。

### Requirement: Direct Referrer Cascade Disable
當 dangling warning dialog 中使用者選擇一併關閉列出的 source resources 時，系統 SHALL 關閉該 dialog 直接列出的 enabled source resources，並寫入對應 settings filter。系統 SHALL NOT 自動遞迴關閉 source resources 的其他 referrers；完成後 SHALL 重新計算 dangling 狀態。

#### Scenario: Cascade disable direct source skill
- **WHEN** 使用者關閉 `brainstorming`，warning dialog 顯示 `using-superpowers` 仍 references 它，且使用者選擇一併關閉列出的 source resources
- **THEN** 系統 SHALL 同時關閉 `brainstorming` 與 `using-superpowers`，並分別寫入對應的 Skill filter。

#### Scenario: Do not transitive cascade
- **WHEN** `A` references `B`，`B` references `C`，使用者關閉 `C` 並選擇一併關閉 direct source `B`
- **THEN** 系統 SHALL 關閉 `C` 與 `B`，且 SHALL NOT 自動關閉 `A`；後續 dangling 狀態 SHALL 透過重新計算顯示。

### Requirement: Dangling Status Reporting
系統 SHALL 在 `/stack list` 與 footer status 中顯示目前 dangling reference / dependency 摘要。Footer SHALL 在既有 enabled / total 與 unmanaged 資訊之外顯示 dangling count。`/stack list` SHALL 在 enabled source item 行上顯示其 references 或 depends on 的 disabled target resource。

#### Scenario: Footer reports dangling count
- **WHEN** inventory 中存在 1 個 dangling reference，且目前有 16 個 enabled resources、18 個 total resources
- **THEN** footer SHALL 顯示包含 `stack: 16/18` 與 `1 dangling` 的摘要。

#### Scenario: List reports dangling source line
- **WHEN** `using-superpowers` enabled 且 references disabled `brainstorming`
- **THEN** `/stack list` SHALL 在 `using-superpowers` 對應行顯示類似 `⚠ references disabled skill: Brainstorming` 的警告文字。

### Requirement: Conservative Skill Reference Discovery
當執行 `/stack discover` 時，系統 SHALL 對已納管與新納管的 Skill 檔案執行保守內容掃描。若 Skill 內容以高信心語句明確引用另一個已納管 Skill，系統 SHALL 將該關係補入 source item 的 `references.skills` metadata。系統 SHALL NOT 透過 discover 自動產生 `dependsOn` metadata。

#### Scenario: Discover using-superpowers reference to brainstorming
- **WHEN** `/stack discover` 掃描 `using-superpowers/SKILL.md`，且內容包含 `Invoke brainstorming skill`，並且 inventory 中存在 `brainstorming` Skill
- **THEN** 系統 SHALL 在 `using-superpowers` item 補上 `references.skills` 中的 `brainstorming` reference。

#### Scenario: Discover does not infer hard dependency
- **WHEN** `/stack discover` 掃描 Skill 內容並找到明確引用另一個 Skill 的文字
- **THEN** 系統 SHALL 只自動補上 `references.skills`，且 SHALL NOT 自動補上 `dependsOn.skills`。

#### Scenario: Discover preserves manual metadata
- **WHEN** inventory item 已經手動定義 `references` 或 `dependsOn`
- **THEN** `/stack discover` SHALL 保留既有人工 metadata，並只以 idempotent 方式補上缺漏的自動推論 references。

### Requirement: No Runtime Prompt Patching
系統 SHALL NOT 因 reference integrity 檢查而修改、覆寫或動態 patch Skill / Prompt markdown 內容。所有實際啟停 SHALL 仍透過既有 settings filter 寫入完成。

#### Scenario: Disabling brainstorming does not edit using-superpowers prompt
- **WHEN** 使用者關閉 `brainstorming` 且 `using-superpowers` 仍 enabled
- **THEN** 系統 SHALL NOT 修改 `using-superpowers/SKILL.md` 的內容，而是透過 warning、cascade 選項與 settings filter 表達狀態。
