import { isValidElement, type ReactElement, type ReactNode } from "react";
import mongoose from "mongoose";
import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import { Sidebar } from "@/components/Sidebar";
import { connectDb } from "@/lib/db";

// The real session lookup (DB) is covered in pages.test.ts; here it is made to fail on demand.
const lookup = vi.hoisted(() => ({ impl: async (): Promise<unknown> => null }));
vi.mock("@/lib/auth/page", () => ({ getPageUser: () => lookup.impl() }));

afterEach(() => {
  lookup.impl = async () => null;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** The Sidebar element the layout renders (its `user` prop decides logged-in vs logged-out shell). */
function findSidebar(node: ReactNode): ReactElement<{ user: unknown }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSidebar(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === Sidebar) return node as ReactElement<{ user: unknown }>;
  return findSidebar(node.props.children);
}

const renderLayout = () => RootLayout({ children: "page", params: Promise.resolve({}) } as LayoutProps<"/">);

describe("root layout when the user lookup fails (DB outage, M2)", () => {
  it("renders the logged-out shell instead of failing every page (incl. /login)", async () => {
    lookup.impl = async () => {
      throw new Error("MongoServerSelectionError: connect ECONNREFUSED secret-db.internal:27017");
    };
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    const tree = await renderLayout();
    const sidebar = findSidebar(tree);
    expect(sidebar).not.toBeNull();
    expect(sidebar!.props.user).toBeNull();

    // Not swallowed silently: one fixed message, without the error's details.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("사용자 정보를 불러오지 못했습니다");
    expect(errors[0]).not.toContain("secret-db");
    expect(errors[0]).not.toContain("ECONNREFUSED");
  });

  it("still passes the logged-in user (username/avatar only) when the lookup works", async () => {
    lookup.impl = async () => ({ id: "u1", githubId: 1, username: "octocat", avatarUrl: "https://a.example/x.png" });
    const sidebar = findSidebar(await renderLayout());
    expect(sidebar!.props.user).toEqual({ username: "octocat", avatarUrl: "https://a.example/x.png" });
  });

  it("does not swallow Next.js control-flow errors (e.g. redirect)", async () => {
    lookup.impl = async () => redirect("/login");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(renderLayout()).rejects.toThrow("NEXT_REDIRECT");
    expect(error).not.toHaveBeenCalled();
  });
});

describe("connectDb fails fast when MongoDB is unreachable", () => {
  it("passes serverSelectionTimeoutMS: 5000 and forgets the failed attempt", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:1/unreachable");
    const connect = vi.spyOn(mongoose, "connect").mockRejectedValue(new Error("server selection timed out"));
    await expect(connectDb()).rejects.toThrow("server selection timed out");
    expect(connect).toHaveBeenCalledWith(
      "mongodb://127.0.0.1:1/unreachable",
      expect.objectContaining({ serverSelectionTimeoutMS: 5000, bufferCommands: false }),
    );
    // The rejected promise is not cached: the next request tries again.
    await expect(connectDb()).rejects.toThrow();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
