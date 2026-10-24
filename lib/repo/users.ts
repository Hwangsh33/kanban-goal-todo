import { createHash, randomBytes } from "node:crypto";
import { Session, User, type UserDoc } from "@/lib/models";
import type { OwnerId } from "./visibility";

/** How long a login lasts; the cookie gets the same lifetime. */
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type GithubProfile = { githubId: number; username: string; avatarUrl: string };
/** `githubId` is GitHub's immutable numeric id (unique); `username` is display-only and may change. */
export type SessionUser = { id: OwnerId; githubId: number; username: string; avatarUrl: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toSessionUser = (u: UserDoc): SessionUser => ({
  id: u._id,
  githubId: u.githubId,
  username: u.username,
  avatarUrl: u.avatarUrl ?? "",
});

/** Creates the user on first login and refreshes username/avatar on later logins (keyed by GitHub id). */
export async function upsertGithubUser(profile: GithubProfile): Promise<SessionUser> {
  const user = await User.findOneAndUpdate(
    { githubId: profile.githubId },
    { $set: { username: profile.username, avatarUrl: profile.avatarUrl } },
    { upsert: true, returnDocument: "after" },
  ).lean<UserDoc>();
  return toSessionUser(user!);
}

/** The user with this GitHub numeric id (the unique, immutable identity key), or null. */
export async function findUserByGithubId(githubId: number): Promise<SessionUser | null> {
  const user = await User.findOne({ githubId }).lean<UserDoc>();
  return user ? toSessionUser(user) : null;
}

/**
 * Starts a session: a fresh random 32-byte token for the cookie, only its SHA-256 hash in the DB.
 * Called on every login, so a token planted before login is never promoted (no session fixation).
 */
export async function createSession(userId: OwnerId, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** The user of a valid, unexpired session token, or null. */
export async function findSessionUser(token: string, now: Date = new Date()): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now } }).lean();
  if (!session) return null;
  const user = await User.findById(session.userId).lean<UserDoc>();
  return user ? toSessionUser(user) : null;
}

/** Deletes the session document of the token (logout). Unknown tokens are a no-op. */
export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await Session.deleteOne({ tokenHash: hashToken(token) });
}
