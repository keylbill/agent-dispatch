export interface AgentSessionIssue {
	id: string;
	identifier: string;
	title: string;
	description?: string | null;
	team?: {
		id: string;
		name: string;
		key: string;
	} | null;
	labels?: Array<{
		id: string;
		name: string;
	}> | null;
}

export interface AgentSessionComment {
	id: string;
	body: string;
}

export interface AgentSessionPromptContext {
	body?: string | null;
	bodyData?: Record<string, unknown> | null;
}

export interface AgentSession {
	id: string;
	issue?: AgentSessionIssue | null;
	comment?: AgentSessionComment | null;
	promptContext?: AgentSessionPromptContext | null;
}

export interface AgentSessionWebhookPayload {
	type: "AgentSessionEvent";
	action: "created" | "prompted";
	organizationId: string;
	oauthClientId: string;
	appUserId: string;
	agentSession: AgentSession;
}

export interface AgentActivityThoughtContent {
	type: "thought";
	body: string;
}

export interface AgentActivityActionContent {
	type: "action";
	action: string;
	parameter?: string;
	result?: string;
}

export interface AgentActivityElicitationContent {
	type: "elicitation";
	body: string;
}

export interface AgentActivityResponseContent {
	type: "response";
	body: string;
}

export interface AgentActivityErrorContent {
	type: "error";
	body: string;
}

export type AgentActivityContent =
	| AgentActivityThoughtContent
	| AgentActivityActionContent
	| AgentActivityElicitationContent
	| AgentActivityResponseContent
	| AgentActivityErrorContent;

export interface AgentPlanStep {
	content: string;
	status: "pending" | "inProgress" | "completed" | "canceled";
}
