import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, inject } from "vitest";

/** Connection string pointing at a fresh, file-private database on the shared in-memory mongod. */
export function testDbUri(): string {
  const base = inject("mongoUri").replace(/\/?$/, "/");
  return `${base}test_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Registers hooks that connect mongoose (via lib/db.ts, using MONGODB_URI) to a private test
 * database, wipe all collections after each test and drop the database at the end.
 */
export function setupTestDb(): void {
  beforeAll(async () => {
    process.env.MONGODB_URI = testDbUri();
    const { connectDb } = await import("@/lib/db");
    await connectDb();
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}
