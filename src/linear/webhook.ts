import { createHmac } from "node:crypto";
import type { AgentSessionWebhookPayload } from "./types.js";

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
	const hmac = createHmac("sha256", secret);
	hmac.update(body);
	const computed = hmac.digest("hex");
	return computed === signature;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWebhookPayload(body: unknown): AgentSessionWebhookPayload {
	if (!isRecord(body)) {
		throw new Error("Webhook payload must be an object");
	}

	if (body.type !== "AgentSessionEvent") {
		throw new Error(`Unexpected webhook type: ${String(body.type)}`);
	}

	const action = body.action;
	if (action !== "created" && action !== "prompted") {
		throw new Error(`Unexpected webhook action: ${String(action)}`);
	}

	if (typeof body.organizationId !== "string") {
		throw new Error("Missing organizationId in webhook payload");
	}

	if (typeof body.oauthClientId !== "string") {
		throw new Error("Missing oauthClientId in webhook payload");
	}

	if (typeof body.appUserId !== "string") {
		throw new Error("Missing appUserId in webhook payload");
	}

	if (!isRecord(body.agentSession)) {
		throw new Error("Missing agentSession in webhook payload");
	}

	const session = body.agentSession;
	if (typeof session.id !== "string") {
		throw new Error("Missing agentSession.id in webhook payload");
	}

	return body as unknown as AgentSessionWebhookPayload;
}
