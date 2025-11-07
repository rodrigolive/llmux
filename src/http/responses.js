import { httpError } from "./errors.js";

export function jsonResponse(obj, init = {}) {
  return Response.json(obj, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      ...init.headers,
    },
    status: init.status || 200,
  });
}

export function sseEvent(name, dataObj) {
  return `event: ${name}\ndata: ${JSON.stringify(dataObj)}\n\n`;
}

export function sseDataLine(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export function sseResponse(streamer) {
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamer) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      } catch (e) {
        // already logged upstream
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
    },
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

export function parseURL(req) {
  const url = new URL(req.url);
  return { url, path: url.pathname, searchParams: url.searchParams };
}

export async function readJSON(req) {
  try {
    return await req.json();
  } catch {
    throw httpError(400, "Invalid JSON");
  }
}