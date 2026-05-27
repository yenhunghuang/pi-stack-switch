## Context

目前 `/stack` 基於 `SettingsList` 提供多選開關。在 `pi-coding-agent` 中，Extension（代碼模組）與 Skill/Prompt（Markdown 文本）在 `settings.json` 內通常是獨立加載的。
當使用者關閉子 Skill 時，只有對應的 Markdown 沒加載，而背景代碼（例如事件監聽、預處理、或全域 Command）依然活著，形成幽靈痕跡（Ghost Traces）。

為了解決這個問題，我們需要重新調整 `/stack` 的分頁架構與切換邏輯：
1. 移除不符合實用情境、混淆語意且冗餘的 `All` 分頁，預設以 `Extensions`（套件主開關）為首頁，並讓 `Skills` 和 `Prompts` 當作進階微調後台。
2. 讓子資源（Skill / Prompt）能與其背後的代碼模組（Extension JS/TS 檔案）在 metadata 層面進行綁定。在切換時自動對兩者加上過濾，並在共享入口（如 `index.ts`）時提供 TUI 互動對話框確認，確保關閉乾淨。
3. 智慧化 `/stack discover` 工作流。當使用者執行 discover 偵測新裝套件時，系統應該主動掃描該套件在本機磁碟上的物理目錄，自動分析出子 Skills 與 Prompts 並寫入對應的 inventory 陣列中，且透過對稱特徵匹配，一併全自動生成並預填 `associatedResources` 欄位，徹底免除使用者手動編輯配置的負擔。
4. 同步納管 standalone Skills、Prompts、Themes。pi 會從 `~/.agents/skills/`、`~/.pi/agent/skills/`、`.pi/skills/`、`.pi/prompts/`、`.pi/themes/` 等位置自動載入純資源，這些資源沒有 parent Extension，但仍應在 `/stack` 中可見且可透過 top-level settings filter 開關。

## Goals / Non-Goals

**Goals:**

- 移除 `/stack` 中的 `All` 分頁，將首頁預設為 `Extensions`，其餘為微調後台。
- 擴充 `inventory.json` 宣告型別，加入 `associatedResources.extensions` 陣列元數據。
- 升級 `applyToggle` 機制：在開關子資源時，自動加減 settings 中的 extensions 對應檔案。
- 實作共享入口過濾警告：當子資源關聯的程式碼是共享的 `index.ts`，且有其他活著的兄弟資源時，跳出 TUI Confirm Dialog。
- **實作智慧 Discover 掃描**：
  - 當發現新套件時，主動遞迴掃描該套件目錄下的 `skills/`、`prompts/` 與 `themes/`。
  - 將解析到的子資源自動追加寫入 `inventory.json` 的對應分類陣列中（建立 parent-child 的 `source` 關聯）。
  - 使用對稱特徵匹配演算法（Heuristic Matchmaking），自動推導並預填 `associatedResources`。
  - 掃描 standalone Skills、Prompts、Themes 預設載入位置，將無 parent package 的純資源以 top-level item 追加寫入 inventory。

**Non-Goals:**

- 不改動 `pi` 本身的核心加載機制與安全沙箱。
- 不引入代碼靜態分析（Static Analysis）或 AST 語意分析來自動推導程式中的代碼依賴，僅透過路徑與檔名相似度特徵。
- 不增加除了 `pi-tui` 現有元件之外的外部 UI 庫。

## Decisions

### 1. 移除 All 頁籤，重構 openSelector 預設分頁

- **做法**：將 `TABS` 中的 `all` 移除，並將首頁預設改為 `extensions`。
- **理由**：`All` 頁籤常讓使用者對「All」產生語意混淆。直覺以 Extensions 起手，能滿足 90% 使用者「無腦全開全關」的心智模型。

### 2. 透過 `inventory.json` 的 `associatedResources` 進行 explicit 資源關聯

- **做法**：在 `InventoryItem` 型別中擴充 `associatedResources?: { extensions?: string[] }` 屬性。
- **理由**：顯示地（Explicit）聲明依賴是最穩健、最快速、最不消耗 Token 的做法。

### 3. 在 `applyToggle` 中實作智慧型 Tandem Toggle（連動過濾）

- **做法**：
  - 當關閉子項目時，在 `settings.json` 的 `extensions` 陣列中寫入 `-path/to/mod.ts`。
  - 當開啟子項目時，將 `extensions` 陣列中的 `-path/to/mod.ts` 移除。
- **理由**：`pi` 官方的 packages 資源過濾完全支援對 `extensions` 中的個別檔案進行 `-` 過濾。

### 4. 針對共享 `index.ts` 實作 TUI 交互對話框

- **做法**：當要連動關閉的檔案為 `index.ts` 且有其他啟用的兄弟項目時，跳出對話框，給予「一併關閉主套件」與「僅關閉提示詞」的選擇。
- **理由**：這提供了細粒度控制與防止误殺之間的完美平衡。

### 5. /stack discover 深度解析與 Heuristic Matchmaking 自動關聯

- **做法**：
  - 當 discover 找到新套件並在本地找到其安裝路徑時，使用 `fs.readdir` 遞迴檢查 `skills/`、`prompts/`。
  - 對於掃描到的子資源，執行以下 Heuristic Matchmaking 自動配對：
    - **對稱路徑比對**：若 Skill 位於 `skills/{feature}/SKILL.md`，程式位於 `extensions/{feature}.ts`，兩者擁有相同特徵名 `{feature}`，則自動為該 Skill 寫入 `associatedResources: { "extensions": ["extensions/{feature}.ts"] }`。
    - **扁平檔名比對**：若 Skill 位於 `skills/{feature}.md`，程式位於 `extensions/{feature}.ts`，檔名相同，亦自動綁定。
    - **主入口綁定兜底**：若套件無 `extensions/` 資料夾，僅有單一 `index.ts` 入口，則自動將所有子資源的 `associatedResources.extensions` 預填為 `["index.ts"]`，以便後續觸發共享警告。
  - 將產生的子資源陣列，自動與 Extensions 一起附加寫入 `inventory.json` 中。
- **理由**：0 Token 消耗，全自動建立完美閉環。使用者一鍵 discover 後即可開箱即用享受連動過濾，維護極致無痛。

### 6. Standalone Skills / Prompts / Themes 納管

- **做法**：
  - `/stack discover` 會掃描 pi 預設 top-level 資源位置：
    - Skills：`~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/`、專案與祖先目錄的 `.agents/skills/`。
    - Prompts：`~/.pi/agent/prompts/`、`.pi/prompts/`。
    - Themes：`~/.pi/agent/themes/`、`.pi/themes/`。
  - 掃描出的純資源以 `source` 未設定、`path` 為絕對檔案路徑的 `InventoryItem` 追加至對應分類。
  - 切換這些 item 時沿用既有 top-level settings filter，寫入 `+absolute/path` 或 `-absolute/path`，不建立 parent-child 關係，也不套用 `associatedResources`。
- **理由**：`ai-sdk` 這類單純 Skill 不屬於 Extension package，但仍是 pi runtime 的可開關資源。以 top-level item 管理可保持 settings schema 相容，並避免把純文字資源誤歸類為套件子項。

## Risks / Trade-offs

- [Risk] 複雜的連動可能導致 settings.json 變得擁擠。 → Mitigation：在寫入時自動去重，並在關閉時乾淨地移除負向過濾。
- [Risk] 不同的套件目錄結構可能導致 Heuristic Matchmaking 無法完美匹配。 → Mitigation：若匹配失敗，僅預填基礎資源而不預填 `associatedResources`。使用者隨時可以人工 curate 修改 `inventory.json`，系統依然完全支援。
