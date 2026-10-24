import mongoose from "mongoose";

type MongooseCache = { promise: Promise<typeof mongoose> | null };

// Cached on globalThis so Next.js dev hot reloads reuse one connection instead of opening new ones.
const globalForMongoose = globalThis as typeof globalThis & { __mongooseCache?: MongooseCache };
const cache: MongooseCache = (globalForMongoose.__mongooseCache ??= { promise: null });

export async function connectDb(): Promise<typeof mongoose> {
  // A previous connection was closed: forget the stale promise and connect again.
  if (mongoose.connection.readyState === 0) cache.promise = null;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다");
    // Fail fast (5 s instead of the driver's 30 s) when MongoDB is unreachable.
    cache.promise = mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 5000 });
  }

  try {
    return await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }
}
