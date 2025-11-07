import { requireClientAuth } from "../../http/auth.js";
import { readJSON, jsonResponse, sseResponse } from "../../http/responses.js";
import { httpError } from "../../http/errors.js";
import { logger } from "../../logging.js";
import { convert_claude_to_openai } from "../../conversion/claude_to_openai.js";
import { convert_openai_to_claude_response } from "../../conversion/openai_to_claude.js";
import { isResponsesAPI } from "../../provider/openai_client.js";
import { countTokensFast } from "../../tokenize/tiktoken.js";
import { log_request_beautifully } from "../../logging.js";

export function buildMessagesHandler({ config, model_manager, openai_client }) {
  return async function handler(req) {
    requireClientAuth(req, config);
    const body = await readJSON(req);
    logger.debug(`Processing Claude request: model=${body?.model} , stream=${!!body?.stream}`);

    const request_id = crypto.randomUUID();

    // convert Claude -> OpenAI request
    const openai_request = convert_claude_to_openai(body, model_manager, config);

    // Count tokens for log (best effort)
    let num_tokens = null;
    try {
      num_tokens = await countTokensFast(openai_request.messages || [], openai_request.model || "gpt-4o");
    } catch {
      num_tokens = null;
    }

    if (req.signal.aborted) throw httpError(499, "Client disconnected");

    if (body?.stream) {
      const openai_model = openai_request.model || "";
      const use_responses_api = isResponsesAPI(openai_model);

      const startTime = Date.now();

      // Build async generator
      const upstream = openai_client.create_chat_completion_stream(openai_request, {
        requestId: request_id,
        signal: req.signal,
      });

      // For now, return the raw upstream stream (we'll add proper bridge conversion later)
      return sseResponse(upstream);
    } else {
      const startTime = Date.now();
      try {
        const openai_response = await openai_client.create_chat_completion(openai_request, { requestId: request_id });
        const endTime = Date.now();

        const response_time = Math.max(0, (endTime - startTime) / 1000);
        const output_tokens = openai_response?.usage?.completion_tokens || 0;
        const tokens_per_sec = response_time > 0 && output_tokens > 0 ? output_tokens / response_time : null;

        const claude_response = convert_openai_to_claude_response(openai_response, body);

        const num_messages = (openai_request?.messages || []).length;
        const num_tools = Array.isArray(body?.tools) ? body.tools.length : 0;
        const duration_ms = response_time > 0 ? response_time * 1000 : null;
        const openai_model_disp = openai_request.model;

        const display_model = body?.model?.includes("/") ? body.model.split("/").pop() : body?.model;

        // Get the actual backend that was used (handles failover)
        const actually_used_backend = openai_response._used_backend || openai_client._last_used_backend || config.backend;

        log_request_beautifully({
          method: "POST",
          path: "/v1/messages",
          claude_model: display_model,
          openai_model: actually_used_backend,
          num_messages,
          num_tools,
          status_code: 200,
          num_tokens: num_tokens || undefined,
          output_tokens: output_tokens || undefined,
          tokens_per_sec: tokens_per_sec || undefined,
          duration_ms,
        });

        return jsonResponse(claude_response);
      } catch (e) {
        logger.error("Unexpected error processing request:", e?.message || e);
        const msg = openai_client.classify_openai_error(e?.message || e);
        throw httpError(e?.status || 500, msg);
      }
    }
  };
}