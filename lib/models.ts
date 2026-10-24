import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TODO_STATUSES } from "@/lib/domain/status";

/**
 * Mongoose models. Import only from lib/repo/*: every read must apply the visibility rules there.
 * `deletedAt` is a root tombstone: only the deleted document itself carries it, descendants are
 * hidden through their parent (see lib/repo/visibility.ts).
 * `userId` is the owner: every repo query is scoped to it (documents created before login existed
 * have no userId until lib/repo/ownership.ts assigns them).
 */

const goalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

const weeklyPlanSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    weekStart: { type: String, required: true, index: true },
    goalId: { type: Schema.Types.ObjectId, ref: "Goal", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

const todoSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    status: { type: String, enum: TODO_STATUSES, default: "todo", required: true },
    date: { type: String, required: true },
    dueDate: { type: String, default: null },
    order: { type: Number, required: true },
    lastSeq: { type: Number, default: 0, required: true },
    weeklyPlanId: { type: Schema.Types.ObjectId, ref: "WeeklyPlan", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

/** GitHub account that logged in. The GitHub access token is never stored. */
const userSchema = new Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    username: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

/**
 * Server-side login session. Only the SHA-256 hash of the cookie token is stored, so a database
 * leak does not reveal usable tokens. MongoDB's TTL monitor removes documents after `expiresAt`.
 */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export type SessionDoc = InferSchemaType<typeof sessionSchema> & { _id: mongoose.Types.ObjectId };
export const User: Model<InferSchemaType<typeof userSchema>> =
  mongoose.models.User ?? mongoose.model("User", userSchema);
export const Session: Model<InferSchemaType<typeof sessionSchema>> =
  mongoose.models.Session ?? mongoose.model("Session", sessionSchema);

export type GoalDoc = InferSchemaType<typeof goalSchema> & { _id: mongoose.Types.ObjectId };
export type WeeklyPlanDoc = InferSchemaType<typeof weeklyPlanSchema> & { _id: mongoose.Types.ObjectId };
export type TodoDoc = InferSchemaType<typeof todoSchema> & { _id: mongoose.Types.ObjectId };

// Reuse compiled models across Next.js dev hot reloads.
export const Goal: Model<InferSchemaType<typeof goalSchema>> =
  mongoose.models.Goal ?? mongoose.model("Goal", goalSchema);
export const WeeklyPlan: Model<InferSchemaType<typeof weeklyPlanSchema>> =
  mongoose.models.WeeklyPlan ?? mongoose.model("WeeklyPlan", weeklyPlanSchema);
export const Todo: Model<InferSchemaType<typeof todoSchema>> =
  mongoose.models.Todo ?? mongoose.model("Todo", todoSchema);
