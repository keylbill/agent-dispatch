import { LinearClient } from "@linear/sdk";
import type { AgentPlanStep } from "./types.js";

export class LinearActivities {
	private client: LinearClient;

	constructor(accessToken: string) {
		this.client = new LinearClient({ accessToken });
	}

	async sendThought(sessionId: string, body: string): Promise<void> {
		await this.client.createAgentActivity({
			agentSessionId: sessionId,
			content: { type: "thought", body },
		});
	}

	async sendAction(
		sessionId: string,
		action: string,
		parameter?: string,
		result?: string,
	): Promise<void> {
		const content: Record<string, unknown> = { type: "action", action };
		if (parameter !== undefined) content.parameter = parameter;
		if (result !== undefined) content.result = result;

		await this.client.createAgentActivity({
			agentSessionId: sessionId,
			content,
		});
	}

	async sendElicitation(sessionId: string, body: string): Promise<void> {
		await this.client.createAgentActivity({
			agentSessionId: sessionId,
			content: { type: "elicitation", body },
		});
	}

	async sendResponse(sessionId: string, body: string): Promise<void> {
		await this.client.createAgentActivity({
			agentSessionId: sessionId,
			content: { type: "response", body },
		});
	}

	async sendError(sessionId: string, body: string): Promise<void> {
		await this.client.createAgentActivity({
			agentSessionId: sessionId,
			content: { type: "error", body },
		});
	}

	async updatePlan(sessionId: string, steps: AgentPlanStep[]): Promise<void> {
		await this.client.updateAgentSession(sessionId, {
			plan: { steps },
		});
	}

	async setExternalUrl(sessionId: string, label: string, url: string): Promise<void> {
		await this.client.agentSessionUpdateExternalUrl(sessionId, {
			externalLink: url,
			addedExternalUrls: [{ label, url }],
		});
	}
}
