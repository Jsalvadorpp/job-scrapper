import { db } from "@/lib/db";
import { jobs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);

  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json() as { status: string | null };
  const status = body.status ?? null;

  // Only allow valid status values
  const valid = [null, "applied", "dismissed"];
  if (!valid.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await db.update(jobs).set({ status }).where(eq(jobs.id, jobId));
  return NextResponse.json({ ok: true });
}
