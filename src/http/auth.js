import { httpError } from "./errors.js";
import { logger } from "../logging.js";

export function getClientBearer(req) {
  const x = req.headers.get("x-api-key");
  if (x) return x;
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export function requireClientAuth(req, config) {
  if (!config.tokens || Object.keys(config.tokens).length === 0) return; // skip
  const key = getClientBearer(req);
  if (!key || !config.validate_client_api_key(key)) {
    logger.warn("Invalid API key provided by client");
    throw httpError(401, "Invalid API key. Please provide a valid Bearer token.");
  }
}