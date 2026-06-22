## 1. Description Fallback

- [x] 1.1 Update inventory description typing to accept string or locale map.
- [x] 1.2 Add a shared resolver that returns `zh-TW`, then string, then `未提供描述`.
- [x] 1.3 Use the resolver in `/stack`, `/stack list`, and selected item descriptions.

## 2. Discover Behavior

- [x] 2.1 Stop writing placeholder descriptions for discovered extensions without manifest descriptions.
- [x] 2.2 Ensure discovered extensions with real manifest descriptions keep that description.

## 3. Verification

- [x] 3.1 Add smoke coverage for localized description fallback and discover placeholder behavior.
- [x] 3.2 Run `bun smoke-reference-integrity.ts`.
- [x] 3.3 Run `bunx biome check .`.
