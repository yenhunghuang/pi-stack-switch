# pi-stack-switch

`/stack` 是 pi extension stack 的 multi-select 切換器，UI 使用 pi 內建 `SettingsList`：

```text
/stack           # 開啟 multi-select 介面
Ctrl+S           # 同上的快捷鍵
/stack list      # 文字列出目前 on/off
/stack current   # 同 /stack list
/stack discover  # 掃 settings.json，將未管理的 extension 加入 inventory.json
```

## 行為

- `inventory.json` 決定 `/stack` 介面列出哪些 extensions / skills / prompts / themes。
- 切換會直接寫入 pi 目前的 `settings.json` schema：
  - package resource filters：`packages[].extensions` / `skills` / `prompts` / `themes`
  - top-level resource patterns：`+path` / `-path`
- 關閉 selector 後只執行一次 `ctx.reload()`。
- `session_start` 會掃描 `settings.json` 的 `packages` / `extensions`，footer 若看到 `(N unmanaged)` 代表有已安裝但未列入 inventory 的 extension。
- `/stack discover` 會逐一詢問是否加入 inventory，並讓你選分類。
- `/stack discover` 也會補齊已管理 package 的 child resources，並納管 standalone Skills / Prompts / Themes。
- 不執行 `pi install` / `pi remove`，不移除 package source。

## 安裝與更新

你可以直接透過 GitHub 安裝此 Extension：

### 1. 全域安裝 (推薦，所有專案皆可使用 `/stack` 與 `Ctrl+S`)
```bash
pi install git:github.com/yenhunghuang/pi-stack-switch
```

### 2. 專案本地安裝 (僅在當前專案目錄下生效)
```bash
pi install git:github.com/yenhunghuang/pi-stack-switch -l
```

### 3. 臨時測試 (僅在本次啟動測試，不寫入設定)
```bash
pi -e git:github.com/yenhunghuang/pi-stack-switch
```

### 後續更新
當此套件有新版本推出時，你只需執行：
```bash
pi update --extensions
```
`pi` 就會自動幫你下載最新版！

---

## 設定 inventory.json (推薦搭配 /stack discover)

`/stack` 需要知道你要管理哪些 extensions。你有兩種方式可以建立 `inventory.json` 設定檔：

### 方式 A：使用 Discover 自動掃描 (最省心 🚀)
安裝好套件後，直接在 `pi` 對話框內輸入：
```text
/stack discover
```
它會自動掃描目前 `settings.json` 中所有已安裝但未列入說明的 extensions，逐一詢問是否加入管理，並自動在專案下建立 `.pi/inventory.json` (若無專案設定則建立於全域 `~/.pi/agent/inventory.json`)。

Discover 也會：

- 深度掃描已管理 / 新加入 package 底下的 `skills/`、`prompts/`、`themes/`，補齊 child resources。
- 掃描 standalone Skills / Prompts / Themes，例如 `~/.agents/skills/ai-sdk/SKILL.md`、`~/.pi/agent/prompts/*.md`、`.pi/themes/*.json`，以 top-level resource 方式納管。

完全不需要手動複製檔案！

### 方式 B：手動複製範例檔
如果你想手動調整管理清單，可以將此 repo 中的範例檔複製至設定目錄中：
- **專案層級：**
  ```bash
  mkdir -p .pi
  cp ~/.pi/agent/git/github.com/yenhunghuang/pi-stack-switch/inventory.json.example .pi/inventory.json
  ```
- **全域層級：**
  ```bash
  cp ~/.pi/agent/git/github.com/yenhunghuang/pi-stack-switch/inventory.json.example ~/.pi/agent/inventory.json
  ```

Project `.pi/inventory.json` 優先於 global `~/.pi/agent/inventory.json`。

`id` 建議填 package source / npm package name / local package basename，例如 `context-mode`、`taskplane`、`@plannotator/pi-extension`、`pi-stack-switch`。若 `id` 只想作顯示識別，可用：

- `source`：指定實際 package source。package child resource 會用它建立父子關係。
- `path`：指定 package root 內的單一 resource path；不填時會切換整個 package 的該類 resource。
- standalone resource 不需要 `source`，`path` 可使用絕對檔案路徑，切換時會寫入 top-level `skills` / `prompts` / `themes` filter。

```jsonc
{
  "extensions": [
    {
      "id": "context-mode",
      "label": "Context Mode",
      "category": "Workflow:Analysis",
      "description": "大輸出沙箱化"
    }
  ],
  "skills": [
    {
      "id": "create-taskplane-task",
      "label": "Create Taskplane Task",
      "source": "taskplane",
      "path": "skills/create-taskplane-task/SKILL.md"
    },
    {
      "id": "ai-sdk",
      "label": "AI SDK",
      "path": "/home/you/.agents/skills/ai-sdk/SKILL.md",
      "category": "Standalone"
    }
  ]
}
```

## Discover 工作流

新增 extension 後若忘記改 `inventory.json`，footer 會類似顯示：

```text
stack: 7/12 (3 unmanaged)
```

執行：

```text
/stack discover
```

它會列出未管理項目，逐一詢問是否加入，並寫回目前使用的 `inventory.json`（若不存在則建立 project `.pi/inventory.json`）。已經在 inventory 中的 package 也會被 deep scan，缺漏的 child resources 會直接補上；standalone Skills / Prompts / Themes 也會直接補上。

### ⚠️ Scan-first 與人工 Curate 維護流程

為了確保 `/stack` 主列表的閱讀流暢度（scan-first 體驗），我們採用**人工 Curate** 的維護流程：
1. **Discover 先加入 inventory**：使用 `/stack discover` 自動偵測未管理項目，並快速加入 `inventory.json`。
2. **人工 Curate 短描述**：Discover 新增項目時不會自動填入 description；請手動開啟 `inventory.json`，將 `description` 欄位整理成簡短的**能力短語**。

### ✍️ Description 撰寫規則與範例

為了避免列表狀態欄因 label 過長而錯位，撰寫 description 時請遵循以下規則：

- **避免** 分類、來源、安裝狀態或資源型別說明（例如：*不要* 使用 `Discovered global package`、`Workflow:Analysis` 或 `Extension path` 等文字）。
- **聚焦** 該項目實際提供的核心能力，使用精煉的動詞或名詞短語。
- **控制長度**：`/stack` 會把主列表 inline label 壓在 30 個 visible columns 內，超出時以 `…` 截斷，並在選取項目下方顯示完整文字。
- **Scan-first 優秀文案範例：**
  - `LSP / AST 搜尋`
  - `大輸出分析`
  - `任務編排 /orch`
  - `標記 / review`
  - `多 Agent 協同`

## 注意

此版不是舊的 profile / restore 模式；切換結果會持久化。若要還原，重新開 `/stack` 把項目切回原狀。
