/**
 * Minimal HTTP server for Slack Events API → channel-receive.
 * Use with ngrok: ngrok http 3000 → set Request URL to https://xxx.ngrok.io/slack/events
 */

import http from "node:http";
import { processChannelInbound } from "./channels/orchestrator.js";

export interface SlackEventsServerOpts {
  port?: number;
  projectDir: string;
  path?: string;
}

export function startSlackEventsServer(opts: SlackEventsServerOpts): http.Server {
  const listenPath = opts.path ?? "/slack/events";
  const port = opts.port ?? 3000;

  const server = http.createServer(async (req, res) => {
    if (req.url !== listenPath || req.method !== "POST") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k] = Array.isArray(v) ? v[0] : v;
    }

    try {
      const rawPayload = JSON.parse(rawBody);
      const batch = await processChannelInbound({
        projectDir: opts.projectDir,
        provider: "slack",
        rawPayload,
        rawBody,
        headers,
        sendReply: true,
      });

      if (batch.challenge) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(batch.challenge);
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, results: batch.results.length }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[slack-events-server]", msg);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: msg }));
    }
  });

  server.listen(port, () => {
    console.error(`Slack events server listening on http://127.0.0.1:${port}${listenPath}`);
    console.error(`PROJECT_DIR=${opts.projectDir}`);
    console.error("Set Slack Request URL to https://YOUR-NGROK-URL/slack/events");
  });

  return server;
}
