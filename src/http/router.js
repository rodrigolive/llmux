import { optionsResponse, jsonResponse } from "./responses.js";

export function createRouter(handlers) {
  return async function dispatch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "OPTIONS") return optionsResponse();

    if (req.method === "GET" && path === "/") return handlers.root(req);
    if (req.method === "GET" && path === "/health") return handlers.health(req);
    if (req.method === "GET" && path === "/test-connection") return handlers.testConnection(req);

    if (req.method === "POST" && path === "/v1/messages") return handlers.messages(req);
    if (req.method === "POST" && path === "/v1/messages/count_tokens") return handlers.countTokens(req);

    return jsonResponse({ error: "Not Found" }, { status: 404 });
  };
}