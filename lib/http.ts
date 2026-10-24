import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { connectDb } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { AppError, badRequest } from "@/lib/errors";
import type { OwnerId } from "@/lib/repo/visibility";

/** Wraps a route handler: connects to MongoDB and maps errors to JSON `{ error }` responses. */
export async function handle(fn: () => Promise<unknown>, successStatus = 200): Promise<Response> {
  try {
    await connectDb();
    const body = await fn();
    return NextResponse.json(body, { status: successStatus });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, ...err.details }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "요청이 올바르지 않습니다" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

/**
 * Like handle(), but first requires a logged-in user (401 `{ error }` otherwise) and passes the
 * user's id to `fn`. The owner always comes from the session cookie, never from the request body.
 */
export async function handleAuthed(
  req: Request,
  fn: (owner: OwnerId) => Promise<unknown>,
  successStatus = 200,
): Promise<Response> {
  return handle(async () => fn((await requireUser(req)).id), successStatus);
}

/** Reads and validates a JSON body; invalid JSON or schema violations become 400 errors. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("요청 본문이 올바른 JSON이 아닙니다");
  }
  return schema.parse(raw ?? {});
}
