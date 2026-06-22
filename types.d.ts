declare namespace NodeJS {
	interface ErrnoException extends Error {
		code?: string;
	}
}

declare const process: {
	pid: number;
};

declare module "node:fs" {
	interface Dirent {
		name: string;
		isDirectory(): boolean;
		isFile(): boolean;
	}

	interface Stats {
		isDirectory(): boolean;
	}

	export const promises: {
		access(path: string): Promise<void>;
		mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
		readFile(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
		readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
		rename(oldPath: string, newPath: string): Promise<void>;
		stat(path: string): Promise<Stats>;
		writeFile(
			path: string,
			data: string,
			encoding?: "utf-8" | "utf8",
		): Promise<void>;
	};
}

declare module "node:os" {
	export function homedir(): string;
}

declare module "node:path" {
	export function basename(path: string): string;
	export function dirname(path: string): string;
	export function join(...paths: string[]): string;
	export function relative(from: string, to: string): string;
	export function resolve(...paths: string[]): string;
}

declare module "@mariozechner/pi-coding-agent" {
	export interface Theme {
		fg(tone: string, text: string): string;
		bg(tone: string, text: string): string;
		bold(text: string): string;
	}

	interface ExtensionUI {
		confirm(title: string, message?: string): Promise<boolean>;
		custom<T>(
			renderer: (
				tui: { requestRender(): void },
				theme: Theme,
				keyboard: unknown,
				done: (value?: T) => void,
			) => unknown,
		): Promise<T | undefined>;
		input(title: string, defaultValue?: string): Promise<string | undefined>;
		notify(message: string, level?: string): void;
		select(title: string, options: string[]): Promise<string | undefined>;
		setStatus(key: string, value: string): void;
	}

	export interface ExtensionCommandContext {
		cwd: string;
		ui: ExtensionUI;
		reload(): Promise<void>;
	}

	export interface ExtensionAPI {
		on(
			event: "session_start",
			handler: (
				event: unknown,
				ctx: ExtensionCommandContext,
			) => void | Promise<void>,
		): void;
		registerCommand(
			name: string,
			command: {
				description: string;
				handler: (
					args: string,
					ctx: ExtensionCommandContext,
				) => void | Promise<void>;
			},
		): void;
		registerShortcut(
			name: string,
			shortcut: { description: string; handler: () => void | Promise<void> },
		): void;
		sendUserMessage(message: string, options?: unknown): void;
	}

	export function getSettingsListTheme(): Record<string, unknown>;
}

declare module "@mariozechner/pi-tui" {
	export interface SettingItem {
		id: string;
		label: string;
		currentValue: string;
		values: string[];
		description?: string;
		submenu?: (
			currentValue: string,
			done: (selectedValue?: string) => void,
		) => unknown;
	}

	export class Container {
		addChild(child: unknown): void;
		removeChild(child: unknown): void;
		render(width: number): string[];
		invalidate(): void;
	}

	export class Input {
		getValue(): string;
		handleInput(data: string): void;
	}

	export class SettingsList {
		constructor(
			items: SettingItem[],
			height: number,
			theme: Record<string, unknown>,
			onChange: (settingId: string, newValue: string) => void,
			onDone?: () => void,
			options?: Record<string, unknown>,
		);
		handleInput(data: string): void;
	}

	export class Text {
		constructor(text: string, x?: number, y?: number);
		setText(text: string): void;
	}

	export function matchesKey(data: string, key: string): boolean;
	export function truncateToWidth(
		text: string,
		width: number,
		ellipsis?: string,
	): string;
	export function visibleWidth(text: string): number;
}
