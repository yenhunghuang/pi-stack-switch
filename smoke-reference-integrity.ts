import assert from "node:assert/strict";
import {
	buildInventoryReferenceGraph,
	computeDanglingEdges,
	computeWarningParentRowIds,
	type EnabledState,
	formatStackFooter,
	type Inventory,
	inferSkillReferencesFromContent,
	renderTextList,
} from "./index";

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
assert.ok(usingSuperpowers);
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
