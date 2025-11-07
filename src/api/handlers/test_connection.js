import { jsonResponse } from "../../http/responses.js";
import { logger } from "../../logging.js";

export function buildTestConnectionHandler({ config, openai_client }) {
  return async function handler(_req) {
    try {
      const payload = {
        model: config.backend,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5,
        stream: false,
      };
      const res = await openai_client.create_chat_completion(payload, {});
      return jsonResponse({
        status: "success",
        message: `Successfully connected to ${config.provider} API`,
        model_used: config.model,
        timestamp: new Date().toISOString(),
        response_id: res?.id || "unknown",
      });
    } catch (e) {
      logger.error("API connectivity test failed:", e?.message || e);
      return jsonResponse(
        {
          status: "failed",
          error_type: "API Error",
          message: String(e?.message || e),
          timestamp: new Date().toISOString(),
          suggestions: [
            "Check your OPENAI_API_KEY is valid",
            "Verify your API key has the necessary permissions",
            "Check if you have reached rate limits",
          ],
        },
        { status: 503 },
      );
    }
  };
}