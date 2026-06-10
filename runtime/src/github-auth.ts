import crypto from "node:crypto";

export type GitHubAuthMode = "app" | "pat" | "actions";

export interface GitHubAuthResult {
  token: string;
  mode: GitHubAuthMode;
  expires_at?: string;
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function signAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKeyPem);
  return `${signingInput}.${base64Url(signature)}`;
}

async function fetchInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string
): Promise<GitHubAuthResult> {
  const jwt = signAppJwt(appId, privateKey);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub App installation token failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as { token: string; expires_at?: string };
  return { token: data.token, mode: "app", expires_at: data.expires_at };
}

/**
 * Resolve GitHub token: App installation → PAT → Actions GITHUB_TOKEN.
 */
export async function resolveGitHubToken(): Promise<GitHubAuthResult> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && privateKeyRaw && installationId) {
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    return fetchInstallationToken(appId, privateKey, installationId);
  }

  const pat = process.env.GH_PAT ?? process.env.GITHUB_PAT;
  if (pat) {
    return { token: pat, mode: "pat" };
  }

  const actionsToken = process.env.GITHUB_TOKEN;
  if (actionsToken) {
    return { token: actionsToken, mode: "actions" };
  }

  throw new Error(
    "GitHub auth required: set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID, or GH_PAT, or GITHUB_TOKEN"
  );
}