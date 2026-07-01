import { getOrchestrator } from "@/lib/pipeline/orchestrator";
import type { PipelineEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  const orchestrator = getOrchestrator();

  const stream = new ReadableStream({
    start(controller) {
      function onEvent(event: PipelineEvent) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // stream closed
        }
      }

      orchestrator.on("pipeline", onEvent);

      // Send initial keepalive
      controller.enqueue(encoder.encode(": keepalive\n\n"));

      // Keepalive every 30s
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(interval);
        }
      }, 30_000);

      // Cleanup when client disconnects
      const cleanup = () => {
        orchestrator.off("pipeline", onEvent);
        clearInterval(interval);
      };

      // AbortSignal not directly available, but controller.close handles it
      controller.enqueue(encoder.encode("")); // test if still open
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
