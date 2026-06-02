## Context

`/stack` 目前能透過 `inventory.json` 管理 extensions / skills / prompts / themes，並可用 `associatedResources.extensions` 將 Skill / Prompt 與背後 Extension code 做 tandem toggle。這解決的是「關掉文字資源但程式仍在跑」的 ghost trace 問題。

GitHub issue #1 暴露的是另一種關係：`using-superpowers` 仍啟用時，其 Skill 內容會要求 invoke / prioritize `brainstorming`，即使 `brainstorming` resource 已被 `/stack` 關閉。這不是 code association，而是 resource-to-resource reference integrity 問題。

目前 constraints：

- 不改 Pi 的 settings schema；實際啟停仍寫入既有 package filter 或 top-level resource filter。
- 不修改或 patch Superpowers 等上游 Skill prompt 內容。
- 不把 `references` / `dependsOn` 混入既有 `associatedResources`，避免兩種方向不同的關係語意混淆。

## Goals / Non-Goals

**Goals:**

- 在 inventory metadata 表達 resource 之間的軟引用與硬依賴。
- 在 toggle 會造成 dangling reference / dependency 時，以 TUI dialog 提醒使用者。
- 讓 `/stack list` 與 footer 能顯示目前 dangling 狀態。
- 讓 `/stack discover` 對已納管 Skill 做保守內容掃描，補上明確的 `references.skills`。
- 讓 Superpowers 的 `using-superpowers -> brainstorming` case 能被人工 metadata 或 discover metadata 捕捉。

**Non-Goals:**

- 不動態改寫 Skill markdown 內容。
- 不新增 Pi runtime resource loader 能力。
- 不自動判斷所有自然語言引用；discover 只做高信心匹配。
- 不讓 parent row 成為 bulk dependency editor；`/stack` 仍是 resource toggler。

## Decisions

### Decision 1: 使用 `references` 與 `dependsOn` 分開表達軟 / 硬關係

`InventoryItem` 新增選擇性 metadata：

```jsonc
{
  "id": "using-superpowers",
  "label": "Using Superpowers",
  "path": "skills/using-superpowers/SKILL.md",
  "references": {
    "skills": ["brainstorming"]
  },
  "dependsOn": {
    "skills": ["brainstorming"]
  }
}
```

- `references`：軟引用。target disabled 時 source 仍可 enabled，但需要警告。
- `dependsOn`：硬依賴。target disabled 時 source enabled 代表較嚴重的不一致，dialog 應更明確建議 cascade disable。

替代方案是只用單一 `references` 欄位，但 Superpowers 這類 meta-skill 對 `brainstorming` 的流程依賴比普通文字引用更強，單一欄位會讓 UX 難以分級。

### Decision 2: 以 inventory graph 做 runtime 檢查

啟動 `/stack` 或計算 footer 時，從 inventory 建立 reference graph：

```text
source item ── references / dependsOn ──▶ target item
```

reference target 以 resource type 分群解析，例如 `references.skills` 只解析到 `inventory.skills`。resolver 以保守規則運作：

1. exact `id`
2. exact normalized `path`
3. unique normalized `label`

若同一 reference 無法解析或解析到多個 target，系統 SHALL 不猜測；可在 debug / list 訊息中保留 metadata 問題，但不產生錯誤 cascade。

替代方案是在每次 toggle 時讀 Skill markdown 重新推論 reference，但這會讓 TUI toggle latency 變高，也使 runtime 行為依賴自然語言解析。把推論限定在 discover 階段更符合 `/stack` 的本地低延遲設計。

### Decision 3: 對「將造成 dangling」的狀態轉移顯示 dialog

當使用者關閉 target resource，或啟用一個 source resource，而該操作會形成：

```text
enabled(source) && disabled(target)
```

系統顯示 warning dialog，列出直接相關的 enabled source / disabled target。

關閉 target 時的典型選項：

1. 只關閉 target
2. 一併關閉列出的引用者 / 依賴者
3. 取消

若只有 `references`，語氣應為 warning；若包含 `dependsOn`，語氣應更強，且預設選項可偏向 cascade disable。

替代方案是自動 cascade disable，但這會在使用者只想暫時關掉 target 時造成意外大範圍變更；因此 cascade 必須由使用者明確選擇。

### Decision 4: Cascade disable 僅處理 dialog 中列出的 direct referrers

若使用者選擇一併關閉，系統只關閉 dialog 中列出的直接 enabled referrers，不遞迴追蹤 referrers 的 referrers。完成後重新計算 dangling 狀態並反映在 footer / list。

這避免一次 toggle 展開成難以預測的大型 dependency solver。若未來需要 transitive cascade，可另開 change 擴充。

### Decision 5: `/stack list` 與 footer 顯示目前完整性摘要

`computeFooter` 在既有 unmanaged suffix 外，加入 dangling count，例如：

```text
stack: 16/18 (1 unmanaged, 1 dangling)
```

`/stack list` 在 source item line 顯示簡短警告，例如：

```text
[✓] Using Superpowers ⚠ references disabled skill: Brainstorming
[ ] Brainstorming
```

若存在 hard dependency，使用更強的 wording：

```text
⚠ depends on disabled skill: Brainstorming
```

### Decision 6: Discover 僅做 conservative `references.skills` inference

`/stack discover` 對已納管及新納管的 Skill 檔案做內容掃描。對每個 Skill target 建立候選 token：`id`、normalized label、path basename / `SKILL.md` parent directory。只在高信心語句中補上 reference，例如：

- `Invoke <skill> skill`
- `Use <skill> skill`
- `<skill> first`
- `/skill:<skill>`
- `superpowers:<skill>`

discover 只自動寫入 `references.skills`，不自動寫入 `dependsOn`。原因是硬依賴需要產品判斷；自然語言掃描不足以可靠分辨。

對既有 inventory item，discover 可補上缺漏 reference metadata；不刪除使用者已手動寫入的 references / dependsOn，避免破壞人工 curate。

## Risks / Trade-offs

- [Risk] 自動掃描自然語言誤判 reference。→ Mitigation：只使用高信心 pattern，且只推論軟 `references`。
- [Risk] reference target id / path / label 不唯一導致錯誤 cascade。→ Mitigation：resolver 遇到 ambiguous target 時不產生 edge。
- [Risk] dialog 過於頻繁影響 toggle 流暢度。→ Mitigation：只在會造成新 dangling 狀態的 transition 顯示，既有 dangling 透過 footer/list 呈現。
- [Risk] cascade disable 範圍超出使用者預期。→ Mitigation：dialog 明確列出將被一併關閉的 direct referrers，且不做 transitive cascade。
- [Risk] `references` 與 `associatedResources` 名稱相近造成困惑。→ Mitigation：文件與 spec 明確說明前者是 prompt/resource graph，後者是 child resource 與 code module 的 tandem toggle。
