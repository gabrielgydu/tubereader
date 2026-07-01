import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const channel = db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, parseInt(id)))
    .get();
  if (!channel) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(channel);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  db.delete(schema.channels)
    .where(eq(schema.channels.id, parseInt(id)))
    .run();
  return NextResponse.json({ ok: true });
}
