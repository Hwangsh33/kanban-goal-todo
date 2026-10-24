import type { Metadata } from "next";
import { TrashView } from "@/components/TrashView";
import { requirePageUser } from "@/lib/auth/page";

export const metadata: Metadata = { title: "휴지통 · 칸반 목표 할 일" };

export default async function TrashPage() {
  await requirePageUser();
  return (
    <>
      <h1>휴지통</h1>
      <TrashView />
    </>
  );
}
