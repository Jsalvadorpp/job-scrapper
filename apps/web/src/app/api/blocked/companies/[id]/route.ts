import { db } from "@/lib/db";
import { blockedCompanies } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(blockedCompanies).where(eq(blockedCompanies.id, parseInt(id, 10)));
  return NextResponse.json({ ok: true });
}
