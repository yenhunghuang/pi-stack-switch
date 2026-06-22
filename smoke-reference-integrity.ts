const assert = {
	equal(actual: unknown, expected: unknown) {
		if (actual !== expected) {
			throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
		}
	},
	deepEqual(actual: unknown, expected: unknown) {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(
				`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
			);
		}
	},
	match(actual: string, expected: RegExp) {
		if (!expected.test(actual)) {
			throw new Error(
				`Expected ${JSON.stringify(actual)} to match ${expected}`,
			);
		}
	},
};

import {
	buildInventoryReferenceGraph,
	computeDanglingEdges,
	computeWarningParentRowIds,
	type EnabledState,
	formatStackFooter,
	type Inventory,
	inferSkillReferencesFromContent,
	inventoryItemFromUnmanaged,
	renderTextList,
	resolveDescription,
} from "./index";

assert.equal(
	resolveDescription({ "zh-TW": "使用者確認", en: "Ask user" }),
	"使用者確認",
);
assert.equal(resolveDescription("LSP / ast-grep"), "LSP / ast-grep");
assert.equal(resolveDescription("   "), "未提供描述");
assert.equal(resolveDescription(undefined), "未提供描述");

const discoveredWithoutDescription = inventoryItemFromUnmanaged(
	{
		key: "package:missing",
		id: "missing-description",
		label: "Missing Description",
		scope: "global",
		kind: "package",
		source: "missing-description",
	},
	undefined,
);
assert.equal(discoveredWithoutDescription.description, undefined);
assert.equal(
	resolveDescription(discoveredWithoutDescription.description),
	"未提供描述",
);

const discoveredWithDescription = inventoryItemFromUnmanaged(
	{
		key: "package:described",
		id: "described",
		label: "Described",
		scope: "global",
		kind: "package",
		source: "described",
		description: { "zh-TW": "已描述" },
	},
	undefined,
);
assert.deepEqual(discoveredWithDescription.description, { "zh-TW": "已描述" });

const inventory: Inventory = {
	skills: [
		{
			id: "using-superpowers",
			label: "Using Superpowers",
			path: "/tmp/using-superpowers/SKILL.md",
		},
		{
			id: "brainstorming",
			label: "Brainstorming",
			path: "/tmp/brainstorming/SKILL.md",
		},
	],
};

const usingSuperpowers = inventory.skills?.[0];
if (!usingSuperpowers) throw new Error("missing using-superpowers fixture");
const inferred = inferSkillReferencesFromContent(
	usingSuperpowers,
	"When ideating, Invoke brainstorming skill first.",
	inventory.skills ?? [],
);
assert.equal(inferred, 1);
assert.deepEqual(usingSuperpowers.references?.skills, ["brainstorming"]);

const state: EnabledState = {
	extensions: new Set(),
	skills: new Set(["using-superpowers"]),
	prompts: new Set(),
	themes: new Set(),
};
const dangling = computeDanglingEdges(
	buildInventoryReferenceGraph(inventory),
	state,
);
assert.equal(dangling.length, 1);
assert.equal(dangling[0]?.kind, "references");
assert.equal(dangling[0]?.source.id, "using-superpowers");
assert.equal(dangling[0]?.target.id, "brainstorming");

const list = renderTextList(inventory, state);
assert.match(
	list,
	/Using Superpowers ⚠ references disabled skill: Brainstorming/,
);
assert.equal(
	formatStackFooter(16, 18, 1, dangling.length),
	"stack: 16/18 (1 unmanaged, 1 dangling)",
);

const warningInventory: Inventory = {
	extensions: [
		{ id: "pkg-a", label: "Pkg A" },
		{ id: "pkg-b", label: "Pkg B" },
	],
	skills: [
		{ id: "skill-a", label: "Skill A", source: "pkg-a" },
		{ id: "skill-b", label: "Skill B", source: "pkg-b" },
		{ id: "skill-c", label: "Skill C" },
	],
};
const warningState: EnabledState = {
	extensions: new Set(["pkg-b"]),
	skills: new Set(["skill-a", "skill-b"]),
	prompts: new Set(),
	themes: new Set(),
};
const warningRowIds = computeWarningParentRowIds(
	warningInventory,
	warningState,
);
assert.deepEqual([...warningRowIds], ["parent:skills:pkg-a"]);

assert.equal(
	formatStackFooter(16, 18, 0, 0, { enabled: 2, disabled: 1 }),
	"stack: 16/18 (applied +2 −1)",
);
