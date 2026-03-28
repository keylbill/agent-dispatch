import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

export interface SessionMapping {
	opencodeSessionId: string;
	activeAgent: string;
	returnAgent?: string;
	linearAgentSessionId: string;
	createdAt: string;
	updatedAt: string;
}

type StoreData = Record<string, SessionMapping>;

function ensureDir(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

async function readStore(): Promise<StoreData> {
	const path = config.sessionStorePath;
	const file = Bun.file(path);
	const exists = await file.exists();
	if (!exists) {
		return {};
	}
	try {
		const text = await file.text();
		return JSON.parse(text) as StoreData;
	} catch {
		return {};
	}
}

async function writeStore(data: StoreData): Promise<void> {
	const path = config.sessionStorePath;
	ensureDir(path);
	await Bun.write(path, JSON.stringify(data, null, 2));
}

export class SessionStore {
	async get(issueId: string): Promise<SessionMapping | null> {
		const data = await readStore();
		return data[issueId] ?? null;
	}

	async set(issueId: string, mapping: SessionMapping): Promise<void> {
		const data = await readStore();
		data[issueId] = mapping;
		await writeStore(data);
	}

	async delete(issueId: string): Promise<void> {
		const data = await readStore();
		delete data[issueId];
		await writeStore(data);
	}

	async getByLinearSessionId(
		linearSessionId: string,
	): Promise<{ issueId: string; mapping: SessionMapping } | null> {
		const data = await readStore();
		for (const [issueId, mapping] of Object.entries(data)) {
			if (mapping.linearAgentSessionId === linearSessionId) {
				return { issueId, mapping };
			}
		}
		return null;
	}
}
