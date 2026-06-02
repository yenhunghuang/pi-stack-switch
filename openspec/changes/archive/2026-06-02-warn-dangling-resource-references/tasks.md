## 1. Metadata 與 Reference Graph

- [x] 1.1 擴充 `InventoryItem` 型別，加入 `references` 與 `dependsOn` metadata，並支援 `extensions` / `skills` / `prompts` / `themes` 分群
- [x] 1.2 實作 reference target resolver，依序支援 exact `id`、normalized `path`、唯一 normalized `label`，並對 unresolved / ambiguous target 保守略過
- [x] 1.3 建立 inventory reference graph 資料結構，保留 source、target、resource type 與 edge kind (`references` / `dependsOn`)
- [x] 1.4 實作 dangling reference / dependency 計算，依目前 `EnabledState` 找出 enabled source 指向 disabled target 的 edges

## 2. Toggle Flow 與 Warning Dialog

- [x] 2.1 在 `/stack` TUI toggle 前預先模擬下一個 enabled state，判斷該操作是否會造成新的 dangling edges
- [x] 2.2 建立 dangling warning dialog，列出被切換 resource、受影響的 source resources、edge kind，以及「只套用目前 toggle / 一併關閉 source resources / 取消」選項
- [x] 2.3 對關閉 target resource 的情境接上 warning dialog，例如關閉 `brainstorming` 時提示 enabled `using-superpowers` 仍引用它
- [x] 2.4 對啟用 source resource 且其 target disabled 的情境接上 warning dialog，例如啟用 `using-superpowers` 時提示 `brainstorming` 已關閉
- [x] 2.5 實作取消流程，確保取消時不更新 in-memory state、不寫入 settings.json、不觸發 reload summary
- [x] 2.6 實作 direct referrer cascade disable，只關閉 dialog 中列出的直接 source resources，並避免 transitive cascade

## 3. List / Footer 狀態呈現

- [x] 3.1 更新 `computeFooter`，在 unmanaged suffix 外加入 dangling count，例如 `stack: 16/18 (1 unmanaged, 1 dangling)`
- [x] 3.2 更新 `/stack list`，在 enabled source item 行顯示 `⚠ references disabled ...` 或 `⚠ depends on disabled ...`
- [x] 3.3 確認 existing scan-first rendering、parent row summary、unmanaged 計數與 dangling 計數可以共存，且不改變既有 toggle 語意

## 4. Discover Reference 推論

- [x] 4.1 擴充 `/stack discover`，讓已納管與新納管 Skill 都會進入 conservative reference inference pass
- [x] 4.2 實作 Skill 檔案讀取與 candidate token 生成，涵蓋 item `id`、normalized label、path basename / `SKILL.md` parent directory
- [x] 4.3 實作高信心文字匹配，例如 `Invoke <skill> skill`、`Use <skill> skill`、`<skill> first`、`/skill:<skill>`、`superpowers:<skill>`
- [x] 4.4 將 discover 推論結果以 idempotent 方式補入 `references.skills`，保留人工 `references` / `dependsOn` metadata，且不自動產生 `dependsOn`
- [x] 4.5 驗證 Superpowers `using-superpowers/SKILL.md` 中的 `Invoke brainstorming skill` 可推論出 `references.skills: ["brainstorming"]`

## 5. Verification

- [x] 5.1 建立或更新 smoke fixture，覆蓋 `using-superpowers` enabled、`brainstorming` disabled 時的 dangling reference 計算
- [x] 5.2 手動驗證 `/stack` 關閉 `brainstorming` 時會提示 `using-superpowers` dangling warning，且三種選項行為符合 spec
- [x] 5.3 手動驗證 `/stack list` 與 footer 會顯示 dangling count / source line warning
- [x] 5.4 執行 `bunx tsc --noEmit`
- [x] 5.5 執行 `bunx biome check .`
