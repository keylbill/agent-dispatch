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
	};
}

export const config: Config = loadConfig();

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
		sessionStorePath: cfg.sessionStorePath,
	});
}
