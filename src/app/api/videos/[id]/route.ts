import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getOrchestrator } from "@/lib/pipeline/orchestrator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, parseInt(id)))
    .get();

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(video);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  db.delete(schema.videos)
    .where(eq(schema.videos.id, parseInt(id)))
    .run();
  return NextResponse.json({ ok: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);

  if (url.pathname.endsWith("/retry")) {
    const video = db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.id, parseInt(id)))
      .get();

    if (!video) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    db.update(schema.videos)
      .set({ status: "pending", error_message: null })
      .where(eq(schema.videos.id, parseInt(id)))
      .run();

    const orchestrator = getOrchestrator();
    orchestrator.enqueue(parseInt(id));

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (typeof body.read === "boolean") {
    db.update(schema.videos)
      .set({ read_at: body.read ? new Date().toISOString() : null })
      .where(eq(schema.videos.id, parseInt(id)))
      .run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}
