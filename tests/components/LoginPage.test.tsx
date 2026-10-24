// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

// The session lookup is covered against a real DB in tests/auth/pages.test.ts; here it is stubbed.
const auth = vi.hoisted(() => ({ user: null as null | { id: string; username: string; avatarUrl: string } }));
vi.mock("@/lib/auth/page", () => ({ getPageUser: async () => auth.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

beforeEach(() => {
  auth.user = null;
});
afterEach(cleanup);

const renderLogin = async (searchParams: Record<string, string | string[] | undefined> = {}) =>
  render(await LoginPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) } as PageProps<"/login">));

describe("/login page", () => {
  it("shows a heading and a 'GitHub 로 로그인' link to /auth/github, without an error message", async () => {
    await renderLogin();
    expect(screen.getByRole("heading", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "GitHub 로 로그인" }).getAttribute("href")).toBe("/auth/github");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["denied", "GitHub 로그인이 취소되었습니다. 다시 시도해 주세요."],
    ["state", "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요."],
    ["github", "GitHub 와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."],
  ])("shows the Korean message for ?error=%s", async (error, message) => {
    await renderLogin({ error });
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.getByRole("link", { name: "GitHub 로 로그인" })).toBeTruthy();
  });

  it("ignores unknown or repeated error codes (no message, nothing echoed)", async () => {
    await renderLogin({ error: "<script>alert(1)</script>" });
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    await renderLogin({ error: ["denied", "state"] });
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    await renderLogin({ error: "constructor" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("redirects an already logged-in user to /", async () => {
    auth.user = { id: "u1", username: "octocat", avatarUrl: "" };
    await expect(renderLogin({ error: "denied" })).rejects.toThrow("REDIRECT:/");
  });
});
