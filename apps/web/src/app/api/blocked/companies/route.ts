import { db } from "@/lib/db";
import { blockedCompanies } from "@/lib/schema";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(blockedCompanies).orderBy(asc(blockedCompanies.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name } = await req.json() as { name: string };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const [row] = await db
    .insert(blockedCompanies)
    .values({ name: name.trim() })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json(row ?? { name: name.trim() }, { status: 201 });
}
