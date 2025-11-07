import { jsonResponse } from "../../http/responses.js";

export function buildHealthHandler({ config }) {
  return async function handler(_req) {
    return jsonResponse({
      status: "healthy",
      timestamp: new Date().toISOString(),
      api_key_valid: config.validate_api_key(),
      client_api_key_validation: !!(config.tokens && Object.keys(config.tokens).length),
    });
  };
}