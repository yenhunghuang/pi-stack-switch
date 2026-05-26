/**
 * pi-stack-switch (multi-select mode)
 * ============================================================================
 *
 * `/stack` opens a SettingsList-based toggle UI for extension stack resources.
 * It uses inventory.json for the visible checklist, then persists toggles to
 * pi's current settings schema:
 * - package entries: package resource filters (`extensions`, `skills`, ...)
 * - top-level/local entries: `+path` / `-path` patterns
 *
 * This intentionally mirrors `pi config` storage instead of keeping a temporary
 * session baseline. Settings are the source of truth; reload happens once after
 * the selector closes.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
	Container,
	type SettingItem,
	SettingsList,
	Text,
} from "@mariozechner/pi-tui";

const GLOBAL_PI_DIR = join(homedir(), ".pi", "agent");
const STATUS_KEY = "stack-switch";
const SELF_IDS = ["pi-stack-switch", "@your-org/pi-stack-switch"];

type ResourceType = "extensions" | "skills" | "prompts" | "themes";

interface PackageFilter {
	source: string;
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
	[key: string]: unknown;
}

type PackageSpec = string | PackageFilter;

interface InventoryItem {
	/** Package source/name, local path, or resource pattern managed by /stack. */
	id: string;
	/** UI label. */
	label: string;
	description?: string;
	category?: string;
	/** Optional explicit package source/path when id is only a short display id. */
	source?: string;
	/** Optional resource path relative to package root or top-level .pi/agent dir. */
	path?: string;
}

interface Inventory {
	extensions?: InventoryItem[];
	skills?: InventoryItem[];
	prompts?: InventoryItem[];
	themes?: InventoryItem[];
}

interface PiSettings {
	packages?: PackageSpec[];
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
	[key: string]: unknown;
}

interface LoadedSettings {
	globalPath: string;
	projectPath: string;
	global: PiSettings;
	project: PiSettings;
}

interface LoadedInventory {
	path: string;
	scope: "project" | "global";
	inventory: Inventory;
}

interface EnabledState {
	extensions: Set<string>;
	skills: Set<string>;
	prompts: Set<string>;
	themes: Set<string>;
}

interface ToggleResult {
	matched: string[];
	fallbackScope?: "project" | "global";
	blocked?: string;
}

interface UnmanagedExtension {
	key: string;
	id: string;
	label: string;
	scope: "project" | "global";
	kind: "package" | "top-level";
	source?: string;
	path?: string;
}

function projectPiDir(cwd: string): string {
	return join(cwd, ".pi");
}

function settingsPaths(cwd: string) {
	return {
		globalPath: join(GLOBAL_PI_DIR, "settings.json"),
		projectPath: join(projectPiDir(cwd), "settings.json"),
	};
}

function inventoryCandidates(cwd: string) {
	return [
		{
			path: join(projectPiDir(cwd), "inventory.json"),
			scope: "project" as const,
		},
		{ path: join(GLOBAL_PI_DIR, "inventory.json"), scope: "global" as const },
	];
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}

async function readJsonSafe<T>(path: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await fs.readFile(path, "utf-8")) as T;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
		throw err;
	}
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
	await fs.mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.tmp`;
	await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
	await fs.rename(tmp, path);
}

async function loadSettings(cwd: string): Promise<LoadedSettings> {
	const paths = settingsPaths(cwd);
	return {
		...paths,
		global: await readJsonSafe<PiSettings>(paths.globalPath, {}),
		project: await readJsonSafe<PiSettings>(paths.projectPath, {}),
	};
}

async function findInventory(cwd: string): Promise<LoadedInventory | null> {
	for (const candidate of inventoryCandidates(cwd)) {
		if (!(await pathExists(candidate.path))) continue;
		return {
			...candidate,
			inventory: await readJsonSafe<Inventory>(candidate.path, {}),
		};
	}
	return null;
}

async function loadInventory(
	ctx: ExtensionCommandContext,
): Promise<LoadedInventory | null> {
	try {
		const loaded = await findInventory(ctx.cwd);
		if (loaded) return loaded;
	} catch (err) {
		ctx.ui.notify(
			`Failed to parse inventory.json: ${(err as Error).message}`,
			"error",
		);
		return null;
	}

	ctx.ui.notify(
		[
			"No inventory.json found. Create one at:",
			`  ${join(projectPiDir(ctx.cwd), "inventory.json")} (project)`,
			`  ${join(GLOBAL_PI_DIR, "inventory.json")} (global)`,
			"",
			"Use pi-stack-switch/inventory.json.example as a template.",
		].join("\n"),
		"warning",
	);
	return null;
}

async function loadOrCreateInventory(
	ctx: ExtensionCommandContext,
): Promise<LoadedInventory | null> {
	try {
		const loaded = await findInventory(ctx.cwd);
		if (loaded) return loaded;
	} catch (err) {
		ctx.ui.notify(
			`Failed to parse inventory.json: ${(err as Error).message}`,
			"error",
		);
		return null;
	}

	const path = join(projectPiDir(ctx.cwd), "inventory.json");
	const inventory: Inventory = { extensions: [], skills: [], prompts: [] };
	try {
		await writeJsonAtomic(path, inventory);
		return { path, scope: "project", inventory };
	} catch (err) {
		ctx.ui.notify(
			`Failed to create inventory.json at ${path}: ${(err as Error).message}`,
			"error",
		);
		return null;
	}
}

function packageSource(pkg: PackageSpec): string {
	return typeof pkg === "string" ? pkg : pkg.source;
}

function npmPackageName(source: string): string | undefined {
	if (!source.startsWith("npm:")) return undefined;
	const spec = source.slice("npm:".length);
	const scoped = spec.match(/^(@[^/]+\/[^@]+)(?:@.+)?$/);
	if (scoped?.[1]) return scoped[1];
	const unscoped = spec.match(/^([^@]+)(?:@.+)?$/);
	return unscoped?.[1];
}

function withoutGitSuffix(value: string): string {
	return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function withoutRef(value: string): string {
	const at = value.lastIndexOf("@");
	if (at <= 0) return value;
	if (value.startsWith("npm:@")) return value;
	return value.slice(0, at);
}

function packageMatchCandidates(source: string): Set<string> {
	const candidates = new Set<string>([source]);
	const npmName = npmPackageName(source);
	if (npmName) {
		candidates.add(npmName);
		candidates.add(`npm:${npmName}`);
		candidates.add(basename(npmName));
	}

	const sourceWithoutRef = withoutRef(source);
	const tail = withoutGitSuffix(basename(sourceWithoutRef));
	if (tail) candidates.add(tail);
	return candidates;
}

function isPathLike(value: string): boolean {
	return (
		value.startsWith("./") ||
		value.startsWith("../") ||
		value.startsWith("/") ||
		value.startsWith("~")
	);
}

function resolveFromBase(value: string, baseDir: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	if (value.startsWith("~")) return join(homedir(), value.slice(1));
	return resolve(baseDir, value);
}

function packageMatches(
	source: string,
	requested: string,
	baseDir: string,
): boolean {
	const normalized = requested.trim();
	if (!normalized) return false;
	if (packageMatchCandidates(source).has(normalized)) return true;
	if (isPathLike(normalized) || isPathLike(source)) {
		return (
			resolveFromBase(normalized, baseDir) === resolveFromBase(source, baseDir)
		);
	}
	return false;
}

function isOverridePattern(value: string): boolean {
	return (
		value.startsWith("+") || value.startsWith("-") || value.startsWith("!")
	);
}

function scopeBaseDir(cwd: string, scope: "project" | "global"): string {
	return scope === "project" ? projectPiDir(cwd) : GLOBAL_PI_DIR;
}

function sourceLooksSelf(source: string): boolean {
	return SELF_IDS.some(
		(self) =>
			packageMatchCandidates(source).has(self) || source.endsWith(`/${self}`),
	);
}

function defaultIdForSource(source: string): string {
	const npmName = npmPackageName(source);
	if (npmName) return npmName;
	const tail = withoutGitSuffix(basename(withoutRef(source)));
	return tail || source;
}

function defaultLabelForId(id: string): string {
	return id
		.split(/[/_-]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function packageIdentity(
	source: string,
	cwd: string,
	scope: "project" | "global",
): string {
	const npmName = npmPackageName(source);
	if (npmName) return `npm:${npmName}`;
	if (isPathLike(source)) {
		return `local:${resolveFromBase(source, scopeBaseDir(cwd, scope))}`;
	}
	return withoutGitSuffix(withoutRef(source));
}

function itemMatchValues(item: InventoryItem): string[] {
	return [item.id, item.source].filter(
		(value): value is string => typeof value === "string" && value.length > 0,
	);
}

function packageMatchesItem(
	pkg: PackageSpec,
	item: InventoryItem,
	baseDir: string,
): boolean {
	const source = packageSource(pkg);
	return itemMatchValues(item).some((value) =>
		packageMatches(source, value, baseDir),
	);
}

function toPackageFilter(pkg: PackageSpec): PackageFilter {
	return typeof pkg === "string" ? { source: pkg } : { ...pkg };
}

function simplifyPackageFilter(pkg: PackageFilter): PackageSpec {
	const hasResourceFilters = (
		["extensions", "skills", "prompts", "themes"] as const
	).some((key) => pkg[key] !== undefined);
	const hasExtraKeys = Object.keys(pkg).some(
		(key) =>
			!["source", "extensions", "skills", "prompts", "themes"].includes(key),
	);
	return hasResourceFilters || hasExtraKeys ? pkg : pkg.source;
}

function stripPatternPrefix(pattern: string): string {
	return pattern.startsWith("+") ||
		pattern.startsWith("-") ||
		pattern.startsWith("!")
		? pattern.slice(1)
		: pattern;
}

function itemResourcePattern(item: InventoryItem): string {
	return stripPatternPrefix(item.path ?? item.source ?? item.id);
}

function resourceMatchValues(item: InventoryItem): string[] {
	return Array.from(
		new Set([...itemMatchValues(item), itemResourcePattern(item)]),
	);
}

function setPackageResourceEnabled(
	pkg: PackageSpec,
	resourceType: ResourceType,
	item: InventoryItem,
	enabled: boolean,
): PackageSpec {
	const next = toPackageFilter(pkg);
	if (item.path) {
		const target = itemResourcePattern(item);
		const current = next[resourceType] ?? [];
		const updated = current.filter(
			(pattern) => stripPatternPrefix(pattern) !== target,
		);
		updated.push(`${enabled ? "+" : "-"}${target}`);
		next[resourceType] = updated;
		return simplifyPackageFilter(next);
	}

	if (enabled) {
		delete next[resourceType];
	} else {
		next[resourceType] = [];
	}
	return simplifyPackageFilter(next);
}

function packagePathEnabled(patterns: string[], path: string): boolean {
	const includes = patterns.filter(
		(pattern) =>
			!pattern.startsWith("+") &&
			!pattern.startsWith("-") &&
			!pattern.startsWith("!"),
	);
	let enabled = includes.length === 0 || includes.includes(path);
	for (const pattern of patterns) {
		if (stripPatternPrefix(pattern) !== path) continue;
		if (pattern.startsWith("-") || pattern.startsWith("!")) enabled = false;
		else enabled = true;
	}
	return enabled;
}

function packageResourceEnabled(
	pkg: PackageSpec,
	resourceType: ResourceType,
	item: InventoryItem,
): boolean {
	if (typeof pkg === "string") return true;
	const filter = pkg[resourceType];
	if (filter === undefined) return true;
	if (filter.length === 0) return false;
	if (item.path) return packagePathEnabled(filter, itemResourcePattern(item));
	return filter.some(
		(pattern) => !pattern.startsWith("-") && !pattern.startsWith("!"),
	);
}

function topLevelResourceEnabled(
	settings: PiSettings,
	resourceType: ResourceType,
	item: InventoryItem,
): boolean | undefined {
	const patterns = settings[resourceType];
	if (!patterns) return undefined;
	for (let i = patterns.length - 1; i >= 0; i--) {
		const pattern = patterns[i];
		if (!pattern) continue;
		const stripped = stripPatternPrefix(pattern);
		if (!resourceMatchValues(item).includes(stripped)) continue;
		return !pattern.startsWith("-") && !pattern.startsWith("!");
	}
	return undefined;
}

function setTopLevelResourceEnabled(
	settings: PiSettings,
	resourceType: ResourceType,
	item: InventoryItem,
	enabled: boolean,
): PiSettings {
	const next = structuredClone(settings);
	const target = itemResourcePattern(item);
	const current = next[resourceType] ?? [];
	const updated = current.filter(
		(entry) => stripPatternPrefix(entry) !== target,
	);
	updated.push(`${enabled ? "+" : "-"}${target}`);
	next[resourceType] = updated;
	return next;
}

function isSelfItem(item: InventoryItem): boolean {
	return itemMatchValues(item).some((value) =>
		SELF_IDS.some((self) => value === self || value.endsWith(`/${self}`)),
	);
}

function readItemEnabled(
	cwd: string,
	settings: LoadedSettings,
	resourceType: ResourceType,
	item: InventoryItem,
): boolean {
	const projectPackage = settings.project.packages?.find((pkg) =>
		packageMatchesItem(pkg, item, projectPiDir(cwd)),
	);
	if (projectPackage)
		return packageResourceEnabled(projectPackage, resourceType, item);

	const globalPackage = settings.global.packages?.find((pkg) =>
		packageMatchesItem(pkg, item, GLOBAL_PI_DIR),
	);
	if (globalPackage)
		return packageResourceEnabled(globalPackage, resourceType, item);

	const projectTopLevel = topLevelResourceEnabled(
		settings.project,
		resourceType,
		item,
	);
	if (projectTopLevel !== undefined) return projectTopLevel;
	const globalTopLevel = topLevelResourceEnabled(
		settings.global,
		resourceType,
		item,
	);
	if (globalTopLevel !== undefined) return globalTopLevel;
	return true;
}

async function readEnabled(
	cwd: string,
	inventory: Inventory,
): Promise<EnabledState> {
	const settings = await loadSettings(cwd);
	const state: EnabledState = {
		extensions: new Set<string>(),
		skills: new Set<string>(),
		prompts: new Set<string>(),
		themes: new Set<string>(),
	};

	for (const resourceType of [
		"extensions",
		"skills",
		"prompts",
		"themes",
	] as const) {
		for (const item of inventory[resourceType] ?? []) {
			if (readItemEnabled(cwd, settings, resourceType, item)) {
				state[resourceType].add(item.id);
			}
		}
	}
	return state;
}

function inventoryManagesPackage(
	inventory: Inventory,
	source: string,
	baseDir: string,
): boolean {
	return (inventory.extensions ?? []).some((item) =>
		itemMatchValues(item).some((value) =>
			packageMatches(source, value, baseDir),
		),
	);
}

function inventoryManagesTopLevelExtension(
	inventory: Inventory,
	extensionPath: string,
): boolean {
	return (inventory.extensions ?? []).some((item) =>
		resourceMatchValues(item).includes(extensionPath),
	);
}

function collectUnmanagedFromPackageList(
	cwd: string,
	inventory: Inventory,
	packages: PackageSpec[] | undefined,
	scope: "project" | "global",
): UnmanagedExtension[] {
	const entries: UnmanagedExtension[] = [];
	const baseDir = scopeBaseDir(cwd, scope);
	for (const pkg of packages ?? []) {
		const source = packageSource(pkg);
		if (sourceLooksSelf(source)) continue;
		if (inventoryManagesPackage(inventory, source, baseDir)) continue;
		const id = defaultIdForSource(source);
		entries.push({
			key: `package:${packageIdentity(source, cwd, scope)}`,
			id,
			label: defaultLabelForId(id),
			scope,
			kind: "package",
			source,
		});
	}
	return entries;
}

function collectUnmanagedFromTopLevelExtensions(
	inventory: Inventory,
	extensions: string[] | undefined,
	scope: "project" | "global",
): UnmanagedExtension[] {
	const entries: UnmanagedExtension[] = [];
	for (const extensionPath of extensions ?? []) {
		if (isOverridePattern(extensionPath)) continue;
		if (sourceLooksSelf(extensionPath)) continue;
		if (inventoryManagesTopLevelExtension(inventory, extensionPath)) continue;
		const id = defaultIdForSource(extensionPath);
		entries.push({
			key: `top-level:${scope}:${extensionPath}`,
			id,
			label: defaultLabelForId(id),
			scope,
			kind: "top-level",
			source: extensionPath,
		});
	}
	return entries;
}

async function discoverUnmanaged(
	cwd: string,
	inventory: Inventory,
): Promise<UnmanagedExtension[]> {
	const settings = await loadSettings(cwd);
	const discovered = [
		...collectUnmanagedFromPackageList(
			cwd,
			inventory,
			settings.project.packages,
			"project",
		),
		...collectUnmanagedFromPackageList(
			cwd,
			inventory,
			settings.global.packages,
			"global",
		),
		...collectUnmanagedFromTopLevelExtensions(
			inventory,
			settings.project.extensions,
			"project",
		),
		...collectUnmanagedFromTopLevelExtensions(
			inventory,
			settings.global.extensions,
			"global",
		),
	];
	const seen = new Set<string>();
	return discovered.filter((entry) => {
		if (seen.has(entry.key)) return false;
		seen.add(entry.key);
		return true;
	});
}

function applyToggleToPackageList(
	packages: PackageSpec[] | undefined,
	resourceType: ResourceType,
	item: InventoryItem,
	enabled: boolean,
	baseDir: string,
): { packages: PackageSpec[] | undefined; matched: string[] } {
	if (!packages) return { packages, matched: [] };
	const matched: string[] = [];
	const next = packages.map((pkg) => {
		if (!packageMatchesItem(pkg, item, baseDir)) return pkg;
		matched.push(packageSource(pkg));
		return setPackageResourceEnabled(pkg, resourceType, item, enabled);
	});
	return { packages: next, matched };
}

async function applyToggle(
	cwd: string,
	inventoryScope: "project" | "global",
	resourceType: ResourceType,
	item: InventoryItem,
	enabled: boolean,
): Promise<ToggleResult> {
	if (!enabled && isSelfItem(item)) {
		return { matched: [], blocked: "pi-stack-switch cannot disable itself." };
	}

	const loaded = await loadSettings(cwd);
	const globalResult = applyToggleToPackageList(
		loaded.global.packages,
		resourceType,
		item,
		enabled,
		GLOBAL_PI_DIR,
	);
	const projectResult = applyToggleToPackageList(
		loaded.project.packages,
		resourceType,
		item,
		enabled,
		projectPiDir(cwd),
	);

	const matched = Array.from(
		new Set([...projectResult.matched, ...globalResult.matched]),
	);

	if (matched.length > 0) {
		loaded.global.packages = globalResult.packages;
		loaded.project.packages = projectResult.packages;
		await writeJsonAtomic(loaded.globalPath, loaded.global);
		await writeJsonAtomic(loaded.projectPath, loaded.project);
		return { matched };
	}

	if (inventoryScope === "project") {
		await writeJsonAtomic(
			loaded.projectPath,
			setTopLevelResourceEnabled(loaded.project, resourceType, item, enabled),
		);
	} else {
		await writeJsonAtomic(
			loaded.globalPath,
			setTopLevelResourceEnabled(loaded.global, resourceType, item, enabled),
		);
	}

	return { matched, fallbackScope: inventoryScope };
}

function buildSettingItems(
	inventory: Inventory,
	state: EnabledState,
): {
	items: SettingItem[];
	meta: Map<string, { resourceType: ResourceType; item: InventoryItem }>;
	childrenByParent: Map<string, Array<{ resourceType: ResourceType; item: InventoryItem }>>;
} {
	const items: SettingItem[] = [];
	const meta = new Map<
		string,
		{ resourceType: ResourceType; item: InventoryItem }
	>();

	const extensions = inventory.extensions ?? [];
	const childrenByParent = new Map<string, Array<{ resourceType: ResourceType; item: InventoryItem }>>();
	const orphans: Array<{ resourceType: ResourceType; item: InventoryItem }> = [];

	// Initialize children container for each extension
	for (const ext of extensions) {
		childrenByParent.set(ext.id, []);
	}

	// Classify child resources under their parents, or mark as orphans
	for (const resourceType of ["skills", "prompts", "themes"] as const) {
		const list = inventory[resourceType] ?? [];
		for (const item of list) {
			let foundParent = false;
			if (item.source) {
				const parent = extensions.find(
					(ext) => ext.id === item.source || ext.source === item.source,
				);
				if (parent) {
					childrenByParent.get(parent.id)!.push({ resourceType, item });
					foundParent = true;
				}
			}
			if (!foundParent) {
				orphans.push({ resourceType, item });
			}
		}
	}

	const addItem = (
		resourceType: ResourceType,
		item: InventoryItem,
		parentItem?: InventoryItem,
		treePrefix?: string,
	) => {
		const settingId = `${resourceType}:${item.id}`;
		const prefix = item.category ? `[${item.category}] ` : "";

		let label = "";
		if (parentItem) {
			const isParentOn = state.extensions.has(parentItem.id);
			const parentWarning = isParentOn ? "" : ` (⚠️ Requires ${parentItem.label})`;
			label = `${treePrefix || "  ↳ "}${prefix}${item.label}${parentWarning}${item.description ? ` — ${item.description}` : ""}`;
		} else {
			label = `${prefix}${item.label}${item.description ? ` — ${item.description}` : ""}`;
		}

		items.push({
			id: settingId,
			label,
			currentValue: state[resourceType].has(item.id) ? "on" : "off",
			values: ["on", "off"],
		});
		meta.set(settingId, { resourceType, item });
	};

	const allCreatedItems: SettingItem[] = [];

	const generateItem = (
		resourceType: ResourceType,
		item: InventoryItem,
		parentItem?: InventoryItem,
		treePrefix?: string,
	) => {
		const settingId = `${resourceType}:${item.id}`;
		const prefix = item.category ? `[${item.category}] ` : "";

		let label = "";
		if (parentItem) {
			const isParentOn = state.extensions.has(parentItem.id);
			const parentWarning = isParentOn ? "" : ` (⚠️ Requires ${parentItem.label})`;
			label = `${treePrefix || "  ↳ "}${prefix}${item.label}${parentWarning}${item.description ? ` — ${item.description}` : ""}`;
		} else {
			label = `${prefix}${item.label}${item.description ? ` — ${item.description}` : ""}`;
		}

		allCreatedItems.push({
			id: settingId,
			label,
			currentValue: state[resourceType].has(item.id) ? "on" : "off",
			values: ["on", "off"],
		});
		meta.set(settingId, { resourceType, item });
	};

	// 1. Generate Extensions only (hide children for simplified view)
	for (const ext of extensions) {
		generateItem("extensions", ext);
	}

	// 2. Generate Orphan items
	for (const { resourceType, item } of orphans) {
		generateItem(resourceType, item);
	}

	// 依狀態分流（Enabled 啟用在上，Disabled 未啟用在下）
	const enabledList = allCreatedItems.filter(x => x.currentValue === "on");
	const disabledList = allCreatedItems.filter(x => x.currentValue === "off");

	// 兩堆各自依 label 字母排序 (忽略大小寫與中英文順序)
	enabledList.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
	disabledList.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

	// 組合 items，並在啟用與未啟用中間插入明顯的分隔線
	items.push(...enabledList);

	if (enabledList.length > 0 && disabledList.length > 0) {
		items.push({
			id: "separator:line",
			label: "─── [ 已啟用 / Enabled ] ────────────────────────────── [ 未啟用 / Disabled ] ───",
			currentValue: "",
			values: [],
		});
	}

	items.push(...disabledList);

	return { items, meta, childrenByParent };
}

async function openSelector(
	ctx: ExtensionCommandContext,
	loadedInventory: LoadedInventory,
): Promise<{ toggles: number; blocked: string[]; fallbackWrites: string[] }> {
	const initial = await readEnabled(ctx.cwd, loadedInventory.inventory);
	const { items, meta, childrenByParent } = buildSettingItems(loadedInventory.inventory, initial);

	if (!items.length) {
		ctx.ui.notify("inventory.json is empty.", "warning");
		return { toggles: 0, blocked: [], fallbackWrites: [] };
	}

	let toggles = 0;
	const blocked: string[] = [];
	const fallbackWrites: string[] = [];
	const writeErrors: Error[] = [];
	let writeQueue = Promise.resolve();

	await ctx.ui.custom<undefined>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(
			new Text(theme.fg("accent", theme.bold("Extension Stack")), 1, 1),
		);
		container.addChild(
			new Text(
				theme.fg("muted", "↑↓ navigate · ←→ toggle · / search · Esc close"),
				1,
				0,
			),
		);

		const baseTheme = getSettingsListTheme();
		const customSettingsTheme = {
			...baseTheme,
			value: (text: string, selected: boolean) => {
				if (text === "") {
					return "";
				}
				if (text === "on") {
					const onText = "● ON";
					return selected
						? theme.bold(theme.fg("success", onText))
						: theme.fg("success", onText);
				} else {
					const offText = "○ OFF";
					return selected
						? theme.bold(theme.fg("muted", offText))
						: theme.fg("muted", offText);
				}
			}
		};

		const list = new SettingsList(
			items,
			Math.min(items.length + 2, 18),
			customSettingsTheme,
			(settingId, newValue) => {
				const m = meta.get(settingId);
				if (!m) return;
				toggles++;
				writeQueue = writeQueue
					.then(async () => {
						const result = await applyToggle(
							ctx.cwd,
							loadedInventory.scope,
							m.resourceType,
							m.item,
							newValue === "on",
						);
						if (result.blocked) blocked.push(result.blocked);
						if (result.fallbackScope) {
							fallbackWrites.push(`${m.item.id} (${result.fallbackScope})`);
						}

						// 父子綁定開關：若 toggle 的是 parent extension，則對其下所有子項目做相同狀態切換
						if (m.resourceType === "extensions") {
							const children = childrenByParent.get(m.item.id) ?? [];
							for (const child of children) {
								const childResult = await applyToggle(
									ctx.cwd,
									loadedInventory.scope,
									child.resourceType,
									child.item,
									newValue === "on",
								);
								if (childResult.blocked) blocked.push(childResult.blocked);
							}
						}
					})
					.catch((err: Error) => {
						writeErrors.push(err);
					});
			},
			() => done(undefined),
			{ enableSearch: true },
		);
		container.addChild(list);

		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});

	await writeQueue;
	const firstWriteError = writeErrors[0];
	if (firstWriteError) {
		ctx.ui.notify(
			`Some toggles failed to persist: ${firstWriteError.message}`,
			"error",
		);
	}

	return { toggles, blocked: Array.from(new Set(blocked)), fallbackWrites };
}

async function computeFooter(
	cwd: string,
	inventory: Inventory,
): Promise<string> {
	const [state, unmanaged] = await Promise.all([
		readEnabled(cwd, inventory),
		discoverUnmanaged(cwd, inventory),
	]);
	const total = (["extensions", "skills", "prompts", "themes"] as const).reduce(
		(sum, resourceType) => sum + (inventory[resourceType]?.length ?? 0),
		0,
	);
	const enabled =
		state.extensions.size +
		state.skills.size +
		state.prompts.size +
		state.themes.size;
	const suffix = unmanaged.length ? ` (${unmanaged.length} unmanaged)` : "";
	return `stack: ${enabled}/${total}${suffix}`;
}

function renderTextList(inventory: Inventory, state: EnabledState): string {
	const lines: string[] = [];
	const renderSection = (title: string, resourceType: ResourceType) => {
		const items = inventory[resourceType];
		if (!items?.length) return;
		lines.push(`\n${title}:`);
		for (const item of items) {
			const on = state[resourceType].has(item.id);
			const mark = on ? "[✓]" : "[ ]";
			const category = item.category ? ` (${item.category})` : "";
			const desc = item.description ? `\n      ${item.description}` : "";
			lines.push(`  ${mark} ${item.label}${category}${desc}`);
		}
	};

	renderSection("Extensions", "extensions");
	renderSection("Skills", "skills");
	renderSection("Prompts", "prompts");
	renderSection("Themes", "themes");
	return lines.join("\n").trim() || "(empty)";
}

function computeDiff(before: EnabledState, after: EnabledState) {
	const enabled: string[] = [];
	const disabled: string[] = [];
	for (const resourceType of [
		"extensions",
		"skills",
		"prompts",
		"themes",
	] as const) {
		for (const id of after[resourceType]) {
			if (!before[resourceType].has(id)) enabled.push(id);
		}
		for (const id of before[resourceType]) {
			if (!after[resourceType].has(id)) disabled.push(id);
		}
	}
	return { enabled, disabled };
}

function renderUnmanagedList(unmanaged: UnmanagedExtension[]): string {
	return unmanaged
		.map((entry, index) => {
			const origin =
				entry.kind === "package" ? entry.source : `extensions: ${entry.source}`;
			return `${index + 1}. ${entry.label} (${entry.scope} ${entry.kind})\n   ${origin}`;
		})
		.join("\n");
}

function categoryOptions(inventory: Inventory): string[] {
	const categories = new Set<string>([
		"Universal",
		"Industry",
		"Workflow",
		"Project",
	]);
	for (const resourceType of [
		"extensions",
		"skills",
		"prompts",
		"themes",
	] as const) {
		for (const item of inventory[resourceType] ?? []) {
			if (item.category) categories.add(item.category);
		}
	}
	return [...categories, "Custom…", "(none)"];
}

async function pickCategory(
	ctx: ExtensionCommandContext,
	inventory: Inventory,
	entry: UnmanagedExtension,
): Promise<string | undefined> {
	const choice = await ctx.ui.select(
		`Category for ${entry.label}`,
		categoryOptions(inventory),
	);
	if (!choice || choice === "(none)") return undefined;
	if (choice !== "Custom…") return choice;
	const custom = await ctx.ui.input("Custom category", "Workflow:YourFlow");
	const trimmed = custom?.trim();
	return trimmed || undefined;
}

function inventoryItemFromUnmanaged(
	entry: UnmanagedExtension,
	category: string | undefined,
): InventoryItem {
	const item: InventoryItem = {
		id: entry.id,
		label: entry.label,
		description:
			entry.kind === "package"
				? `Discovered ${entry.scope} package`
				: `Discovered ${entry.scope} extension path`,
	};
	if (category) item.category = category;
	if (entry.source && entry.source !== entry.id) item.source = entry.source;
	if (entry.path) item.path = entry.path;
	return item;
}

async function runDiscover(
	ctx: ExtensionCommandContext,
	loadedInventory: LoadedInventory,
): Promise<void> {
	const unmanaged = await discoverUnmanaged(ctx.cwd, loadedInventory.inventory);
	if (unmanaged.length === 0) {
		ctx.ui.notify("No unmanaged extensions found.", "info");
		return;
	}

	ctx.ui.notify(
		`Unmanaged extensions (${unmanaged.length}):\n${renderUnmanagedList(unmanaged)}`,
		"info",
	);

	let added = 0;
	let skipped = 0;
	loadedInventory.inventory.extensions ??= [];

	for (const entry of unmanaged) {
		const add = await ctx.ui.confirm(
			"Add to /stack inventory?",
			[
				`${entry.label}`,
				`scope: ${entry.scope}`,
				`kind: ${entry.kind}`,
				entry.source ? `source: ${entry.source}` : undefined,
			]
				.filter(Boolean)
				.join("\n"),
		);
		if (!add) {
			skipped++;
			continue;
		}

		const category = await pickCategory(ctx, loadedInventory.inventory, entry);
		loadedInventory.inventory.extensions.push(
			inventoryItemFromUnmanaged(entry, category),
		);
		await writeJsonAtomic(loadedInventory.path, loadedInventory.inventory);
		added++;
	}

	ctx.ui.notify(
		[
			`Discovery complete. Added ${added}, skipped ${skipped}.`,
			`inventory: ${loadedInventory.path}`,
		].join("\n"),
		"info",
	);
	ctx.ui.setStatus(
		STATUS_KEY,
		await computeFooter(ctx.cwd, loadedInventory.inventory),
	);
}

export default function piStackSwitch(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		try {
			let inventoryPath: string | undefined;
			for (const candidate of inventoryCandidates(ctx.cwd)) {
				if (await pathExists(candidate.path)) {
					inventoryPath = candidate.path;
					break;
				}
			}
			if (!inventoryPath) {
				const unmanaged = await discoverUnmanaged(ctx.cwd, {});
				ctx.ui.setStatus(
					STATUS_KEY,
					`stack: no inventory${unmanaged.length ? ` (${unmanaged.length} unmanaged)` : ""}`,
				);
				return;
			}
			const inventory = await readJsonSafe<Inventory>(inventoryPath, {});
			ctx.ui.setStatus(STATUS_KEY, await computeFooter(ctx.cwd, inventory));
		} catch (err) {
			ctx.ui.notify(
				`stack-switch init failed: ${(err as Error).message}`,
				"warning",
			);
		}
	});

	pi.registerCommand("stack", {
		description: "Toggle extension stack resources",
		handler: async (args, ctx) => {
			const arg = args.trim();

			if (arg === "discover") {
				const loadedInventory = await loadOrCreateInventory(ctx);
				if (!loadedInventory) return;
				await runDiscover(ctx, loadedInventory);
				return;
			}

			const loadedInventory = await loadInventory(ctx);
			if (!loadedInventory) return;
			const { inventory } = loadedInventory;

			if (arg === "list" || arg === "ls" || arg === "current" || arg === "?") {
				const state = await readEnabled(ctx.cwd, inventory);
				ctx.ui.notify(
					[
						`Stack inventory (${loadedInventory.scope}: ${loadedInventory.path})`,
						renderTextList(inventory, state),
					].join("\n"),
					"info",
				);
				return;
			}

			if (arg === "restore" || arg === "reset") {
				ctx.ui.notify(
					"/stack is persistent multi-select now. Re-open /stack and toggle items back on/off.",
					"info",
				);
				return;
			}

			if (arg.length > 0) {
				ctx.ui.notify(
					`Unknown /stack argument "${arg}". Use /stack or /stack list.`,
					"warning",
				);
				return;
			}

			const before = await readEnabled(ctx.cwd, inventory);
			const { toggles, blocked, fallbackWrites } = await openSelector(
				ctx,
				loadedInventory,
			);
			const after = await readEnabled(ctx.cwd, inventory);
			const diff = computeDiff(before, after);

			if (!toggles) {
				ctx.ui.notify("No effective changes.", "info");
				return;
			}

			if (diff.enabled.length === 0 && diff.disabled.length === 0) {
				ctx.ui.notify(
					[
						"No effective changes.",
						blocked.length ? `  blocked: ${blocked.join(", ")}` : undefined,
					]
						.filter(Boolean)
						.join("\n"),
					"info",
				);
				return;
			}

			const summary = [
				`${toggles} toggle${toggles > 1 ? "s" : ""}, applying…`,
				diff.enabled.length
					? `  enabled: ${diff.enabled.join(", ")}`
					: undefined,
				diff.disabled.length
					? `  disabled: ${diff.disabled.join(", ")}`
					: undefined,
				blocked.length ? `  blocked: ${blocked.join(", ")}` : undefined,
				fallbackWrites.length
					? `  top-level patterns written for: ${fallbackWrites.join(", ")}`
					: undefined,
			]
				.filter(Boolean)
				.join("\n");
			ctx.ui.notify(summary, "info");
			ctx.ui.setStatus(STATUS_KEY, await computeFooter(ctx.cwd, inventory));

			await new Promise((resolveDone) => setTimeout(resolveDone, 80));
			await ctx.reload();
			return;
		},
	});

	pi.registerShortcut("ctrl+s", {
		description: "Open extension stack toggle",
		handler: async () => {
			pi.sendUserMessage("/stack", { deliverAs: "followUp" });
		},
	});
}
