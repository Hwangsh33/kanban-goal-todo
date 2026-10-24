import mongoose from "mongoose";
import { afterAll, describe, expect, it } from "vitest";
import { connectDb } from "@/lib/db";
import { testDbUri } from "./helpers/mongo";

describe("smoke: lib/db.ts + mongodb-memory-server", () => {
  const savedUri = process.env.MONGODB_URI;
  afterAll(async () => {
    process.env.MONGODB_URI = savedUri;
    await mongoose.disconnect();
  });

  it("connects with MONGODB_URI, round-trips a document and reuses the cached connection", async () => {
    process.env.MONGODB_URI = testDbUri();
    const first = await connectDb();
    const second = await connectDb();
    expect(second).toBe(first);
    expect(mongoose.connection.readyState).toBe(1);

    const col = mongoose.connection.db!.collection("smoke");
    await col.insertOne({ hello: "world" });
    expect(await col.findOne({ hello: "world" })).toMatchObject({ hello: "world" });
    await mongoose.connection.dropDatabase();
  });

  it("reconnects after a disconnect and fails clearly when MONGODB_URI is missing", async () => {
    await mongoose.disconnect();
    delete process.env.MONGODB_URI;
    await expect(connectDb()).rejects.toThrow("MONGODB_URI");

    process.env.MONGODB_URI = testDbUri();
    await connectDb();
    expect(mongoose.connection.readyState).toBe(1);
    await mongoose.connection.dropDatabase();
  });
});
