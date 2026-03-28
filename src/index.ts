import { Hono } from "hono";
import { loadAgentAliases, routeAgentSession } from "./agents/router.js";
import { config, logConfig } from "./config.js";
import { LinearActivities } from "./linear/activities.js";
import { handleOAuthAuthorize, handleOAuthCallback, storeToken } from "./linear/oauth.js";
import { getStoredToken } from "./linear/oauth.js";
import { parseWebhookPayload, verifyWebhookSignature } from "./linear/webhook.js";
import { OpenCodeClient } from "./opencode/client.js";
import { parseOpenCodeResponse } from "./opencode/output-parser.js";
import { type SessionMapping, SessionStore } from "./store/session-store.js";

const app = new Hono();
const sessionStore = new SessionStore();

app.get("/", (c) => {
	return c.json({ status: "ok", service: "agent-dispatch" });
});

app.get("/oauth/authorize", (c) => {
	const redirectUri = new URL("/oauth/callback", config.publicUrl).toString();
	return handleOAuthAuthorize(config.linearClientId, redirectUri);
});

app.get("/oauth/callback", async (c) => {
	const code = c.req.query("code");
	const orgId = c.req.query("state") ?? "default";

	if (!code) {
		return c.json({ error: "Missing code parameter" }, 400);
	}

	const redirectUri = new URL("/oauth/callback", config.publicUrl).toString();

	const tokenData = await handleOAuthCallback(
		code,
		config.linearClientId,
		config.linearClientSecret,
		redirectUri,
	);

	storeToken(orgId, tokenData);

	return c.json({ status: "ok", message: "OAuth complete. Token stored." });
});

app.post("/webhook", async (c) => {
	const rawBody = await c.req.text();
	const signature = c.req.header("Linear-Signature") ?? "";

	if (!verifyWebhookSignature(rawBody, signature, config.linearWebhookSecret)) {
		return c.json({ error: "Invalid signature" }, 401);
	}

	let bodyJson: unknown;
	try {
		bodyJson = JSON.parse(rawBody);
	} catch {
		return c.json({ error: "Invalid JSON" }, 400);
	}

	let payload: ReturnType<typeof parseWebhookPayload>;
	try {
		payload = parseWebhookPayload(bodyJson);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.log(`Skipping webhook: ${message}`);
		return c.json({ status: "ignored" });
	}

	const tokenData = getStoredToken(payload.organizationId);
	if (!tokenData) {
		console.error(`No token stored for organization: ${payload.organizationId}`);
		return c.json({ error: "No access token for this organization" }, 403);
	}

	const linearActivities = new LinearActivities(tokenData.access_token);
	const opencode = new OpenCodeClient(config.opencodeUrl, config.opencodePassword);
	const linearSessionId = payload.agentSession.id;

	// Send initial acknowledgment IMMEDIATELY (Linear requires response within 10s)
	try {
		if (payload.action === "created") {
			await linearActivities.sendThought(linearSessionId, "Analyzing issue...");
		}
	} catch (err) {
		console.error("Failed to send initial thought:", err);
	}

	const handleAsync = async () => {
		try {
			if (payload.action === "created") {
				const routing = routeAgentSession(payload);
				const { issueId, agent, command } = routing;

				const existing = await sessionStore.get(issueId);
				let opencodeSessionId: string;

				if (!existing) {
					const issue = payload.agentSession.issue;
					const title = issue ? `${issue.identifier}: ${issue.title}` : undefined;
					const created = await opencode.createSession(title);
					opencodeSessionId = created.id;
				} else {
					opencodeSessionId = existing.opencodeSessionId;
				}

				const now = new Date().toISOString();
				const mapping: SessionMapping = {
					opencodeSessionId,
					activeAgent: agent,
					linearAgentSessionId: linearSessionId,
					createdAt: existing?.createdAt ?? now,
					updatedAt: now,
				};
				await sessionStore.set(issueId, mapping);

				const issue = payload.agentSession.issue;
				let prompt = "";

				if (issue) {
					prompt = `Issue: ${issue.identifier} — ${issue.title}\n`;
					if (issue.description) {
						prompt += `\nDescription:\n${issue.description}\n`;
					}
				}

				if (command?.type === "start-work" && command.planPath) {
					prompt += `\nPlease start working on this issue. Follow the plan at: ${command.planPath}`;
				} else if (command?.type === "start-work") {
					prompt += "\nPlease start working on this issue.";
				} else {
					prompt += "\nPlease analyze this issue and provide your initial plan and response.";
				}

				const response = await opencode.sendMessage(opencodeSessionId, prompt, agent);
				const parsed = parseOpenCodeResponse(response);

				if (parsed.plan) {
					await linearActivities.updatePlan(linearSessionId, parsed.plan);
				}

				for (const activity of parsed.activities) {
					if (activity.type === "thought" && activity.body) {
						await linearActivities.sendThought(linearSessionId, activity.body);
					} else if (activity.type === "action" && activity.action) {
						await linearActivities.sendAction(
							linearSessionId,
							activity.action,
							activity.parameter,
							activity.result,
						);
					} else if (activity.type === "elicitation" && activity.body) {
						await linearActivities.sendElicitation(linearSessionId, activity.body);
					} else if (activity.type === "response" && activity.body) {
						await linearActivities.sendResponse(linearSessionId, activity.body);
					} else if (activity.type === "error" && activity.body) {
						await linearActivities.sendError(linearSessionId, activity.body);
					}
				}
			} else if (payload.action === "prompted") {
				const routing = routeAgentSession(payload);
				const { issueId, agent, command } = routing;
				const commentBody =
					payload.agentSession.comment?.body ?? payload.agentSession.promptContext?.body ?? "";

				if (command?.type === "abort") {
					const existing = await sessionStore.get(issueId);
					if (existing) {
						await opencode.abortSession(existing.opencodeSessionId);
						await linearActivities.sendThought(linearSessionId, "Session aborted.");
					}
					return;
				}

				if (command?.type === "new-session") {
					const issue = payload.agentSession.issue;
					const title = issue ? `${issue.identifier}: ${issue.title}` : undefined;
					const created = await opencode.createSession(title);
					const now = new Date().toISOString();
					await sessionStore.set(issueId, {
						opencodeSessionId: created.id,
						activeAgent: agent,
						linearAgentSessionId: linearSessionId,
						createdAt: now,
						updatedAt: now,
					});
					await linearActivities.sendThought(linearSessionId, "Started a new OpenCode session.");
					return;
				}

				const existing = await sessionStore.get(issueId);
				let opencodeSessionId: string;
				let activeAgent = agent;

				if (!existing) {
					const issue = payload.agentSession.issue;
					const title = issue ? `${issue.identifier}: ${issue.title}` : undefined;
					const created = await opencode.createSession(title);
					opencodeSessionId = created.id;
				} else {
					opencodeSessionId = existing.opencodeSessionId;
					activeAgent = command?.type === "switch-agent" ? command.agent : existing.activeAgent;
				}

				const now = new Date().toISOString();
				await sessionStore.set(issueId, {
					opencodeSessionId,
					activeAgent,
					linearAgentSessionId: linearSessionId,
					createdAt: existing?.createdAt ?? now,
					updatedAt: now,
				});

				const userMessage = commentBody || "Please continue with the current task.";
				const response = await opencode.sendMessage(opencodeSessionId, userMessage, activeAgent);
				const parsed = parseOpenCodeResponse(response);

				if (parsed.plan) {
					await linearActivities.updatePlan(linearSessionId, parsed.plan);
				}

				for (const activity of parsed.activities) {
					if (activity.type === "thought" && activity.body) {
						await linearActivities.sendThought(linearSessionId, activity.body);
					} else if (activity.type === "action" && activity.action) {
						await linearActivities.sendAction(
							linearSessionId,
							activity.action,
							activity.parameter,
							activity.result,
						);
					} else if (activity.type === "elicitation" && activity.body) {
						await linearActivities.sendElicitation(linearSessionId, activity.body);
					} else if (activity.type === "response" && activity.body) {
						await linearActivities.sendResponse(linearSessionId, activity.body);
					} else if (activity.type === "error" && activity.body) {
						await linearActivities.sendError(linearSessionId, activity.body);
					}
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const isConnectionError =
				message.includes("ECONNREFUSED") ||
				message.includes("fetch") ||
				message.includes("is not an object");
			const userMessage = isConnectionError
				? "OpenCode server is not reachable. Make sure `opencode serve` is running."
				: `Error: ${message}`;
			console.error(`Webhook handler error: ${message}`);
			try {
				await linearActivities.sendError(linearSessionId, userMessage);
			} catch {}
		}
	};

	handleAsync().catch((err) => {
		console.error("Background handler error:", err);
	});

	return c.json({ status: "accepted" });
});

logConfig(config);
await loadAgentAliases(config.opencodeUrl);
console.log(`Starting agent-dispatch on ${config.host}:${config.port}`);

export default {
	port: config.port,
	hostname: config.host,
	fetch: app.fetch,
};

export { app };
