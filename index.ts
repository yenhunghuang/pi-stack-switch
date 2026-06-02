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
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	Theme,
} from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
	Container,
	Input,
	matchesKey,
	type SettingItem,
	SettingsList,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

const GLOBAL_PI_DIR = join(homedir(), ".pi", "agent");
const STATUS_KEY = "stack-switch";
const SELF_IDS = ["pi-stack-switch", "@your-org/pi-stack-switch"];

type ResourceType = "extensions" | "skills" | "prompts" | "themes";
type ChildResourceType = Exclude<ResourceType, "extensions">;
type ResourceReferenceGroups = Partial<Record<ResourceType, string[]>>;
type ReferenceEdgeKind = "references" | "dependsOn";

const TABS = [
	{ type: "extensions", label: "Extensions", shortcut: "1" },
	{ type: "skills", label: "Skills", shortcut: "2" },
	{ type: "prompts", label: "Prompts", shortcut: "3" },
	{ type: "themes", label: "Themes", shortcut: "4" },
] as const;

type TabType = (typeof TABS)[number]["type"];

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
	/** Optional soft references to other resources grouped by target resource type. */
	references?: ResourceReferenceGroups;
	/** Optional hard dependencies on other resources grouped by target resource type. */
	dependsOn?: ResourceReferenceGroups;
	/** Optional code resources that should be toggled together with this item. */
	associatedResources?: {
		extensions?: string[];
	};
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

interface InventoryReferenceEdge {
	kind: ReferenceEdgeKind;
	sourceResourceType: ResourceType;
	targetResourceType: ResourceType;
	source: InventoryItem;
	target: InventoryItem;
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

function normalizePackageResourcePath(pattern: string): string {
	const stripped = stripPatternPrefix(pattern.trim());
	return stripped.startsWith("./") ? stripped.slice(2) : stripped;
}

function associatedExtensionPaths(item: InventoryItem): string[] {
	return Array.from(
		new Set(
			(item.associatedResources?.extensions ?? [])
				.map(normalizePackageResourcePath)
				.filter(Boolean),
		),
	);
}

function normalizeReferencePath(value: string): string {
	return packagePath(normalizePackageResourcePath(value)).toLowerCase();
}

function normalizeReferenceLabel(value: string): string {
	return normalizeFeatureToken(value);
}

function uniqueMatch<T>(items: T[]): T | undefined {
	return items.length === 1 ? items[0] : undefined;
}

function resolveReferenceTarget(
	inventory: Inventory,
	targetResourceType: ResourceType,
	target: string,
): InventoryItem | undefined {
	const items = inventory[targetResourceType] ?? [];
	const trimmedTarget = target.trim();
	if (!trimmedTarget) return undefined;

	const idMatch = uniqueMatch(
		items.filter((item) => item.id === trimmedTarget),
	);
	if (idMatch) return idMatch;

	const normalizedPath = normalizeReferencePath(trimmedTarget);
	const pathMatch = uniqueMatch(
		items.filter(
			(item) =>
				item.path !== undefined &&
				normalizeReferencePath(item.path) === normalizedPath,
		),
	);
	if (pathMatch) return pathMatch;

	const normalizedLabel = normalizeReferenceLabel(trimmedTarget);
	return uniqueMatch(
		items.filter(
			(item) => normalizeReferenceLabel(item.label) === normalizedLabel,
		),
	);
}

function referencesForKind(
	item: InventoryItem,
	kind: ReferenceEdgeKind,
): ResourceReferenceGroups | undefined {
	return kind === "references" ? item.references : item.dependsOn;
}

function buildInventoryReferenceGraph(
	inventory: Inventory,
): InventoryReferenceEdge[] {
	const edges: InventoryReferenceEdge[] = [];
	for (const sourceResourceType of [
		"extensions",
		"skills",
		"prompts",
		"themes",
	] as const) {
		for (const source of inventory[sourceResourceType] ?? []) {
			for (const kind of ["references", "dependsOn"] as const) {
				const groups = referencesForKind(source, kind);
				if (!groups) continue;
				for (const targetResourceType of [
					"extensions",
					"skills",
					"prompts",
					"themes",
				] as const) {
					for (const targetRef of groups[targetResourceType] ?? []) {
						const target = resolveReferenceTarget(
							inventory,
							targetResourceType,
							targetRef,
						);
						if (!target) continue;
						edges.push({
							kind,
							sourceResourceType,
							targetResourceType,
							source,
							target,
						});
					}
				}
			}
		}
	}
	return edges;
}

function isItemEnabled(
	state: EnabledState,
	resourceType: ResourceType,
	item: InventoryItem,
): boolean {
	return state[resourceType].has(item.id);
}

function computeDanglingEdges(
	graph: InventoryReferenceEdge[],
	state: EnabledState,
): InventoryReferenceEdge[] {
	return graph.filter(
		(edge) =>
			isItemEnabled(state, edge.sourceResourceType, edge.source) &&
			!isItemEnabled(state, edge.targetResourceType, edge.target),
	);
}

function referenceEdgeKey(edge: InventoryReferenceEdge): string {
	return [
		edge.kind,
		edge.sourceResourceType,
		edge.source.id,
		edge.targetResourceType,
		edge.target.id,
	].join(":");
}

function findNewDanglingEdges(
	graph: InventoryReferenceEdge[],
	before: EnabledState,
	after: EnabledState,
): InventoryReferenceEdge[] {
	const beforeKeys = new Set(
		computeDanglingEdges(graph, before).map(referenceEdgeKey),
	);
	return computeDanglingEdges(graph, after).filter(
		(edge) => !beforeKeys.has(referenceEdgeKey(edge)),
	);
}

function hasAssociatedIndexEntrypoint(item: InventoryItem): boolean {
	return associatedExtensionPaths(item).some(
		(path) => basename(path) === "index.ts",
	);
}

function updateAssociatedExtensionPatterns(
	patterns: string[] | undefined,
	associatedPaths: string[],
	enabled: boolean,
): string[] | undefined {
	let next = patterns ? [...patterns] : patterns;
	const wasExplicitEmpty = patterns !== undefined && patterns.length === 0;

	for (const associatedPath of associatedPaths) {
		if (!associatedPath) continue;

		if (next === undefined) {
			if (!enabled) next = [`-${associatedPath}`];
			continue;
		}

		// `extensions: []` already disables every extension. Do not loosen it while
		// applying a child item's tandem toggle.
		if (next.length === 0) continue;

		if (enabled) {
			next = next.filter((pattern) => {
				if (normalizePackageResourcePath(pattern) !== associatedPath)
					return true;
				return !pattern.startsWith("-") && !pattern.startsWith("!");
			});
			continue;
		}

		next = next.filter(
			(pattern) => normalizePackageResourcePath(pattern) !== associatedPath,
		);
		next.push(`-${associatedPath}`);
	}

	if (next === undefined) return undefined;
	if (wasExplicitEmpty) return [];
	const deduped = Array.from(new Set(next));
	return deduped.length > 0 ? deduped : undefined;
}

function setAssociatedExtensionsEnabled(
	pkg: PackageSpec,
	item: InventoryItem,
	enabled: boolean,
): PackageSpec {
	const associatedPaths = associatedExtensionPaths(item);
	if (associatedPaths.length === 0) return pkg;

	const next = toPackageFilter(pkg);
	const updated = updateAssociatedExtensionPatterns(
		next.extensions,
		associatedPaths,
		enabled,
	);
	if (updated === undefined) {
		delete next.extensions;
	} else {
		next.extensions = updated;
	}
	return simplifyPackageFilter(next);
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
	const includes = patterns
		.filter((pattern) => !pattern.startsWith("-") && !pattern.startsWith("!"))
		.map(stripPatternPrefix);
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

interface ApplyToggleOptions {
	skipAssociatedResources?: boolean;
}

function applyToggleToPackageList(
	packages: PackageSpec[] | undefined,
	resourceType: ResourceType,
	item: InventoryItem,
	enabled: boolean,
	baseDir: string,
	options: ApplyToggleOptions = {},
): { packages: PackageSpec[] | undefined; matched: string[] } {
	if (!packages) return { packages, matched: [] };
	const matched: string[] = [];
	const next = packages.map((pkg) => {
		if (!packageMatchesItem(pkg, item, baseDir)) return pkg;
		matched.push(packageSource(pkg));
		const updated = setPackageResourceEnabled(pkg, resourceType, item, enabled);
		return options.skipAssociatedResources
			? updated
			: setAssociatedExtensionsEnabled(updated, item, enabled);
	});
	return { packages: next, matched };
}

async function applyToggle(
	cwd: string,
	inventoryScope: "project" | "global",
	resourceType: ResourceType,
	item: InventoryItem,
	enabled: boolean,
	options: ApplyToggleOptions = {},
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
		options,
	);
	const projectResult = applyToggleToPackageList(
		loaded.project.packages,
		resourceType,
		item,
		enabled,
		projectPiDir(cwd),
		options,
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

type SettingItemMeta = { resourceType: ResourceType; item: InventoryItem };

interface ParentRowMeta {
	id: string;
	tab: ChildResourceType;
	parentId: string;
	parentItem?: InventoryItem;
}

interface BuiltSettingItems {
	items: SettingItem[];
	meta: Map<string, SettingItemMeta>;
	childrenByParent: Map<string, SettingItemMeta[]>;
	parentRows: Map<string, ParentRowMeta>;
}

interface BuildSettingItemsOptions {
	width?: number;
	foldedParentRows?: ReadonlySet<string>;
	searchActive?: boolean;
}

const STANDALONE_PARENT_ID = "standalone";

function isTreeTab(tab: TabType): tab is ChildResourceType {
	return tab !== "extensions";
}

function parentRowId(tab: ChildResourceType, parentId: string): string {
	return `parent:${tab}:${encodeURIComponent(parentId)}`;
}

function parentExpanded(
	rowId: string,
	foldedParentRows: ReadonlySet<string>,
	searchActive: boolean,
): boolean {
	// Empty fold state means every parent starts folded; selected rows in the set
	// are expanded by user action. Search mode temporarily expands all rows.
	return searchActive || foldedParentRows.has(rowId);
}

function normalizeSearchInput(
	data: string,
	currentQuery: string,
): string | undefined {
	if (currentQuery.length === 0 && data === "/") return undefined;
	if (data.startsWith("\x1b")) return data;
	const hasControlChars = [...data].some((ch) => {
		const code = ch.charCodeAt(0);
		return code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
	});
	if (hasControlChars) return data;
	const normalized = data.replace(/[\\/_-]+/g, "");
	return normalized.length > 0 ? normalized : undefined;
}

function cloneEnabledState(state: EnabledState): EnabledState {
	return {
		extensions: new Set(state.extensions),
		skills: new Set(state.skills),
		prompts: new Set(state.prompts),
		themes: new Set(state.themes),
	};
}

function setEnabledState(
	state: EnabledState,
	resourceType: ResourceType,
	itemId: string,
	enabled: boolean,
): void {
	if (enabled) {
		state[resourceType].add(itemId);
		return;
	}
	state[resourceType].delete(itemId);
}

type SharedEntrypointChoice = "disable-main-extension" | "child-only";

function findParentExtension(
	inventory: Inventory,
	item: InventoryItem,
): InventoryItem | undefined {
	if (!item.source) return undefined;
	return (inventory.extensions ?? []).find(
		(ext) => ext.id === item.source || ext.source === item.source,
	);
}

function parentSourceKeys(
	item: InventoryItem,
	parent: InventoryItem | undefined,
): Set<string> {
	const keys = new Set<string>();
	if (item.source) keys.add(item.source);
	if (parent) {
		keys.add(parent.id);
		if (parent.source) keys.add(parent.source);
	}
	return keys;
}

function enabledSiblingResources(
	inventory: Inventory,
	state: EnabledState,
	meta: SettingItemMeta,
): SettingItemMeta[] {
	const parent = findParentExtension(inventory, meta.item);
	const keys = parentSourceKeys(meta.item, parent);
	if (keys.size === 0) return [];

	const siblings: SettingItemMeta[] = [];
	for (const resourceType of ["skills", "prompts", "themes"] as const) {
		for (const item of inventory[resourceType] ?? []) {
			if (resourceType === meta.resourceType && item.id === meta.item.id) {
				continue;
			}
			if (!item.source || !keys.has(item.source)) continue;
			if (!state[resourceType].has(item.id)) continue;
			siblings.push({ resourceType, item });
		}
	}
	return siblings;
}

function shouldConfirmSharedEntrypointDisable(
	inventory: Inventory,
	state: EnabledState,
	meta: SettingItemMeta,
): boolean {
	if (meta.resourceType === "extensions") return false;
	if (!state[meta.resourceType].has(meta.item.id)) return false;
	if (!hasAssociatedIndexEntrypoint(meta.item)) return false;
	if (!findParentExtension(inventory, meta.item)) return false;
	return enabledSiblingResources(inventory, state, meta).length > 0;
}

function createSharedEntrypointDialog(
	theme: Theme,
	item: InventoryItem,
	parent: InventoryItem,
	siblings: SettingItemMeta[],
	onDone: (choice?: SharedEntrypointChoice) => void,
) {
	let selected = 0;
	const options = [
		{
			choice: "disable-main-extension" as const,
			title: "一併關閉主套件",
			detail: "套件 JS 完全卸載",
		},
		{
			choice: "child-only" as const,
			title: `僅關閉 ${item.label}`,
			detail: "保留程式背景運行",
		},
	];
	const siblingLabels = siblings
		.map((sibling) => sibling.item.label)
		.slice(0, 4)
		.join(", ");

	return {
		render: (width: number) => {
			const lines = [
				theme.fg("warning", theme.bold("⚠ 共享入口 index.ts 依賴警示")),
				`「${item.label}」關聯到 ${parent.label} 的 index.ts。`,
				`仍啟用的兄弟資源：${siblingLabels || "(none)"}`,
				"",
				"請選擇處理方式：",
				...options.map((option, index) => {
					const marker = index === selected ? "›" : " ";
					const line = `${marker} ${index + 1}. ${option.title} — ${option.detail}`;
					return index === selected
						? theme.bg("selectedBg", theme.fg("accent", theme.bold(line)))
						: theme.fg("muted", line);
				}),
				"",
				theme.fg("dim", "↑↓/←→ 選擇 · 1/2 直接選 · Enter 確認 · Esc 取消"),
			];
			return lines.map((line) => truncateToWidth(line, width));
		},
		handleInput: (data: string) => {
			if (
				matchesKey(data, "up") ||
				matchesKey(data, "left") ||
				matchesKey(data, "shift+tab")
			) {
				selected = (selected + options.length - 1) % options.length;
				return;
			}
			if (
				matchesKey(data, "down") ||
				matchesKey(data, "right") ||
				matchesKey(data, "tab")
			) {
				selected = (selected + 1) % options.length;
				return;
			}
			if (matchesKey(data, "1")) {
				onDone(options[0]?.choice);
				return;
			}
			if (matchesKey(data, "2")) {
				onDone(options[1]?.choice);
				return;
			}
			if (matchesKey(data, "enter") || data === " ") {
				onDone(options[selected]?.choice);
				return;
			}
			if (matchesKey(data, "escape")) {
				onDone(undefined);
			}
		},
		invalidate: () => {},
	};
}

type DanglingWarningChoice = "apply" | "cascade";

interface DanglingWarningDecision {
	choice: DanglingWarningChoice;
	sourcesToDisable: SettingItemMeta[];
}

function resourceTypeSingular(resourceType: ResourceType): string {
	return resourceType.slice(0, -1);
}

function edgeDescription(edge: InventoryReferenceEdge): string {
	const verb = edge.kind === "dependsOn" ? "depends on" : "references";
	return `${edge.source.label} ${verb} disabled ${resourceTypeSingular(edge.targetResourceType)}: ${edge.target.label}`;
}

function sourceMetaForEdge(edge: InventoryReferenceEdge): SettingItemMeta {
	return { resourceType: edge.sourceResourceType, item: edge.source };
}

function uniqueSourceMetas(edges: InventoryReferenceEdge[]): SettingItemMeta[] {
	const seen = new Set<string>();
	const sources: SettingItemMeta[] = [];
	for (const edge of edges) {
		const key = `${edge.sourceResourceType}:${edge.source.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		sources.push(sourceMetaForEdge(edge));
	}
	return sources;
}

function simulateToggleState(
	state: EnabledState,
	meta: SettingItemMeta,
	enabled: boolean,
	childrenByParent: Map<string, SettingItemMeta[]>,
): EnabledState {
	const next = cloneEnabledState(state);
	setEnabledState(next, meta.resourceType, meta.item.id, enabled);
	if (meta.resourceType !== "extensions") return next;
	for (const child of childrenByParent.get(meta.item.id) ?? []) {
		setEnabledState(next, child.resourceType, child.item.id, enabled);
	}
	return next;
}

function createDanglingWarningDialog(
	theme: Theme,
	toggled: SettingItemMeta,
	edges: InventoryReferenceEdge[],
	onDone: (choice?: DanglingWarningDecision) => void,
) {
	let selected = 0;
	const sourcesToDisable = uniqueSourceMetas(edges);
	const hasDependency = edges.some((edge) => edge.kind === "dependsOn");
	const options = [
		{
			choice: "apply" as const,
			title: "只套用目前 toggle",
			detail: "保留列出的 source resources 啟用",
		},
		{
			choice: "cascade" as const,
			title: "一併關閉 source resources",
			detail: "只關閉下方直接列出的 source resources",
		},
		{
			choice: undefined,
			title: "取消",
			detail: "不更新狀態、不寫入 settings.json",
		},
	];
	const edgeLines = edges
		.slice(0, 8)
		.map((edge) => `• ${edgeDescription(edge)}`);
	if (edges.length > edgeLines.length) {
		edgeLines.push(`• ...and ${edges.length - edgeLines.length} more`);
	}

	return {
		render: (width: number) => {
			const lines = [
				theme.fg(
					"warning",
					theme.bold(
						hasDependency
							? "⚠ Dangling dependency warning"
							: "⚠ Dangling reference warning",
					),
				),
				`切換 resource：${toggled.item.label} (${resourceTypeSingular(toggled.resourceType)})`,
				"此操作會造成新的 dangling edges：",
				...edgeLines,
				"",
				"請選擇處理方式：",
				...options.map((option, index) => {
					const marker = index === selected ? "›" : " ";
					const line = `${marker} ${index + 1}. ${option.title} — ${option.detail}`;
					return index === selected
						? theme.bg("selectedBg", theme.fg("accent", theme.bold(line)))
						: theme.fg("muted", line);
				}),
				"",
				theme.fg("dim", "↑↓/←→ 選擇 · 1/2/3 直接選 · Enter 確認 · Esc 取消"),
			];
			return lines.map((line) => truncateToWidth(line, width));
		},
		handleInput: (data: string) => {
			if (
				matchesKey(data, "up") ||
				matchesKey(data, "left") ||
				matchesKey(data, "shift+tab")
			) {
				selected = (selected + options.length - 1) % options.length;
				return;
			}
			if (
				matchesKey(data, "down") ||
				matchesKey(data, "right") ||
				matchesKey(data, "tab")
			) {
				selected = (selected + 1) % options.length;
				return;
			}
			if (matchesKey(data, "1")) {
				onDone({ choice: "apply", sourcesToDisable });
				return;
			}
			if (matchesKey(data, "2")) {
				onDone({ choice: "cascade", sourcesToDisable });
				return;
			}
			if (matchesKey(data, "3")) {
				onDone(undefined);
				return;
			}
			if (matchesKey(data, "enter") || data === " ") {
				const option = options[selected];
				onDone(
					option?.choice
						? { choice: option.choice, sourcesToDisable }
						: undefined,
				);
				return;
			}
			if (matchesKey(data, "escape")) {
				onDone(undefined);
			}
		},
		invalidate: () => {},
	};
}

function buildSettingItems(
	inventory: Inventory,
	state: EnabledState,
	currentTab: TabType,
	options: BuildSettingItemsOptions = {},
): BuiltSettingItems {
	const {
		width = 80,
		foldedParentRows = new Set<string>(),
		searchActive = false,
	} = options;
	const meta = new Map<string, SettingItemMeta>();
	const extensions = inventory.extensions ?? [];
	const childrenByParent = new Map<string, SettingItemMeta[]>();
	const parentByChild = new Map<InventoryItem, InventoryItem>();
	const parentRows = new Map<string, ParentRowMeta>();

	for (const ext of extensions) {
		childrenByParent.set(ext.id, []);
	}

	for (const resourceType of ["skills", "prompts", "themes"] as const) {
		for (const item of inventory[resourceType] ?? []) {
			const parent = item.source
				? extensions.find(
						(ext) => ext.id === item.source || ext.source === item.source,
					)
				: undefined;
			const child = { resourceType, item };

			if (parent) {
				childrenByParent.get(parent.id)?.push(child);
				parentByChild.set(item, parent);
			}
		}
	}

	interface PendingItem {
		settingId: string;
		rawLabel: string;
		currentValue: string;
		values: string[];
		description?: string;
	}
	const pending: PendingItem[] = [];

	const addDisplayItem = (
		resourceType: ResourceType,
		item: InventoryItem,
		indent = false,
	) => {
		const settingId = `${resourceType}:${item.id}`;
		const description = item.description ? ` — ${item.description}` : "";
		const rawLabel = `${indent ? "  " : ""}${item.label}${description}`;
		pending.push({
			settingId,
			rawLabel,
			currentValue: state[resourceType].has(item.id) ? "on" : "off",
			values: ["on", "off"],
		});
		meta.set(settingId, { resourceType, item });
	};

	const createItems = (pendingItems: PendingItem[]): SettingItem[] => {
		// Calculate maximum label width based on terminal width to keep values aligned.
		const maxLabelLimit = Math.max(30, width - 12);
		const maxRawWidth =
			pendingItems.length > 0
				? Math.max(...pendingItems.map((p) => visibleWidth(p.rawLabel)))
				: 0;
		const targetWidth = Math.min(maxRawWidth, maxLabelLimit);

		return pendingItems.map((p) => {
			let displayLabel = p.rawLabel;
			const descriptions: string[] = [];

			if (visibleWidth(p.rawLabel) > targetWidth) {
				displayLabel = truncateToWidth(p.rawLabel, targetWidth, "…");
				descriptions.push(p.rawLabel);
			} else if (visibleWidth(p.rawLabel) < targetWidth) {
				displayLabel =
					p.rawLabel + " ".repeat(targetWidth - visibleWidth(p.rawLabel));
			}
			if (p.description) descriptions.push(p.description);

			return {
				id: p.settingId,
				label: displayLabel,
				description: descriptions.length ? descriptions.join(" · ") : " ",
				currentValue: p.currentValue,
				values: p.values,
			};
		});
	};

	if (currentTab === "extensions") {
		for (const ext of extensions) {
			addDisplayItem("extensions", ext);
		}

		return {
			items: createItems(pending),
			meta,
			childrenByParent,
			parentRows,
		};
	}

	if (isTreeTab(currentTab)) {
		const groupedByParent = new Map<string, SettingItemMeta[]>();
		const standaloneChildren: SettingItemMeta[] = [];

		for (const item of inventory[currentTab] ?? []) {
			const parent = parentByChild.get(item);
			const child = { resourceType: currentTab, item };
			if (!parent) {
				standaloneChildren.push(child);
				continue;
			}
			const group = groupedByParent.get(parent.id) ?? [];
			group.push(child);
			groupedByParent.set(parent.id, group);
		}

		const sortChildren = (children: SettingItemMeta[]) =>
			[...children].sort((a, b) =>
				a.item.label.localeCompare(b.item.label, "en", { sensitivity: "base" }),
			);

		const addParentGroup = (
			parentId: string,
			parentItem: InventoryItem | undefined,
			children: SettingItemMeta[],
		) => {
			const rowId = parentRowId(currentTab, parentId);
			const expanded = parentExpanded(rowId, foldedParentRows, searchActive);
			const enabledCount = children.filter((child) =>
				state[child.resourceType].has(child.item.id),
			).length;
			const summary = `${enabledCount}/${children.length} ON`;
			const parentDisabledWarning =
				parentItem !== undefined &&
				!state.extensions.has(parentItem.id) &&
				enabledCount > 0;
			const currentValue = parentDisabledWarning ? `⚠ ${summary}` : summary;
			const parentLabel = parentItem?.label ?? "Standalone";
			const rawLabel = `${expanded ? "▾" : "▸"} ${parentLabel}`;
			const descriptions: string[] = [];
			if (parentDisabledWarning && parentItem) {
				descriptions.push(
					`${parentItem.label} extension is off. Enable it from Extensions tab.`,
				);
			}
			if (parentItem?.description) descriptions.push(parentItem.description);
			if (!parentItem) {
				descriptions.push(
					"Standalone resources are not attached to an Extension.",
				);
			}

			pending.push({
				settingId: rowId,
				rawLabel,
				currentValue,
				values: [currentValue],
				description: descriptions.length ? descriptions.join("\n") : undefined,
			});
			parentRows.set(rowId, {
				id: rowId,
				tab: currentTab,
				parentId,
				parentItem,
			});

			if (!expanded) return;
			for (const child of sortChildren(children)) {
				addDisplayItem(child.resourceType, child.item, true);
			}
		};

		for (const parent of extensions) {
			const children = groupedByParent.get(parent.id);
			if (!children?.length) continue;
			addParentGroup(parent.id, parent, children);
		}
		if (standaloneChildren.length > 0) {
			addParentGroup(STANDALONE_PARENT_ID, undefined, standaloneChildren);
		}
	}

	return {
		items: createItems(pending),
		meta,
		childrenByParent,
		parentRows,
	};
}

function renderTabBar(currentTab: TabType, theme: Theme): string {
	return TABS.map((tab) => {
		const label = `${tab.shortcut} ${tab.label.toUpperCase()}`;
		if (tab.type === currentTab) {
			return theme.fg("accent", theme.bold(theme.underline(`══ ${label} ══`)));
		}
		return theme.fg("muted", ` ${label} `);
	}).join("  ");
}

async function openSelector(
	ctx: ExtensionCommandContext,
	loadedInventory: LoadedInventory,
): Promise<{ toggles: number; blocked: string[]; fallbackWrites: string[] }> {
	const initial = await readEnabled(ctx.cwd, loadedInventory.inventory);
	const currentState = cloneEnabledState(initial);
	const referenceGraph = buildInventoryReferenceGraph(
		loadedInventory.inventory,
	);
	let currentTab: TabType = "extensions";
	let lastWidth = 80;
	const foldedParentRows = new Set<string>();
	let searchActive = false;
	let view = buildSettingItems(
		loadedInventory.inventory,
		currentState,
		currentTab,
		{ width: lastWidth, foldedParentRows, searchActive },
	);

	if (!view.items.length) {
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
		const tabBar = new Text(renderTabBar(currentTab, theme), 1, 0);
		container.addChild(tabBar);
		container.addChild(new Text(theme.fg("muted", "─".repeat(72)), 1, 0));
		container.addChild(
			new Text(theme.fg("accent", theme.bold("Extension Stack")), 1, 0),
		);
		container.addChild(
			new Text(
				theme.fg(
					"muted",
					"←→/Tab tabs · 1-4 tabs · ↑↓ navigate · Enter/Space toggle/fold · type to search · Esc close",
				),
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
				}

				if (text === "off") {
					const offText = "○ OFF";
					return selected
						? theme.bold(theme.fg("muted", offText))
						: theme.fg("muted", offText);
				}

				const summaryTone = text.startsWith("⚠") ? "warning" : "muted";
				return selected
					? theme.bold(theme.fg(summaryTone, text))
					: theme.fg(summaryTone, text);
			},
		};

		let meta = view.meta;
		let childrenByParent = view.childrenByParent;
		let parentRows = view.parentRows;
		let sharedEntrypointDialogOpen = false;
		let danglingWarningDialogOpen = false;
		let searchMirror = new Input();
		const sharedEntrypointChoices = new Map<string, SharedEntrypointChoice>();
		const danglingWarningDecisions = new Map<string, DanglingWarningDecision>();

		const resetSearchState = () => {
			searchMirror = new Input();
			searchActive = false;
		};

		const updateSearchState = (data: string): boolean => {
			const wasSearching = searchMirror.getValue().length > 0;
			const sanitized = data.replace(/ /g, "");
			if (!sanitized) return false;

			searchMirror.handleInput(sanitized);
			const isSearching = searchMirror.getValue().length > 0;
			if (wasSearching === isSearching) return false;
			searchActive = isSearching;
			return true;
		};

		const createList = (nextItems: SettingItem[], selectedId?: string) => {
			const itemsWithDialogs = nextItems.map((item) => {
				const m = meta.get(item.id);
				if (!m) return item;

				const nextEnabled = item.currentValue !== "on";
				const nextState = simulateToggleState(
					currentState,
					m,
					nextEnabled,
					childrenByParent,
				);
				const newDanglingEdges = findNewDanglingEdges(
					referenceGraph,
					currentState,
					nextState,
				);
				if (newDanglingEdges.length > 0) {
					return {
						...item,
						submenu: (
							_currentValue: string,
							submenuDone: (selectedValue?: string) => void,
						) => {
							danglingWarningDialogOpen = true;
							return createDanglingWarningDialog(
								theme,
								m,
								newDanglingEdges,
								(decision) => {
									danglingWarningDialogOpen = false;
									if (decision) {
										danglingWarningDecisions.set(item.id, decision);
										submenuDone(nextEnabled ? "on" : "off");
										return;
									}
									submenuDone(undefined);
								},
							);
						},
					};
				}

				if (
					!shouldConfirmSharedEntrypointDisable(
						loadedInventory.inventory,
						currentState,
						m,
					)
				) {
					return item;
				}

				const parent = findParentExtension(loadedInventory.inventory, m.item);
				if (!parent) return item;
				const siblings = enabledSiblingResources(
					loadedInventory.inventory,
					currentState,
					m,
				);
				return {
					...item,
					submenu: (
						_currentValue: string,
						submenuDone: (selectedValue?: string) => void,
					) => {
						sharedEntrypointDialogOpen = true;
						return createSharedEntrypointDialog(
							theme,
							m.item,
							parent,
							siblings,
							(choice) => {
								sharedEntrypointDialogOpen = false;
								if (choice) {
									sharedEntrypointChoices.set(item.id, choice);
									submenuDone("off");
									return;
								}
								submenuDone(undefined);
							},
						);
					},
				};
			});

			const nextList = new SettingsList(
				itemsWithDialogs,
				Math.min(nextItems.length + 2, 18),
				customSettingsTheme,
				(settingId, newValue) => {
					const parentRow = parentRows.get(settingId);
					if (parentRow) {
						if (foldedParentRows.has(parentRow.id)) {
							foldedParentRows.delete(parentRow.id);
						} else {
							foldedParentRows.add(parentRow.id);
						}
						rebuildList(settingId);
						tui.requestRender();
						return;
					}

					const m = meta.get(settingId);
					if (!m) return;
					const enabled = newValue === "on";
					const sharedChoice = sharedEntrypointChoices.get(settingId);
					sharedEntrypointChoices.delete(settingId);
					const danglingDecision = danglingWarningDecisions.get(settingId);
					danglingWarningDecisions.delete(settingId);
					const parentToDisable =
						!enabled && sharedChoice === "disable-main-extension"
							? findParentExtension(loadedInventory.inventory, m.item)
							: undefined;
					const skipAssociatedResources =
						!enabled && sharedChoice === "child-only";
					const children =
						m.resourceType === "extensions"
							? (childrenByParent.get(m.item.id) ?? [])
							: [];

					setEnabledState(currentState, m.resourceType, m.item.id, enabled);
					if (parentToDisable) {
						setEnabledState(
							currentState,
							"extensions",
							parentToDisable.id,
							false,
						);
					}
					for (const child of children) {
						setEnabledState(
							currentState,
							child.resourceType,
							child.item.id,
							enabled,
						);
					}
					const cascadeSources =
						danglingDecision?.choice === "cascade"
							? danglingDecision.sourcesToDisable
							: [];
					for (const source of cascadeSources) {
						setEnabledState(
							currentState,
							source.resourceType,
							source.item.id,
							false,
						);
					}

					toggles++;
					rebuildList(settingId);
					tui.requestRender();
					writeQueue = writeQueue
						.then(async () => {
							const result = await applyToggle(
								ctx.cwd,
								loadedInventory.scope,
								m.resourceType,
								m.item,
								enabled,
								{ skipAssociatedResources },
							);
							if (result.blocked) blocked.push(result.blocked);
							if (result.fallbackScope) {
								fallbackWrites.push(`${m.item.id} (${result.fallbackScope})`);
							}

							// 父子綁定開關：若 toggle 的是 parent extension，則對其下所有子項目做相同狀態切換。
							// Parent extension 已負責 extension filter，子項目同步時避免重寫 associatedResources。
							for (const child of children) {
								const childResult = await applyToggle(
									ctx.cwd,
									loadedInventory.scope,
									child.resourceType,
									child.item,
									enabled,
									{ skipAssociatedResources: true },
								);
								if (childResult.blocked) blocked.push(childResult.blocked);
							}

							if (parentToDisable) {
								const parentResult = await applyToggle(
									ctx.cwd,
									loadedInventory.scope,
									"extensions",
									parentToDisable,
									false,
									{ skipAssociatedResources: true },
								);
								if (parentResult.blocked) blocked.push(parentResult.blocked);
								if (parentResult.fallbackScope) {
									fallbackWrites.push(
										`${parentToDisable.id} (${parentResult.fallbackScope})`,
									);
								}
							}

							for (const source of cascadeSources) {
								const sourceResult = await applyToggle(
									ctx.cwd,
									loadedInventory.scope,
									source.resourceType,
									source.item,
									false,
								);
								if (sourceResult.blocked) blocked.push(sourceResult.blocked);
								if (sourceResult.fallbackScope) {
									fallbackWrites.push(
										`${source.item.id} (${sourceResult.fallbackScope})`,
									);
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

			const selectedIndex = selectedId
				? nextItems.findIndex((item) => item.id === selectedId)
				: -1;
			if (selectedIndex >= 0) {
				(nextList as unknown as { selectedIndex: number }).selectedIndex =
					selectedIndex;
			}
			return nextList;
		};

		let list = createList(view.items);
		container.addChild(list);

		const rebuildList = (selectedId?: string) => {
			view = buildSettingItems(
				loadedInventory.inventory,
				currentState,
				currentTab,
				{ width: lastWidth, foldedParentRows, searchActive },
			);
			meta = view.meta;
			childrenByParent = view.childrenByParent;
			parentRows = view.parentRows;
			container.removeChild(list);
			list = createList(view.items, selectedId);
			container.addChild(list);
			container.invalidate();
		};

		const switchToTab = (nextTab: TabType) => {
			if (nextTab === currentTab) return;
			currentTab = nextTab;
			resetSearchState();
			tabBar.setText(renderTabBar(currentTab, theme));
			rebuildList();
			tui.requestRender();
		};

		const cycleTab = (direction: 1 | -1) => {
			const currentIndex = TABS.findIndex((tab) => tab.type === currentTab);
			const nextIndex = (currentIndex + direction + TABS.length) % TABS.length;
			const nextTab = TABS[nextIndex];
			if (!nextTab) return;
			switchToTab(nextTab.type);
		};

		return {
			render: (width: number) => {
				if (width !== lastWidth) {
					lastWidth = width;
					if (
						!sharedEntrypointDialogOpen &&
						!danglingWarningDialogOpen &&
						!searchActive
					) {
						rebuildList();
					}
				}
				return container.render(width);
			},
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				if (sharedEntrypointDialogOpen || danglingWarningDialogOpen) {
					list.handleInput(data);
					tui.requestRender();
					return;
				}

				if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
					cycleTab(-1);
					return;
				}
				if (matchesKey(data, "tab") || matchesKey(data, "right")) {
					cycleTab(1);
					return;
				}

				const directTab = TABS.find((tab) => matchesKey(data, tab.shortcut));
				if (directTab) {
					switchToTab(directTab.type);
					return;
				}

				const normalizedSearchInput = normalizeSearchInput(
					data,
					searchMirror.getValue(),
				);
				if (normalizedSearchInput === undefined) {
					tui.requestRender();
					return;
				}
				if (updateSearchState(normalizedSearchInput)) {
					rebuildList();
				}
				list.handleInput(normalizedSearchInput);
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

function formatStackFooter(
	enabled: number,
	total: number,
	unmanagedCount: number,
	danglingCount: number,
): string {
	const suffixParts = [
		unmanagedCount ? `${unmanagedCount} unmanaged` : undefined,
		danglingCount ? `${danglingCount} dangling` : undefined,
	].filter((part): part is string => part !== undefined);
	const suffix = suffixParts.length ? ` (${suffixParts.join(", ")})` : "";
	return `stack: ${enabled}/${total}${suffix}`;
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
	const dangling = computeDanglingEdges(
		buildInventoryReferenceGraph(inventory),
		state,
	);
	return formatStackFooter(enabled, total, unmanaged.length, dangling.length);
}

function danglingWarningsForItem(
	dangling: InventoryReferenceEdge[],
	resourceType: ResourceType,
	item: InventoryItem,
): string[] {
	return dangling
		.filter(
			(edge) =>
				edge.sourceResourceType === resourceType && edge.source.id === item.id,
		)
		.map((edge) => {
			const verb = edge.kind === "dependsOn" ? "depends on" : "references";
			return `⚠ ${verb} disabled ${resourceTypeSingular(edge.targetResourceType)}: ${edge.target.label}`;
		});
}

function renderTextList(inventory: Inventory, state: EnabledState): string {
	const lines: string[] = [];
	const dangling = computeDanglingEdges(
		buildInventoryReferenceGraph(inventory),
		state,
	);
	const renderSection = (title: string, resourceType: ResourceType) => {
		const items = inventory[resourceType];
		if (!items?.length) return;
		lines.push(`\n${title}:`);
		for (const item of items) {
			const on = state[resourceType].has(item.id);
			const mark = on ? "[✓]" : "[ ]";
			const category = item.category ? ` (${item.category})` : "";
			const warnings = on
				? danglingWarningsForItem(dangling, resourceType, item)
				: [];
			const warningSuffix = warnings.length ? ` ${warnings.join("; ")}` : "";
			const desc = item.description ? `\n      ${item.description}` : "";
			lines.push(`  ${mark} ${item.label}${category}${warningSuffix}${desc}`);
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

interface DiscoveredPackageResource {
	resourceType: ChildResourceType;
	item: InventoryItem;
}

interface PackageInspectionTarget {
	source: string;
	scope: "project" | "global";
}

type StandaloneSkillMode = "pi" | "agents";

interface StandaloneResourceRoot {
	resourceType: ChildResourceType;
	root: string;
	skillMode?: StandaloneSkillMode;
}

function inventoryItemFromUnmanaged(
	entry: UnmanagedExtension,
	category: string | undefined,
): InventoryItem {
	const item: InventoryItem = {
		id: entry.id,
		label: entry.label,
	};
	if (category) item.category = category;
	if (entry.source && entry.source !== entry.id) item.source = entry.source;
	if (entry.path) item.path = entry.path;
	return item;
}

function packagePath(value: string): string {
	return value
		.split(/[\\/]+/g)
		.filter(Boolean)
		.join("/");
}

function relativePackagePath(root: string, path: string): string {
	return packagePath(relative(root, path));
}

function gitSourceWithoutRef(source: string): string {
	const spec = source.startsWith("git:") ? source.slice(4) : source;
	const at = spec.lastIndexOf("@");
	const pathStart = Math.max(spec.lastIndexOf("/"), spec.lastIndexOf(":"));
	return at > pathStart ? spec.slice(0, at) : spec;
}

function gitPackageRoot(source: string, baseDir: string): string | undefined {
	const spec = gitSourceWithoutRef(source);
	let host: string | undefined;
	let repoPath: string | undefined;

	const scpLike = spec.match(/^git@([^:]+):(.+)$/);
	if (scpLike?.[1] && scpLike[2]) {
		host = scpLike[1];
		repoPath = scpLike[2];
	} else {
		try {
			const parsed = new URL(spec);
			host = parsed.hostname;
			repoPath = parsed.pathname.replace(/^\/+/, "");
		} catch {
			const shorthand = spec.match(/^([^/:]+)\/(.+)$/);
			if (shorthand?.[1] && shorthand[2]) {
				host = shorthand[1];
				repoPath = shorthand[2];
			}
		}
	}

	if (!host || !repoPath) return undefined;
	return join(
		baseDir,
		"git",
		host,
		...packagePath(withoutGitSuffix(repoPath)).split("/"),
	);
}

function packageRootForTarget(
	cwd: string,
	target: PackageInspectionTarget,
): string | undefined {
	const baseDir = scopeBaseDir(cwd, target.scope);
	const npmName = npmPackageName(target.source);
	if (npmName)
		return join(baseDir, "npm", "node_modules", ...npmName.split("/"));
	if (isPathLike(target.source)) return resolveFromBase(target.source, baseDir);
	if (
		target.source.startsWith("git:") ||
		target.source.startsWith("http://") ||
		target.source.startsWith("https://") ||
		target.source.startsWith("ssh://") ||
		target.source.startsWith("git@")
	) {
		return gitPackageRoot(target.source, baseDir);
	}
	return undefined;
}

function unmanagedPackageTarget(
	entry: UnmanagedExtension,
): PackageInspectionTarget | undefined {
	if (entry.kind !== "package" || !entry.source) return undefined;
	return { source: entry.source, scope: entry.scope };
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		return (await fs.stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function walkFiles(root: string): Promise<string[]> {
	const entries = await fs.readdir(root, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const fullPath = join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

async function listDirectResourceFiles(
	root: string,
	fileExtension: string,
): Promise<string[]> {
	if (!(await directoryExists(root))) return [];
	const entries = await fs.readdir(root, { withFileTypes: true });
	return entries
		.filter(
			(entry) =>
				entry.isFile() &&
				!entry.name.startsWith(".") &&
				entry.name.endsWith(fileExtension),
		)
		.map((entry) => join(root, entry.name))
		.sort();
}

async function listStandaloneSkillFiles(
	root: string,
	mode: StandaloneSkillMode,
	current = root,
): Promise<string[]> {
	if (!(await directoryExists(current))) return [];
	const entries = await fs.readdir(current, { withFileTypes: true });
	const skillFile = entries.find(
		(entry) => entry.isFile() && entry.name === "SKILL.md",
	);
	if (skillFile) return [join(current, skillFile.name)];

	const files: string[] = [];
	if (mode === "pi" && current === root) {
		files.push(
			...entries
				.filter(
					(entry) =>
						entry.isFile() &&
						!entry.name.startsWith(".") &&
						entry.name.endsWith(".md"),
				)
				.map((entry) => join(current, entry.name)),
		);
	}

	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const fullPath = join(current, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listStandaloneSkillFiles(root, mode, fullPath)));
		}
	}
	return files.sort();
}

async function listPackageFiles(
	packageRoot: string,
	directory: string,
): Promise<string[]> {
	const root = join(packageRoot, directory);
	if (!(await directoryExists(root))) return [];
	const files = await walkFiles(root);
	return files.map((file) => relativePackagePath(packageRoot, file)).sort();
}

function isRuntimeExtensionFile(path: string): boolean {
	return (
		path.startsWith("extensions/") &&
		(path.endsWith(".ts") || path.endsWith(".js")) &&
		!path.endsWith(".d.ts")
	);
}

function isSkillResource(path: string): boolean {
	if (!path.startsWith("skills/") || !path.endsWith(".md")) return false;
	if (basename(path) === "SKILL.md") return true;
	return !path.slice("skills/".length).includes("/");
}

function isPromptResource(path: string): boolean {
	return path.startsWith("prompts/") && path.endsWith(".md");
}

function isThemeResource(path: string): boolean {
	return path.startsWith("themes/") && path.endsWith(".json");
}

function withoutFileExtension(path: string): string {
	return basename(path).replace(/\.[^.]+$/, "");
}

function featureLabelForResource(
	resourceType: ChildResourceType,
	path: string,
): string {
	if (resourceType === "skills" && basename(path) === "SKILL.md") {
		return basename(dirname(path));
	}
	return withoutFileExtension(path);
}

function normalizeFeatureToken(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function featureTokensForResource(
	resourceType: ChildResourceType,
	path: string,
): Set<string> {
	const segments = packagePath(path).split("/");
	const candidates = [featureLabelForResource(resourceType, path), ...segments];
	const ignored = new Set([
		"skill",
		"skills",
		"prompt",
		"prompts",
		"theme",
		"themes",
		"md",
		"json",
		"index",
	]);
	return new Set(
		candidates
			.map((candidate) =>
				normalizeFeatureToken(candidate.replace(/\.[^.]+$/, "")),
			)
			.filter((token) => token.length > 1 && !ignored.has(token)),
	);
}

function featureTokensForExtension(path: string): Set<string> {
	const segments = packagePath(path).split("/");
	const ignored = new Set(["extension", "extensions", "ts", "js", "index"]);
	return new Set(
		segments
			.map((segment) => normalizeFeatureToken(segment.replace(/\.[^.]+$/, "")))
			.filter((token) => token.length > 1 && !ignored.has(token)),
	);
}

function setsIntersect(left: Set<string>, right: Set<string>): boolean {
	for (const value of left) {
		if (right.has(value)) return true;
	}
	return false;
}

function matchAssociatedExtensions(
	resourceType: ChildResourceType,
	resourcePath: string,
	extensionPaths: string[],
	hasRootIndex: boolean,
): string[] {
	if (resourceType === "themes") return [];
	if (extensionPaths.length === 0) return hasRootIndex ? ["index.ts"] : [];

	const resourceTokens = featureTokensForResource(resourceType, resourcePath);
	const exactMatches = extensionPaths.filter((extensionPath) =>
		setsIntersect(resourceTokens, featureTokensForExtension(extensionPath)),
	);
	if (exactMatches.length > 0) return exactMatches;

	const resourceKey = normalizeFeatureToken(resourcePath);
	return extensionPaths.filter((extensionPath) => {
		const extensionKey = normalizeFeatureToken(extensionPath);
		return (
			[...resourceTokens].some(
				(token) => token.length > 2 && extensionKey.includes(token),
			) ||
			[...featureTokensForExtension(extensionPath)].some(
				(token) => token.length > 2 && resourceKey.includes(token),
			)
		);
	});
}

function packageResourceItem(
	parentId: string,
	category: string | undefined,
	resourceType: ChildResourceType,
	resourcePath: string,
	extensionPaths: string[],
	hasRootIndex: boolean,
): InventoryItem {
	const associatedExtensions = matchAssociatedExtensions(
		resourceType,
		resourcePath,
		extensionPaths,
		hasRootIndex,
	);
	const item: InventoryItem = {
		id: `${parentId}/${resourcePath}`,
		label: defaultLabelForId(
			featureLabelForResource(resourceType, resourcePath),
		),
		source: parentId,
		path: resourcePath,
	};
	if (category) item.category = category;
	if (associatedExtensions.length > 0) {
		item.associatedResources = { extensions: associatedExtensions };
	}
	return item;
}

async function discoverPackageResources(
	cwd: string,
	target: PackageInspectionTarget | undefined,
	parentId: string,
	category: string | undefined,
): Promise<DiscoveredPackageResource[]> {
	if (!target) return [];
	const packageRoot = packageRootForTarget(cwd, target);
	if (!packageRoot || !(await directoryExists(packageRoot))) return [];

	const [extensionFiles, skillFiles, promptFiles, themeFiles, hasRootIndex] =
		await Promise.all([
			listPackageFiles(packageRoot, "extensions"),
			listPackageFiles(packageRoot, "skills"),
			listPackageFiles(packageRoot, "prompts"),
			listPackageFiles(packageRoot, "themes"),
			pathExists(join(packageRoot, "index.ts")),
		]);
	const extensionPaths = extensionFiles.filter(isRuntimeExtensionFile);

	return [
		...skillFiles.filter(isSkillResource).map((resourcePath) => ({
			resourceType: "skills" as const,
			item: packageResourceItem(
				parentId,
				category,
				"skills",
				resourcePath,
				extensionPaths,
				hasRootIndex,
			),
		})),
		...promptFiles.filter(isPromptResource).map((resourcePath) => ({
			resourceType: "prompts" as const,
			item: packageResourceItem(
				parentId,
				category,
				"prompts",
				resourcePath,
				extensionPaths,
				hasRootIndex,
			),
		})),
		...themeFiles.filter(isThemeResource).map((resourcePath) => ({
			resourceType: "themes" as const,
			item: packageResourceItem(
				parentId,
				category,
				"themes",
				resourcePath,
				extensionPaths,
				hasRootIndex,
			),
		})),
	];
}

function appendInventoryItem(
	inventory: Inventory,
	resourceType: ResourceType,
	item: InventoryItem,
): boolean {
	let items = inventory[resourceType];
	if (!items) {
		items = [];
		inventory[resourceType] = items;
	}
	const itemPath = item.path
		? normalizePackageResourcePath(item.path)
		: undefined;
	const exists = items.some((existing) => {
		if (existing.id === item.id) return true;
		if (!existing.path || !itemPath) return false;
		return (
			existing.source === item.source &&
			normalizePackageResourcePath(existing.path) === itemPath
		);
	});
	if (exists) return false;
	items.push(item);
	return true;
}

function managedPackageTarget(
	cwd: string,
	settings: LoadedSettings,
	item: InventoryItem,
): PackageInspectionTarget | undefined {
	const projectPackage = settings.project.packages?.find((pkg) =>
		packageMatchesItem(pkg, item, projectPiDir(cwd)),
	);
	if (projectPackage) {
		return { source: packageSource(projectPackage), scope: "project" };
	}

	const globalPackage = settings.global.packages?.find((pkg) =>
		packageMatchesItem(pkg, item, GLOBAL_PI_DIR),
	);
	if (globalPackage) {
		return { source: packageSource(globalPackage), scope: "global" };
	}

	return undefined;
}

async function discoverManagedPackageResources(
	cwd: string,
	inventory: Inventory,
): Promise<number> {
	const settings = await loadSettings(cwd);
	let added = 0;
	for (const extensionItem of inventory.extensions ?? []) {
		const resources = await discoverPackageResources(
			cwd,
			managedPackageTarget(cwd, settings, extensionItem),
			extensionItem.id,
			extensionItem.category,
		);
		for (const resource of resources) {
			if (
				appendInventoryItem(inventory, resource.resourceType, resource.item)
			) {
				added++;
			}
		}
	}
	return added;
}

async function findGitRepoRoot(cwd: string): Promise<string | undefined> {
	let dir = resolve(cwd);
	while (true) {
		if (await directoryExists(join(dir, ".git"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

async function projectAgentsSkillRoots(cwd: string): Promise<string[]> {
	const roots: string[] = [];
	const repoRoot = await findGitRepoRoot(cwd);
	let dir = resolve(cwd);
	while (true) {
		roots.push(join(dir, ".agents", "skills"));
		if (repoRoot && dir === repoRoot) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return roots;
}

async function standaloneResourceRoots(
	cwd: string,
): Promise<StandaloneResourceRoot[]> {
	return [
		{
			resourceType: "skills",
			root: join(GLOBAL_PI_DIR, "skills"),
			skillMode: "pi",
		},
		{
			resourceType: "skills",
			root: join(homedir(), ".agents", "skills"),
			skillMode: "agents",
		},
		{ resourceType: "prompts", root: join(GLOBAL_PI_DIR, "prompts") },
		{ resourceType: "themes", root: join(GLOBAL_PI_DIR, "themes") },
		{
			resourceType: "skills",
			root: join(projectPiDir(cwd), "skills"),
			skillMode: "pi",
		},
		...(await projectAgentsSkillRoots(cwd)).map((root) => ({
			resourceType: "skills" as const,
			root,
			skillMode: "agents" as const,
		})),
		{ resourceType: "prompts", root: join(projectPiDir(cwd), "prompts") },
		{ resourceType: "themes", root: join(projectPiDir(cwd), "themes") },
	];
}

async function standaloneResourcePaths(
	root: StandaloneResourceRoot,
): Promise<string[]> {
	if (root.resourceType === "skills") {
		return listStandaloneSkillFiles(root.root, root.skillMode ?? "pi");
	}
	if (root.resourceType === "prompts") {
		return listDirectResourceFiles(root.root, ".md");
	}
	return listDirectResourceFiles(root.root, ".json");
}

function standaloneResourceId(
	resourceType: ChildResourceType,
	path: string,
): string {
	const id = featureLabelForResource(resourceType, path);
	return id || defaultIdForSource(path);
}

function standaloneResourceItem(
	resourceType: ChildResourceType,
	path: string,
): InventoryItem {
	const id = standaloneResourceId(resourceType, path);
	return {
		id,
		label: defaultLabelForId(id),
		category: "Standalone",
		description: `Discovered standalone ${resourceType.slice(0, -1)}`,
		path,
	};
}

async function discoverStandaloneResources(
	cwd: string,
	inventory: Inventory,
): Promise<number> {
	let added = 0;
	const seenPaths = new Set<string>();
	for (const root of await standaloneResourceRoots(cwd)) {
		for (const path of await standaloneResourcePaths(root)) {
			const normalizedPath = resolve(path);
			if (seenPaths.has(normalizedPath)) continue;
			seenPaths.add(normalizedPath);
			if (
				appendInventoryItem(
					inventory,
					root.resourceType,
					standaloneResourceItem(root.resourceType, normalizedPath),
				)
			) {
				added++;
			}
		}
	}
	return added;
}

function packageTargetForSource(
	cwd: string,
	settings: LoadedSettings,
	source: string,
): PackageInspectionTarget | undefined {
	const projectPackage = settings.project.packages?.find((pkg) =>
		packageMatches(packageSource(pkg), source, projectPiDir(cwd)),
	);
	if (projectPackage) {
		return { source: packageSource(projectPackage), scope: "project" };
	}

	const globalPackage = settings.global.packages?.find((pkg) =>
		packageMatches(packageSource(pkg), source, GLOBAL_PI_DIR),
	);
	if (globalPackage) {
		return { source: packageSource(globalPackage), scope: "global" };
	}
	return undefined;
}

function skillPackageRoot(
	cwd: string,
	settings: LoadedSettings,
	inventory: Inventory,
	item: InventoryItem,
): string | undefined {
	if (!item.source) return undefined;
	const parent = findParentExtension(inventory, item);
	const target = parent
		? managedPackageTarget(cwd, settings, parent)
		: packageTargetForSource(cwd, settings, item.source);
	return target ? packageRootForTarget(cwd, target) : undefined;
}

function skillFilePathForItem(
	cwd: string,
	settings: LoadedSettings,
	inventory: Inventory,
	item: InventoryItem,
): string | undefined {
	if (!item.path) return undefined;
	if (item.source) {
		const root = skillPackageRoot(cwd, settings, inventory, item);
		return root
			? join(root, normalizePackageResourcePath(item.path))
			: undefined;
	}
	return resolveFromBase(item.path, projectPiDir(cwd));
}

function skillReferenceTokens(item: InventoryItem): Set<string> {
	const candidates = [item.id, item.label, normalizeReferenceLabel(item.label)];
	if (item.path) {
		const normalizedPath = packagePath(normalizePackageResourcePath(item.path));
		const pathBase = withoutFileExtension(normalizedPath);
		candidates.push(basename(pathBase));
		if (basename(normalizedPath) === "SKILL.md") {
			candidates.push(basename(dirname(normalizedPath)));
		}
	}
	return new Set(
		candidates
			.map((candidate) => candidate.trim())
			.filter((candidate) => normalizeReferenceLabel(candidate).length > 1),
	);
}

function normalizedWords(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function compactReferenceToken(value: string): string {
	return normalizedWords(value).replace(/ /g, "");
}

function hasHighConfidenceSkillReference(
	content: string,
	tokens: Set<string>,
): boolean {
	const words = ` ${normalizedWords(content)} `;
	const compact = content.toLowerCase().replace(/[\s_-]+/g, "");
	for (const token of tokens) {
		const tokenWords = normalizedWords(token);
		const tokenCompact = compactReferenceToken(token);
		if (!tokenWords || !tokenCompact) continue;
		if (words.includes(` invoke ${tokenWords} skill `)) return true;
		if (words.includes(` use ${tokenWords} skill `)) return true;
		if (words.includes(` ${tokenWords} first `)) return true;
		if (compact.includes(`/skill:${tokenCompact}`)) return true;
		if (compact.includes(`superpowers:${tokenCompact}`)) return true;
	}
	return false;
}

function addSkillReference(source: InventoryItem, targetId: string): boolean {
	source.references ??= {};
	const references = source.references.skills ?? [];
	if (references.includes(targetId)) return false;
	source.references.skills = [...references, targetId];
	return true;
}

function inferSkillReferencesFromContent(
	source: InventoryItem,
	content: string,
	skills: InventoryItem[],
): number {
	let added = 0;
	for (const target of skills) {
		if (target.id === source.id) continue;
		if (
			hasHighConfidenceSkillReference(content, skillReferenceTokens(target))
		) {
			if (addSkillReference(source, target.id)) added++;
		}
	}
	return added;
}

async function inferSkillReferences(
	cwd: string,
	inventory: Inventory,
): Promise<number> {
	const skills = inventory.skills ?? [];
	if (skills.length === 0) return 0;
	const settings = await loadSettings(cwd);
	let added = 0;

	for (const source of skills) {
		const path = skillFilePathForItem(cwd, settings, inventory, source);
		if (!path) continue;
		let content: string;
		try {
			content = await fs.readFile(path, "utf-8");
		} catch {
			continue;
		}

		added += inferSkillReferencesFromContent(source, content, skills);
	}
	return added;
}

async function runDiscover(
	ctx: ExtensionCommandContext,
	loadedInventory: LoadedInventory,
): Promise<void> {
	const unmanaged = await discoverUnmanaged(ctx.cwd, loadedInventory.inventory);
	if (unmanaged.length > 0) {
		ctx.ui.notify(
			`Unmanaged extensions (${unmanaged.length}):\n${renderUnmanagedList(unmanaged)}`,
			"info",
		);
	}

	let added = 0;
	let addedResources = 0;
	let addedStandaloneResources = 0;
	let inferredSkillReferences = 0;
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
		const extensionItem = inventoryItemFromUnmanaged(entry, category);
		loadedInventory.inventory.extensions.push(extensionItem);

		const discoveredResources = await discoverPackageResources(
			ctx.cwd,
			unmanagedPackageTarget(entry),
			extensionItem.id,
			category,
		);
		for (const resource of discoveredResources) {
			if (
				appendInventoryItem(
					loadedInventory.inventory,
					resource.resourceType,
					resource.item,
				)
			) {
				addedResources++;
			}
		}

		await writeJsonAtomic(loadedInventory.path, loadedInventory.inventory);
		added++;
	}

	const backfilledResources = await discoverManagedPackageResources(
		ctx.cwd,
		loadedInventory.inventory,
	);
	addedResources += backfilledResources;
	addedStandaloneResources = await discoverStandaloneResources(
		ctx.cwd,
		loadedInventory.inventory,
	);
	inferredSkillReferences = await inferSkillReferences(
		ctx.cwd,
		loadedInventory.inventory,
	);
	if (
		backfilledResources > 0 ||
		addedStandaloneResources > 0 ||
		inferredSkillReferences > 0
	) {
		await writeJsonAtomic(loadedInventory.path, loadedInventory.inventory);
	}

	ctx.ui.notify(
		[
			`Discovery complete. Added ${added}, child resources ${addedResources}, standalone resources ${addedStandaloneResources}, inferred skill references ${inferredSkillReferences}, skipped ${skipped}.`,
			unmanaged.length === 0 &&
			addedResources === 0 &&
			addedStandaloneResources === 0 &&
			inferredSkillReferences === 0
				? "No unmanaged extensions, missing resources, or skill references found."
				: undefined,
			`inventory: ${loadedInventory.path}`,
		]
			.filter(Boolean)
			.join("\n"),
		"info",
	);
	ctx.ui.setStatus(
		STATUS_KEY,
		await computeFooter(ctx.cwd, loadedInventory.inventory),
	);
}

export type { EnabledState, Inventory, InventoryItem, InventoryReferenceEdge };
export {
	buildInventoryReferenceGraph,
	computeDanglingEdges,
	formatStackFooter,
	inferSkillReferencesFromContent,
	renderTextList,
};

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
