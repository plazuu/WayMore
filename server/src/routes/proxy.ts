import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Request, RequestHandler, Response } from "express";
import {
  BACKEND_HEALTH_TIMEOUT_MS,
  backendUrl,
  NARRATION_PROXY_TIMEOUT_MS,
  PROXIED_PREFIXES,
  PROXY_TIMEOUT_MS,
} from "../config";

// Request headers not to forward: hop-by-hop, or recomputed by fetch.
const SKIP_REQUEST = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "content-length", "expect"]);
// Response headers not to copy back: hop-by-hop. fetch has already decoded
// any content-encoding, so that header and the encoded length are dropped too.
const SKIP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding"]);

function unavailable(res: Response, message: string) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(502).json({ error: "backend_unavailable", message });
}

function hasPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isProxied(path: string): boolean {
  return PROXIED_PREFIXES.some((p) => hasPrefix(path, p));
}

export function proxyTimeoutFor(path: string): number {
  return hasPrefix(path, "/narration") ? NARRATION_PROXY_TIMEOUT_MS : PROXY_TIMEOUT_MS;
}

/**
 * Forwards /tour, /audio, /dev and /narration to the backend service and streams the
 * response back unchanged (status, headers, body). Mount it before any body
 * parser so request bodies are streamed through untouched.
 */
export function backendProxy({ timeoutMs: override }: { timeoutMs?: number } = {}): RequestHandler {
  return async (req: Request, res: Response, next) => {
    if (!isProxied(req.path)) return next();
    const timeoutMs = override ?? proxyTimeoutFor(req.path);

    const target = `${backendUrl()}${req.originalUrl}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || SKIP_REQUEST.has(name)) continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const hasBody = !["GET", "HEAD"].includes(req.method);

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as unknown as BodyInit) : undefined,
        // Required by Node's fetch for streamed request bodies.
        ...(hasBody ? { duplex: "half" } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      } as RequestInit);
    } catch (err) {
      const e = err as Error;
      const reason = e.name === "TimeoutError" ? `no response within ${timeoutMs / 1000} s` : "not reachable";
      console.warn(`[proxy] ${req.method} ${req.originalUrl}: backend ${reason} (${e.message})`);
      unavailable(res, `The narration backend at ${backendUrl()} is ${reason}.`);
      return;
    }

    res.status(upstream.status);
    const decoded = upstream.headers.has("content-encoding");
    upstream.headers.forEach((value, name) => {
      if (SKIP_RESPONSE.has(name) || (decoded && name === "content-length")) return;
      res.setHeader(name, value);
    });
    if (!upstream.body || req.method === "HEAD") {
      res.end();
      return;
    }
    const body = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
    body.on("error", (err) => {
      console.warn(`[proxy] ${req.method} ${req.originalUrl}: stream failed (${err.message})`);
      unavailable(res, "The narration backend stopped responding mid-response.");
    });
    body.pipe(res);
  };
}

export interface BackendHealth {
  url: string;
  reachable: boolean;
  llm?: unknown;
  tts?: unknown;
  error?: string;
}

/** The backend's /health, summarised for the server's own /health. Never throws. */
export async function backendHealth(): Promise<BackendHealth> {
  const url = backendUrl();
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(BACKEND_HEALTH_TIMEOUT_MS) });
    if (!res.ok) return { url, reachable: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { llm?: unknown; tts?: unknown };
    return { url, reachable: true, llm: body.llm, tts: body.tts };
  } catch (err) {
    return { url, reachable: false, error: (err as Error).message };
  }
}
