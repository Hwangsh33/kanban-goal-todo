import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(path.resolve(import.meta.dirname, "../../README.md"), "utf8");

describe("README GitHub login guide", () => {
  it("explains the OAuth App fields, every variable, migration and logout", () => {
    for (const text of [
      "Homepage URL",
      "Authorization callback URL",
      "{APP_BASE_URL}/auth/github/callback",
      ".env.local",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "APP_BASE_URL",
      "LEGACY_OWNER_GITHUB_ID",
      "GITHUB_OAUTH_BASE_URL",
      "GITHUB_API_BASE_URL",
      "npm run migrate:owner",
      "Secure",
      "https",
      "POST /auth/logout",
      "세션 문서를 삭제",
      "쿠키를 만료",
    ]) {
      expect({ text, found: readme.includes(text) }).toEqual({ text, found: true });
    }
  });

  it("explains the numeric GitHub id for the legacy claim, how to look it up, and removing it afterwards", () => {
    for (const text of [
      "https://api.github.com/users/<login>",
      '"id"',
      "npm run migrate:owner -- <github-id>",
      "귀속이 끝나면 `LEGACY_OWNER_GITHUB_ID` 를 삭제",
    ]) {
      expect({ text, found: readme.includes(text) }).toEqual({ text, found: true });
    }
    expect(readme).not.toContain("LEGACY_OWNER_GITHUB_LOGIN");
    expect(readme).not.toContain("<github-login>");
  });

  it("documents the production https requirement and the E2E-only ALLOW_INSECURE_OAUTH_URLS escape", () => {
    expect(readme).toContain("ALLOW_INSECURE_OAUTH_URLS");
    expect(readme).toContain("프로덕션에서는 https");
  });
});
