import { requireClientAuth } from "../../http/auth.js";
import { readJSON, jsonResponse, sseResponse } from "../../http/responses.js";
import { httpError } from "../../http/errors.js";
import { logger } from "../../logging.js";
import { convert_claude_to_openai } from "../../conversion/claude_to_openai.js";
import { convert_openai_to_claude_response } from "../../conversion/openai_to_claude.js";
import { isResponsesAPI } from "../../provider/openai_client.js";
import { countTokensFast } from "../../tokenize/tiktoken.js";
import { log_request_arrival, log_request_completion } from "../../logging.js";
import { estimateTokens } from "../../utils/token-counter.js";

export function buildMessagesHandler({ config, model_manager, openai_client }) {
  return async function handler(req) {
    requireClientAuth(req, config);
    const body = await readJSON(req);
    logger.debug(`Processing Claude request: model=${body?.model} , stream=${!!body?.stream}`);

    const request_id = crypto.randomUUID();

    // Use the new backend selector to choose the appropriate backend upfront
    const estimatedTokens = estimateTokens(body);
    const selectedBackend = config.selectBackend(body, estimatedTokens);

    if (!selectedBackend) {
      // Check if this is a vision request that failed
      const hasImages = config._hasImageContent(body);
      const needsThinking = body.thinking?.type === 'enabled';

      let errorDetail;
      if (hasImages) {
        errorDetail = { error: { type: "invalid_request_error", message: "llmux: no model supports vision" } };
      } else if (needsThinking) {
        errorDetail = { error: { type: "invalid_request_error", message: "llmux: no model supports thinking" } };
      } else {
        errorDetail = { error: { type: "invalid_request_error", message: "llmux: no suitable backend available" } };
      }

      return jsonResponse(errorDetail, { status: 400 });
    }

    logger.debug(`Selected backend: ${selectedBackend}`);

    // Temporarily override the config's backend for this request
    const originalBackend = config.backend;
    const originalFailover = config.failover;
    config.backend = selectedBackend;
    // Set failover to all other available backends (excluding the selected one)
    // Include both the primary backend and other failover backends
    const allBackends = [originalBackend, ...originalFailover];
    config.failover = allBackends.filter(backend => backend !== selectedBackend);

    // Log request arrival as soon as we have the basic info
    log_request_arrival({
      method: "POST",
      path: "/v1/messages",
    });

    try {
      // convert Claude -> OpenAI request
      const openai_request = convert_claude_to_openai(body, model_manager, config);

      // Override the model in the OpenAI request to use our selected backend
      openai_request.model = selectedBackend;

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

      // Restore backend and return stream
      try {
        return sseResponse(upstream);
      } finally {
        config.backend = originalBackend;
        config.failover = originalFailover;
      }
    } else {
      const startTime = Date.now();
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

      // Extract request flags for logging
      const has_images = config._hasImageContent(body);
      const thinking = body.thinking?.type === 'enabled';
      const stream = !!body?.stream;
      const temperature = body?.temperature ?? null;
      const max_tokens = body?.max_tokens ?? null;
      const tools = body?.tools ?? null;

      // Log completion when request is done
      log_request_completion({
        method: "POST",
        path: "/v1/messages",
        claude_model: display_model,
        openai_model: selectedBackend,
        num_messages,
        num_tools,
        status_code: 200,
        num_tokens: num_tokens || undefined,
        output_tokens: output_tokens || undefined,
        tokens_per_sec: tokens_per_sec || undefined,
        duration_ms,
        config,
        has_images,
        thinking,
        stream,
        temperature,
        max_tokens,
        tools,
      });

      // Restore backend and return response
      try {
        return jsonResponse(claude_response);
      } finally {
        config.backend = originalBackend;
        config.failover = originalFailover;
      }
    }
    } finally {
      // Restore original backend on error
      config.backend = originalBackend;
      config.failover = originalFailover;
    }
  };
}