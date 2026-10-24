import { handleAuthed } from "@/lib/http";
import { listTrash } from "@/lib/repo/trash";

/** Purges roots deleted more than 30 days ago, then lists the remaining trash. */
export async function GET(req: Request) {
  return handleAuthed(req, (owner) => listTrash(owner));
}
