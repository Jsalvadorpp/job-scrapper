import { db } from "@/lib/db";
import { blockedKeywords } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(blockedKeywords).orderBy(asc(blockedKeywords.keyword));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { keyword } = await req.json() as { keyword: string };
  if (!keyword?.trim()) {
    return NextResponse.json({ error: "keyword required" }, { status: 400 });
  }
  const [row] = await db
    .insert(blockedKeywords)
    .values({ keyword: keyword.trim().toLowerCase() })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json(row ?? { keyword: keyword.trim() }, { status: 201 });
}
