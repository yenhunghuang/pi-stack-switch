# stack-switch-tabs Specification

## Purpose
TBD - created by archiving change tabbed-visual-stack. Update Purpose after archive.
## Requirements
### Requirement: Tabbed Interface Rendering
系統 SHALL 在 `/stack` 介面的頂部渲染一個包含 4 個分類的頁籤列：`Extensions`、`Skills`、`Prompts`、`Themes`。選中的當前頁籤 SHALL 以主題的 `accent` 顏色與粗體樣式高亮顯示，而非選中的頁籤則以 `muted` 顏色顯示。頁籤與下方的設定清單之間 SHALL 渲染一條簡約底線作為視覺分隔。本系統 SHALL NOT 渲染 `All` 頁籤，且 SHALL 預設將 `Extensions` 分頁作為首頁開啟。

#### Scenario: Active Tab Highlighting
- **WHEN** 使用者輸入 `/stack` 指令開啟介面
- **THEN** 系統 SHALL 預設選中 `Extensions` 頁籤並將其以 `accent` 顏色高亮，且正確渲染頁籤底下的簡約分隔線，並且不顯示 `All` 頁籤。

### Requirement: Accurate Keyboard Hint Rendering
系統 SHALL 在 `/stack` 介面中顯示與實際鍵盤操作一致的提示文字。提示 MUST 明確標示 `Enter` / `Space` 用於切換目前選取項目的 on/off 狀態，且 MUST 將 `Left` / `Right` 或 `←→` 標示為頁籤切換用途，而非 toggle 用途。

#### Scenario: Hint Describes Toggle Keys Accurately
- **WHEN** 使用者輸入 `/stack` 指令開啟介面
- **THEN** 系統 SHALL 顯示 `Enter` / `Space` 可用於 toggle 的提示，且 SHALL NOT 顯示 `←→ toggle` 這類把左/右方向鍵描述為 toggle 的提示。

### Requirement: Keyboard-based Tab Switching
系統 SHALL 攔截鍵盤輸入。當偵測到 `Tab` 或 `Right` 方向鍵時，向右循環切換頁籤；當偵測到 `Shift+Tab` 或 `Left` 方向鍵時，向左循環切換頁籤。當偵測到數字鍵 `1` ~ `4` 時，直接切換至對應頁籤（1 代表 Extensions，2 代表 Skills，3 代表 Prompts，4 代表 Themes）。在切換頁籤後，系統 SHALL 在記憶體中依選中的類型動態過濾並重構設定列表。頁籤切換 SHALL NOT 觸發任何資源 toggle 或 settings 寫入；資源 toggle SHALL 由 `Enter` / `Space` 觸發。

#### Scenario: Numeric Shortcut Switching
- **WHEN** 使用者按下鍵盤上的 `2` 鍵
- **THEN** 系統 SHALL 將當前頁籤切換至 `Skills`，並僅在 `SettingsList` 中顯示技能類型的設定項目。

#### Scenario: Arrow Key Tab Switching
- **WHEN** 使用者在 `/stack` 介面按下 `Right` 方向鍵
- **THEN** 系統 SHALL 向右循環切換到下一個頁籤，且 SHALL NOT 切換目前選取項目的 on/off 狀態。

#### Scenario: Left Arrow Tab Switching
- **WHEN** 使用者在 `/stack` 介面按下 `Left` 方向鍵
- **THEN** 系統 SHALL 向左循環切換到上一個頁籤，且 SHALL NOT 切換目前選取項目的 on/off 狀態。

### Requirement: Non-Orphan Resource Visibility and Toggle
在特定的分頁頁籤下（如 `Skills`、`Prompts`、`Themes`），系統 SHALL 依 parent Extension 與 child resource 的 `source` 關係呈現所有受管理的附屬資源。附屬資源 SHALL 可透過展開其 parent row 或透過搜尋被找到，且使用者 SHALL 能夠在 child row 上獨立開關這些子資源。若某個附屬資源被開啟，但其父 Extension 處於關閉狀態時，系統 SHALL 在 parent row 顯示簡短警告狀態，並在該 parent row 被選取時於 description 顯示可讀說明，提示使用者需到 `Extensions` 分頁啟用 parent Extension。系統 SHALL NOT 在同一 parent 底下的每個 child row 重複顯示 parent warning。

#### Scenario: Toggling Non-Orphan Skill
- **WHEN** 使用者在 `Skills` 分頁展開 `Taskplane` parent row，選中其底下的一個技能並將該技能開關狀態切換為 `on`
- **THEN** 系統 SHALL 獨立寫入對應的子項目開關模式至 `settings.json`；若 `Taskplane` 為關閉，則 `Taskplane` parent row SHALL 顯示警告狀態，且選取該 parent row 時 SHALL 說明需要在 `Extensions` 分頁啟用 `Taskplane`。

### Requirement: Zero-Token Local Performance
所有頁籤的切換、過濾和重構操作 MUST 完全在本地記憶體中執行。系統 SHALL 避免在使用者進行頁籤切換或開關選擇時呼叫任何 AI 模型或遠端 API，以確保極致的低延遲，並達成 0 額外 Token 消耗。

#### Scenario: High Performance Local Switch
- **WHEN** 使用者在離線狀態下快速連續按下 `Tab` 鍵切換頁籤
- **THEN** 系統 SHALL 在 5 毫秒內流暢更新並重繪 TUI 介面，且不會拋出任何網路請求或呼叫大語言模型。

### Requirement: Scan-first Item Rendering
系統 SHALL 在 `/stack` 主列表中以名稱優先的 scan-first 形式顯示每個可切換項目。當項目具有 description 時，系統 SHALL 以 `名稱 — description` 的單行格式呈現；系統 SHALL NOT 在主列表 label 前方顯示 category 前綴，例如 `[Workflow:Code Intelligence]`。在 `Skills`、`Prompts`、`Themes` 分頁中，child row SHALL 以兩格空格縮排方式呈現在 parent row 底下，且 child label SHALL 直接顯示 child 名稱與能力描述，不再重複顯示 `<Parent> › <Child>` 前綴。Parent row SHALL 直接顯示 parent Extension 名稱與展開 / 收合符號，並保留右側 value 欄對齊。
為了保證畫面穩定性與流暢的鍵盤操作：
1. `Extensions` 分頁項目 SHALL 保持固定排序（如字母排序），SHALL NOT 根據 ON/OFF 啟用狀態動態重新分組與排序，以防止 toggle 時清單跳動或游標位置失焦。
2. 所有渲染項目 SHALL 保留一個單行 description slot。若該項目不具備 description，則系統 SHALL 渲染一個帶有單一空格占位符（`" "`）的 slot，以防止使用者使用上下方向鍵移動游標時，畫面整體因描述區塊顯隱而上下跳動一行。

#### Scenario: Extension item renders without category prefix
- **WHEN** 使用者開啟 `/stack`，且某個 extension item 具有 label、category 與 description
- **THEN** 系統 SHALL 先顯示該 item 的名稱，再以單行 `名稱 — description` 形式顯示能力描述，且 SHALL NOT 在名稱前顯示 category 前綴。

#### Scenario: Tab-specific list keeps name-first scanning
- **WHEN** 使用者切換到 `Extensions`、`Skills`、`Prompts` 或 `Themes` 任一分頁
- **THEN** 系統 SHALL 於該分頁延續名稱優先的單行 item 呈現；其中 `Skills`、`Prompts`、`Themes` 的 child resources SHALL 顯示於 parent row 底下並以兩格縮排建立父子關係，讓使用者能先辨識 parent，再掃描 child 工具名稱與能力描述。而且在 `Extensions` toggle 啟用與停用時，項目順序 SHALL 保持不變，避免跳來跳去。

#### Scenario: Long inline labels keep status column aligned
- **WHEN** 名稱優先的 inline label 超過 `SettingsList` 的 label 對齊欄位
- **THEN** 系統 SHALL 截斷主列表 inline label 以維持 `ON` / `OFF` 或 parent summary 狀態欄對齊，且 SHALL 在選取該項目時顯示完整 label 文字。

### Requirement: Inline Descriptions Use Capability Phrases
系統 SHALL 將 `/stack` 主列表中的 inline description 視為能力短語，而非分類、來源、安裝狀態或資源型別說明。description MUST 優先表達該項目實際提供的能力，例如 `LSP / ast-grep`、`使用者確認` 或 `網頁 / 外部檢索` 這類短語。

#### Scenario: Description emphasizes capability over source metadata
- **WHEN** 某個 inventory item 具有可顯示於 `/stack` 的 description
- **THEN** 該 description SHALL 描述該項目的能力，且 SHALL NOT 使用 `Discovered global package`、`Workflow:Analysis` 或其他來源 / 分類 / 安裝狀態文字作為主列表描述。

#### Scenario: Discover avoids placeholder descriptions
- **WHEN** `/stack discover` 將未管理的 extension 加入 inventory
- **THEN** 系統 SHALL NOT 自動填入 `Discovered global package` 或其他來源 / 安裝狀態 placeholder description，讓後續人工 curate 補上能力短語。

### Requirement: Parent-Child Collapsible Resource Rendering
系統 SHALL 在 `/stack` 的 `Skills`、`Prompts`、`Themes` 分頁中，依據 child resource 的 `source` 與 inventory 中的 parent Extension 建立父子視覺結構。每個具有 child resources 的 parent Extension SHALL 顯示為可展開 / 收合的 parent row；parent row SHALL 使用符合現有 SettingsList 風格的單列呈現，label 使用 `▾` 表示展開、`▸` 表示收合，value 顯示該 parent 底下 child resources 的啟用摘要（例如 `1/2 ON`）。Parent row SHALL NOT 使用 `● ON` / `○ OFF` 樣式，避免被誤解為實際資源 toggle。
預設情況下，所有 parent rows 均 SHALL 為收合（`▸`）狀態。展開 / 收合操作 SHALL 保持游標位置，游標 SHALL 鎖定在目前操作的 parent row 上，而不跳回列表第一行。

#### Scenario: Render skills under parent extension
- **WHEN** 使用者切換到 `Skills` 分頁，且 `Pi Lens` extension 底下有 `ast-grep` 與 `LSP Navigation` 兩個 managed skills
- **THEN** 系統 SHALL 預設以收合狀態（`▸`）顯示一列 `Pi Lens` parent row，並在展開時以兩格縮排的 child rows 顯示 `ast-grep` 與 `LSP Navigation`。

#### Scenario: Parent row folds without changing settings and preserves selection
- **WHEN** 使用者在 `Skills` 分頁選中 `Pi Lens` parent row 並按下 `Enter` 或 `Space`
- **THEN** 系統 SHALL 只切換該 parent row 的展開 / 收合狀態，且 SHALL NOT 寫入 `settings.json` 或改變 any Extension / Skill 的 enabled state。此外，系統 SHALL 保持游標在該 `Pi Lens` parent row 之上。

#### Scenario: Standalone resources are grouped under standalone root
- **WHEN** 使用者切換到 `Skills`、`Prompts` 或 `Themes` 分頁，且該分頁包含沒有 parent `source` 的 standalone resources
- **THEN** 系統 SHALL 將這些 resources 顯示於 `Standalone` root row 底下，並讓它們維持既有獨立 toggle 行為。

### Requirement: Folded Children Remain Searchable
系統 SHALL 確保 `/stack` 搜尋能找到位於已收合 parent row 底下的 child resources。當搜尋 query 從空字串變為非空時，系統 SHALL 暫時以搜尋模式重建該分頁清單，使所有 parent rows 的 child resources 都進入可搜尋資料集；當搜尋 query 清空時，系統 SHALL 恢復使用者原本的展開 / 收合狀態。
為確保模糊匹配（Fuzzy Match）的正確度與便利度，搜尋輸入與比對過程 SHALL 對輸入文字進行符號正規化，忽略例如 `-`、`_`、`/`、`\` 等常見分隔符號，使如 `ai-sdk` / `ai sdk` 能順利比對包含 `Ai Sdk` 的 label，且避免 `/` 被當成開啟搜尋以外的比對字元。

#### Scenario: Search finds child under collapsed parent
- **WHEN** 使用者在 `Skills` 分頁收合 `Pi Lens` parent row，接著輸入搜尋 query `ast`
- **THEN** 系統 SHALL 能搜尋並顯示 `ast-grep` skill，即使該 skill 原本位於已收合的 `Pi Lens` parent row 底下。

#### Scenario: Normalizing query for fuzzy match
- **WHEN** 使用者在 `Skills` 分頁輸入包含符號的搜尋 query `ai-sdk`
- **THEN** 系統 SHALL 能成功模糊比對並顯示 `Ai Sdk` / `AI SDK` 的相關技能。

#### Scenario: Clearing search restores fold state
- **WHEN** 使用者原本收合 `Pi Lens` parent row，並在搜尋期間看到其 child resources
- **THEN** 當使用者清空搜尋 query 後，系統 SHALL 恢復 `Pi Lens` parent row 的收合狀態。

### Requirement: Summary Values Preserve SettingsList Visual Style
系統 SHALL 在 parent rows 顯示 child enabled summary 時保留原始 summary 文字，例如 `0/2 ON`、`1/2 ON` 或 `⚠ 1/2 ON`。系統 SHALL 繼續將 child resource 的 `on` / `off` values 渲染為既有的 `● ON` / `○ OFF` 樣式，且 SHALL NOT 將 parent row summary 誤渲染為 `○ OFF`。

#### Scenario: Parent summary does not render as off state
- **WHEN** `Pi Lens` parent row 的 value 為 `1/2 ON`
- **THEN** 系統 SHALL 顯示 `1/2 ON` summary，且 SHALL NOT 將該 value 顯示為 `○ OFF`。
