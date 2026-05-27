## ADDED Requirements

### Requirement: Scan-first Item Rendering
系統 SHALL 在 `/stack` 主列表中以名稱優先的 scan-first 形式顯示每個可切換項目。當項目具有 description 時，系統 SHALL 以 `名稱 — description` 的單行格式呈現；系統 SHALL NOT 在主列表 label 前方顯示 category 前綴，例如 `[Workflow:Code Intelligence]`。

#### Scenario: Extension item renders without category prefix
- **WHEN** 使用者開啟 `/stack`，且某個 extension item 具有 label、category 與 description
- **THEN** 系統 SHALL 先顯示該 item 的名稱，再以單行 `名稱 — description` 形式顯示能力描述，且 SHALL NOT 在名稱前顯示 category 前綴。

#### Scenario: Tab-specific list keeps name-first scanning
- **WHEN** 使用者切換到 `Extensions`、`Skills`、`Prompts` 或 `Themes` 任一分頁
- **THEN** 系統 SHALL 於該分頁延續名稱優先的單行 item 呈現，讓使用者能先辨識工具名稱，再輔以 description 決定是否切換。

#### Scenario: Long inline labels keep status column aligned
- **WHEN** 名稱優先的 inline label 超過 `SettingsList` 的 label 對齊欄位
- **THEN** 系統 SHALL 截斷主列表 inline label 以維持 `ON` / `OFF` 狀態欄對齊，且 SHALL 在選取該項目時顯示完整 label 文字。

### Requirement: Inline Descriptions Use Capability Phrases
系統 SHALL 將 `/stack` 主列表中的 inline description 視為能力短語，而非分類、來源、安裝狀態或資源型別說明。description MUST 優先表達該項目實際提供的能力，例如 `LSP / ast-grep`、`使用者確認` 或 `網頁 / 外部檢索` 這類短語。

#### Scenario: Description emphasizes capability over source metadata
- **WHEN** 某個 inventory item 具有可顯示於 `/stack` 的 description
- **THEN** 該 description SHALL 描述該項目的能力，且 SHALL NOT 使用 `Discovered global package`、`Workflow:Analysis` 或其他來源 / 分類 / 安裝狀態文字作為主列表描述。

#### Scenario: Discover avoids placeholder descriptions
- **WHEN** `/stack discover` 將未管理的 extension 加入 inventory
- **THEN** 系統 SHALL NOT 自動填入 `Discovered global package` 或其他來源 / 安裝狀態 placeholder description，讓後續人工 curate 補上能力短語。
