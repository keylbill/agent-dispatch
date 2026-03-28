import type { Part, TextPart, ToolPart } from "@opencode-ai/sdk";
import type { AgentPlanStep } from "../linear/types.js";
import type { OpenCodeResponse } from "./client.js";

export interface LinearActivityItem {
	type: "thought" | "action" | "elicitation" | "response" | "error";
	body?: string;
	action?: string;
	parameter?: string;
	result?: string;
}

export interface ParsedOutput {
	activities: LinearActivityItem[];
	plan?: AgentPlanStep[];
}

function isTextPart(part: Part): part is TextPart {
	return part.type === "text";
}

function isToolPart(part: Part): part is ToolPart {
	return part.type === "tool";
}

function looksLikeQuestion(text: string): boolean {
	const trimmed = text.trim();
	return (
		trimmed.endsWith("?") ||
		/should i/i.test(trimmed) ||
		/do you want/i.test(trimmed) ||
		/would you like/i.test(trimmed) ||
		/can you (please |kindly )?confirm/i.test(trimmed) ||
		/please (let me know|clarify|specify)/i.test(trimmed)
	);
}

function looksLikeError(text: string): boolean {
	const lower = text.toLowerCase();
	return (
		lower.startsWith("error:") ||
		lower.startsWith("failed:") ||
		lower.includes("an error occurred") ||
		lower.includes("something went wrong")
	);
}

function extractToolActivities(parts: Part[]): LinearActivityItem[] {
	const activities: LinearActivityItem[] = [];

	for (const part of parts) {
		if (!isToolPart(part)) continue;

		const toolState = part.state;
		const toolName = part.tool;

		if (toolState.status === "running") {
			activities.push({
				type: "thought",
				body: `Running ${toolName}${toolState.title ? `: ${toolState.title}` : ""}`,
			});
		} else if (toolState.status === "completed") {
			activities.push({
				type: "action",
				action: toolName,
				result:
					toolState.output.length > 200 ? `${toolState.output.slice(0, 200)}...` : toolState.output,
			});
		} else if (toolState.status === "error") {
			activities.push({
				type: "thought",
				body: `Tool ${toolName} failed: ${toolState.error}`,
			});
		}
	}

	return activities;
}

export function parseOpenCodeResponse(response: OpenCodeResponse): ParsedOutput {
	const activities: LinearActivityItem[] = [];

	const toolActivities = extractToolActivities(response.parts);
	if (toolActivities.length > 0) {
		activities.push(...toolActivities);
	}

	const textParts = response.parts.filter(isTextPart);
	const fullText = textParts
		.filter((p) => !p.synthetic && !p.ignored)
		.map((p) => p.text)
		.join("\n")
		.trim();

	if (fullText.length === 0) {
		return {
			activities: activities.length > 0 ? activities : [{ type: "thought", body: "Processing..." }],
		};
	}

	if (looksLikeError(fullText)) {
		activities.push({ type: "error", body: fullText });
	} else if (looksLikeQuestion(fullText)) {
		activities.push({ type: "elicitation", body: fullText });
	} else {
		activities.push({ type: "response", body: fullText });
	}

	if (response.info.error) {
		const errData = response.info.error.data as Record<string, unknown>;
		const errMsg = typeof errData.message === "string" ? errData.message : "An error occurred";
		activities.push({ type: "error", body: errMsg });
	}

	return { activities };
}
