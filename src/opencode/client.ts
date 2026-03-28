import { type Session, createOpencodeClient } from "@opencode-ai/sdk";
import type { AssistantMessage, Part } from "@opencode-ai/sdk";

export type SessionInfo = Session;

export interface OpenCodeResponse {
	info: AssistantMessage;
	parts: Part[];
}

export class OpenCodeClient {
	private client: ReturnType<typeof createOpencodeClient>;

	constructor(baseUrl: string, password?: string) {
		const headers: Record<string, string> = {};
		if (password) {
			headers.Authorization = `Basic ${btoa(`opencode:${password}`)}`;
		}
		this.client = createOpencodeClient({
			baseUrl,
			headers,
		});
	}

	async createSession(title?: string): Promise<{ id: string }> {
		const result = await this.client.session.create({
			body: title ? { title } : undefined,
		});

		if ("error" in result && result.error) {
			throw new Error(`Failed to create session: ${JSON.stringify(result.error)}`);
		}

		if (!("data" in result) || !result.data) {
			throw new Error("Failed to create session: no data returned");
		}

		return { id: result.data.id };
	}

	async sendMessage(sessionId: string, text: string, agent?: string): Promise<OpenCodeResponse> {
		const body: {
			parts: Array<{ type: "text"; text: string }>;
			agent?: string;
		} = {
			parts: [{ type: "text", text }],
		};

		if (agent) {
			body.agent = agent;
		}

		const result = await this.client.session.prompt({
			path: { id: sessionId },
			body,
		});

		if ("error" in result && result.error) {
			throw new Error(`Failed to send message: ${JSON.stringify(result.error)}`);
		}

		if (!("data" in result) || !result.data) {
			throw new Error("Failed to send message: no data returned");
		}

		return result.data as OpenCodeResponse;
	}

	async getSession(sessionId: string): Promise<SessionInfo> {
		const result = await this.client.session.get({
			path: { id: sessionId },
		});

		if ("error" in result && result.error) {
			throw new Error(`Failed to get session: ${JSON.stringify(result.error)}`);
		}

		if (!("data" in result) || !result.data) {
			throw new Error("Failed to get session: no data returned");
		}

		return result.data;
	}

	async abortSession(sessionId: string): Promise<void> {
		await this.client.session.abort({
			path: { id: sessionId },
		});
	}

	async listSessions(): Promise<SessionInfo[]> {
		const result = await this.client.session.list();

		if ("error" in result && result.error) {
			throw new Error(`Failed to list sessions: ${JSON.stringify(result.error)}`);
		}

		if (!("data" in result) || !result.data) {
			return [];
		}

		return result.data;
	}
}
