import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("DB access only through lib/repo/*", () => {
  const appFiles = sourceFiles(path.join(root, "app"));

  it("finds the API route files", () => {
    expect(appFiles.some((f) => f.endsWith(path.join("api", "todos", "route.ts")))).toBe(true);
  });

  it("app/ never imports models or mongoose and never calls Model.find & co. directly", () => {
    const offenders = appFiles.filter((file) => {
      const src = readFileSync(file, "utf8");
      return (
        /from\s+["']@\/lib\/models["']/.test(src) ||
        /from\s+["']mongoose["']/.test(src) ||
        /\b(Goal|WeeklyPlan|Todo)\.(find|findOne|findById|aggregate|countDocuments|distinct|updateOne|updateMany|deleteMany)\(/.test(src)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("models are imported only by lib/repo/* (and tests)", () => {
    const libFiles = sourceFiles(path.join(root, "lib")).filter(
      (f) => !f.includes(`${path.sep}repo${path.sep}`) && !f.endsWith("models.ts"),
    );
    const offenders = libFiles.filter((f) => /from\s+["']@\/lib\/models["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
