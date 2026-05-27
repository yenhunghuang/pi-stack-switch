## 1. Tree Data Model

- [x] 1.1 Add UI-only parent row metadata helpers for `parent:<tab>:<parentId>` and standalone root rows without changing `inventory.json` schema.
- [x] 1.2 Extend `buildSettingItems` inputs to receive fold state and search-mode state while preserving existing `Extensions` flat-list behavior.
- [x] 1.3 Build `Skills` / `Prompts` / `Themes` rows from existing `source` parent-child relationships, grouping child resources under parent Extension rows and standalone resources under `Standalone`.

## 2. Rendering and Interaction

- [x] 2.1 Render parent rows with `▾` / `▸` labels and child enabled summaries such as `1/2 ON`, keeping SettingsList alignment and current visual style.
- [x] 2.2 Render child rows with two-space indentation and name-first labels without repeating `<Parent> › <Child>` prefixes.
- [x] 2.3 Intercept parent row changes in the SettingsList `onChange` callback so `Enter` / `Space` only fold or unfold the parent and never write settings.
- [x] 2.4 Preserve child row toggle behavior, including existing associated resource and shared-entrypoint handling.

## 3. Search and Warning States

- [x] 3.1 Track external search emptiness transitions so entering search mode temporarily expands all parent groups.
- [x] 3.2 Restore the user’s previous fold state when search is cleared, and reset search state on tab switches.
- [x] 3.3 Move parent-disabled warnings from repeated child labels to parent row summary / description while keeping child toggle behavior intact.

## 4. Theme and Visual Consistency

- [x] 4.1 Update the custom SettingsList value renderer to handle `"off"` explicitly and preserve non-`on` / non-`off` summary values.
- [x] 4.2 Update help text only if needed so it still matches actual keyboard behavior and the existing `/stack` tone.
- [x] 4.3 Ensure long parent and child labels continue to truncate with full text in the selected description when needed.

## 5. Verification

- [x] 5.1 Run `bunx tsc --noEmit` and fix type errors.
- [x] 5.2 Run `bunx biome check .` and fix formatting / lint issues.
- [x] 5.3 Manually verify `/stack` renders `Extensions` as flat list and `Skills` / `Prompts` / `Themes` as parent-child foldable lists.
- [x] 5.4 Manually verify searching finds a child resource under a collapsed parent and restores the fold state after clearing search.
- [x] 5.5 Manually verify toggling a parent row performs no settings write, while toggling child rows still persists settings changes.
