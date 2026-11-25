// A route's answer as a live stream of events — one JSON object per line
// (NDJSON) — so the page can show each marketplace's progress while a
// search is still running, instead of a blank wait. Server-only.
//
//   return ndjson(async (send) => { send({ type: 'progress', … }); … send({ type: 'result', data }) })
//
// The page (lib/research/apiClient.js streamRequest) reads:
//   { type: 'plan' | 'progress', … }  — shown as it arrives
//   { type: 'result', data }          — the answer (same shape as a JSON route's)
//   { type: 'error', status, error, … } — the answer when it failed
// Anything `run` throws becomes an 'error' event; the stream always closes.
export function ndjson(run) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the page went away — keep working, stop writing
        }
      };
      try {
        await run(send);
      } catch (err) {
        console.error('[research] stream failed:', err);
        send({ type: 'error', status: 500, error: 'Something went wrong on our side — try again in a moment.' });
      }
      if (open) controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
