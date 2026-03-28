import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface TokenData {
	access_token: string;
	refresh_token: string;
	expires_at: number;
}

type TokenStore = Record<string, TokenData>;

const TOKEN_STORE_PATH = "./data/tokens.json";

function ensureDir(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function readTokenStore(): TokenStore {
	if (!existsSync(TOKEN_STORE_PATH)) {
		return {};
	}
	try {
		const raw = readFileSync(TOKEN_STORE_PATH, "utf-8");
		return JSON.parse(raw) as TokenStore;
	} catch {
		return {};
	}
}

function writeTokenStore(store: TokenStore): void {
	ensureDir(TOKEN_STORE_PATH);
	writeFileSync(TOKEN_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function getStoredToken(key: string): TokenData | null {
	const store = readTokenStore();
	return store[key] ?? store.default ?? null;
}

export function getTokenForApp(oauthClientId: string, organizationId: string): TokenData | null {
	const store = readTokenStore();
	return store[`app:${oauthClientId}`] ?? store[organizationId] ?? store.default ?? null;
}

export function storeToken(key: string, data: TokenData): void {
	const store = readTokenStore();
	store[key] = data;
	writeTokenStore(store);
}

export function handleOAuthAuthorize(clientId: string, redirectUri: string): Response {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "read,write,app:assignable,app:mentionable",
		actor: "app",
	});
	const url = `https://linear.app/oauth/authorize?${params.toString()}`;
	return Response.redirect(url, 302);
}

export async function handleOAuthCallback(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string,
): Promise<TokenData> {
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uri: redirectUri,
	});

	const response = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`OAuth token exchange failed (${response.status}): ${text}`);
	}

	const json = (await response.json()) as Record<string, unknown>;

	const accessToken = json.access_token;
	const refreshToken = json.refresh_token;
	const expiresIn = json.expires_in;

	if (typeof accessToken !== "string") {
		throw new Error("OAuth response missing access_token");
	}
	if (typeof refreshToken !== "string") {
		throw new Error("OAuth response missing refresh_token");
	}

	const expiresAt = Date.now() + (typeof expiresIn === "number" ? expiresIn * 1000 : 3600 * 1000);

	return {
		access_token: accessToken,
		refresh_token: refreshToken,
		expires_at: expiresAt,
	};
}
