import { jsonResponse } from "../../http/responses.js";

export function buildRootHandler({ config }) {
  return async function handler(_req) {
    return jsonResponse({
      message: "Claude-to-OpenAI API Proxy v1.0.0",
      status: "running",
      config: {
        backend: config.backend,
        provider: config.provider,
        model: config.model,
        max_tokens_limit: config.max_tokens_limit,
        client_api_key_validation: !!(config.tokens && Object.keys(config.tokens).length),
      },
      endpoints: {
        messages: "/v1/messages",
        count_tokens: "/v1/messages/count_tokens",
        health: "/health",
        test_connection: "/test-connection",
      },
    });
  };
}