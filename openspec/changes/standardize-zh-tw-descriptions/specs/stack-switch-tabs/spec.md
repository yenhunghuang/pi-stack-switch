## ADDED Requirements

### Requirement: Localized Description Fallback

系統 SHALL 支援 inventory item 的 `description` 欄位為字串或 locale map。當 `/stack` 主列表、選取項目說明或 `/stack list` 需要顯示 description 時，系統 SHALL 依序使用 `description["zh-TW"]`、字串 `description`、`未提供描述`。空字串與只含空白的 description SHALL 視為未提供。

#### Scenario: Prefer zh-TW description map

- **WHEN** inventory item 定義 `description: { "zh-TW": "使用者確認", "en": "Ask the user" }`
- **THEN** `/stack` SHALL 顯示 `使用者確認` 作為該 item 的 description。

#### Scenario: Fallback to string description

- **WHEN** inventory item 定義 `description: "LSP / ast-grep"`
- **THEN** `/stack` SHALL 顯示 `LSP / ast-grep` 作為該 item 的 description。

#### Scenario: Fallback to missing description label

- **WHEN** inventory item 沒有 description，或 description 為空字串
- **THEN** `/stack` SHALL 顯示 `未提供描述`，且 SHALL NOT 顯示空白 description 或來源 placeholder。

### Requirement: Discover Preserves Curated Description Semantics

`/stack discover` SHALL 在新增 extension inventory item 時使用 localized description fallback。若來源 manifest 沒有可用 description，系統 SHALL 省略 inventory description 欄位，讓顯示端 fallback 到 `未提供描述`。系統 SHALL NOT 寫入 `Discovered global package` 或其他來源 / 安裝狀態 placeholder description。

#### Scenario: Discover writes available manifest description

- **WHEN** `/stack discover` 新增一個 extension，且其 manifest 提供非空 description
- **THEN** 系統 SHALL 將該 description 寫入 inventory，供顯示端以 localized fallback 呈現。

#### Scenario: Discover omits missing manifest description

- **WHEN** `/stack discover` 新增一個 extension，且其 manifest 沒有可用 description
- **THEN** 系統 SHALL 不寫入 placeholder description，且 `/stack` 顯示該項目時 SHALL 使用 `未提供描述`。
