function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function optionalEnv(name: string, defaultValue: string): string {
	return process.env[name] ?? defaultValue;
}

export interface AppConfig {
	clientId: string;
	clientSecret: string;
	webhookSecret: string;
	defaultAgent: string;
}

export interface Config {
	linearClientId: string;
	linearClientSecret: string;
	linearWebhookSecret: string;
	opencodeUrl: string;
	port: number;
	host: string;
	publicUrl: string;
	opencodePassword: string | undefined;
	defaultAgent: string;
	sessionStorePath: string;
	apps: Record<string, AppConfig>;
	executorAgent: string;
}

function parseApps(): Record<string, AppConfig> {
	const raw = process.env.AGENT_APPS;
	if (!raw) return {};
	try {
		return JSON.parse(raw) as Record<string, AppConfig>;
	} catch {
		return {};
	}
}

function loadConfig(): Config {
	return {
		linearClientId: requireEnv("LINEAR_CLIENT_ID"),
		linearClientSecret: requireEnv("LINEAR_CLIENT_SECRET"),
		linearWebhookSecret: requireEnv("LINEAR_WEBHOOK_SECRET"),
		opencodeUrl: requireEnv("OPENCODE_URL"),
		port: Number.parseInt(optionalEnv("PORT", "3001"), 10),
		host: optionalEnv("HOST", "0.0.0.0"),
		publicUrl: optionalEnv("PUBLIC_URL", `http://localhost:${optionalEnv("PORT", "3001")}`),
		opencodePassword: process.env.OPENCODE_PASSWORD || undefined,
		defaultAgent: optionalEnv("DEFAULT_AGENT", "Sisyphus (Ultraworker)"),
		sessionStorePath: optionalEnv("SESSION_STORE_PATH", "./data/sessions.json"),
		apps: parseApps(),
		executorAgent: optionalEnv("EXECUTOR_AGENT", "Atlas (Plan Executor)"),
	};
}

export const config: Config = loadConfig();

export function getAppByClientId(clientId: string): AppConfig | null {
	return config.apps[clientId] ?? null;
}

export function getAllWebhookSecrets(): string[] {
	const secrets = [config.linearWebhookSecret];
	for (const app of Object.values(config.apps)) {
		if (app.webhookSecret && !secrets.includes(app.webhookSecret)) {
			secrets.push(app.webhookSecret);
		}
	}
	return secrets;
}

export function logConfig(cfg: Config): void {
	console.log("Config loaded:", {
		linearClientId: `${cfg.linearClientId.slice(0, 8)}...`,
		linearClientSecret: "[redacted]",
		linearWebhookSecret: "[redacted]",
		publicUrl: cfg.publicUrl,
		opencodeUrl: cfg.opencodeUrl,
		port: cfg.port,
		host: cfg.host,
		opencodePassword: cfg.opencodePassword ? "[redacted]" : undefined,
		defaultAgent: cfg.defaultAgent,
		executorAgent: cfg.executorAgent,
		apps: Object.keys(cfg.apps).length > 0 ? cfg.apps : "none (single-app mode)",
		sessionStorePath: cfg.sessionStorePath,
	});
}
