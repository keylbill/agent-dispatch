import { config } from "../config.js";
import type { AgentSessionWebhookPayload } from "../linear/types.js";

let agentAliases: Record<string, string> = {};
let defaultAgentName: string | null = null;

export async function loadAgentAliases(opencodeUrl: string): Promise<void> {
	try {
		const resp = await fetch(`${opencodeUrl}/config`);
		if (!resp.ok) return;

		const data = (await resp.json()) as Record<string, unknown>;
		const agents = data.agent as Record<string, unknown> | undefined;
		if (!agents) return;

		defaultAgentName = (data.default_agent as string) ?? null;
		const fullNames = Object.keys(agents);
		const aliases: Record<string, string> = {};

		for (const fullName of fullNames) {
			aliases[fullName.toLowerCase()] = fullName;

			const parenMatch = fullName.match(/^(.+?)\s*\(/);
			if (parenMatch) {
				aliases[parenMatch[1].toLowerCase().trim()] = fullName;
			}
		}

		aliases.orchestrator = aliases.sisyphus ?? fullNames[0];

		agentAliases = aliases;
		console.log(`Loaded ${fullNames.length} agents from OpenCode:`, fullNames);
	} catch (err) {
		console.warn("Failed to load agents from OpenCode, using short names as-is:", err);
	}
}

export function resolveAgentName(shortName: string): string {
	const lower = shortName.toLowerCase().trim();
	return agentAliases[lower] ?? shortName;
}

export function getDefaultAgent(): string {
	return defaultAgentName ?? config.defaultAgent;
}

export type ParsedCommand =
	| { type: "start-work"; planPath: string }
	| { type: "new-session" }
	| { type: "switch-agent"; agent: string }
	| { type: "abort" };

export interface AgentRouting {
	agent: string;
	command?: ParsedCommand;
	issueId: string;
	issueIdentifier: string;
}

export function parseCommand(text: string): ParsedCommand | null {
	const trimmed = text.trim();

	const startWorkMatch = trimmed.match(/^\/start-work(?:\s+(.+))?$/im);
	if (startWorkMatch) {
		return { type: "start-work", planPath: startWorkMatch[1]?.trim() ?? "" };
	}

	if (/^\/new-session\b/im.test(trimmed)) {
		return { type: "new-session" };
	}

	const agentMatch = trimmed.match(/^\/agent\s+(\S+)/im);
	if (agentMatch) {
		return { type: "switch-agent", agent: agentMatch[1] };
	}

	if (/^\/abort\b/im.test(trimmed)) {
		return { type: "abort" };
	}

	return null;
}

function agentFromLabels(labels?: Array<{ name: string }> | null): string | null {
	if (!labels) return null;
	for (const label of labels) {
		const match = label.name.match(/^agent:(.+)$/i);
		if (match) {
			return match[1].toLowerCase();
		}
	}
	return null;
}

export function routeAgentSession(payload: AgentSessionWebhookPayload): AgentRouting {
	const session = payload.agentSession;
	const issue = session.issue;

	const issueId = issue?.id ?? session.id;
	const issueIdentifier = issue?.identifier ?? session.id;

	const commentBody = session.comment?.body ?? session.promptContext?.body ?? "";

	const command = commentBody ? parseCommand(commentBody) : null;

	const labelAgent = agentFromLabels(issue?.labels);
	const commandAgent = command?.type === "switch-agent" ? command.agent : null;

	let agent = config.defaultAgent;

	if (labelAgent) {
		agent = labelAgent;
	} else if (commandAgent) {
		agent = commandAgent;
	} else if (commentBody) {
		const inlineMatch = commentBody.match(/\/agent\s+(\S+)/i);
		if (inlineMatch) {
			agent = inlineMatch[1].toLowerCase();
		}
	}

	return {
		agent: resolveAgentName(agent),
		command: command ?? undefined,
		issueId,
		issueIdentifier,
	};
}
