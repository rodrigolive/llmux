import { requireClientAuth } from "../../http/auth.js";
import { readJSON, jsonResponse, sseResponse } from "../../http/responses.js";
import { httpError } from "../../http/errors.js";
import { logger } from "../../logging.js";
import { applyKeyDeletions } from "../../utils/key_delete.js";
import { applyKeyAdditions } from "../../utils/key_add.js";
import { applyKeyRenames } from "../../utils/key_rename.js";
import { isResponsesAPI } from "../../provider/openai_client.js";
import { countTokensFast } from "../../tokenize/tiktoken.js";
import { log_request_arrival, log_request_completion } from "../../logging.js";
import { estimateTokens } from "../../utils/token-counter.js";

export function buildChatCompletionsHandler({ config, model_manager, openai_client }) {
  return async function handler(req) {
    try {
      requireClientAuth(req, config);
    } catch (error) {
      // Return OpenAI-format authentication error instead of generic httpError
      if (error.status === 401) {
        return jsonResponse({
          error: {
            message: "Invalid API key provided",
            type: "invalid_api_key_error",
            code: "invalid_api_key"
          }
        }, { status: 401 });
      }
      throw error; // Re-throw other errors
    }

    const body = await readJSON(req);
    const requestedModel = body?.model;
    logger.debug(`Processing OpenAI chat completions request: model=${body?.model} , stream=${!!body?.stream}`);

    const request_id = crypto.randomUUID();

    // Use the new backend selector to choose the appropriate backend upfront
    const estimatedTokens = estimateTokens(body);
    const selectedBackend = config.selectBackend(body, estimatedTokens);

    if (!selectedBackend) {
      // Check if this is a vision request that failed
      const hasImages = config._hasImageContent(body);
      const needsThinking = body.thinking?.type === 'enabled' || config._hasOpenAIThinking(body);

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

    try {
      // Work on a shallow copy so we don't mutate the original request body
      let finalRequest = { ...body };

      // Apply backend-specific key transformations before sending request
      const backendConfig = config.getBackendConfig(selectedBackend);

      // Apply key deletions first
      finalRequest = applyKeyDeletions(finalRequest, backendConfig);

      // Then apply key additions
      finalRequest = applyKeyAdditions(finalRequest, backendConfig);

      // Finally apply key renames
      finalRequest = applyKeyRenames(finalRequest, backendConfig);

      // Always route through the backend that selectBackend chose
      finalRequest.model = selectedBackend;

      // Ensure we have the required fields for the backend client
      if (!finalRequest.model) {
        finalRequest.model = selectedBackend;
      }

      logger.debug("Final OpenAI request payload:", JSON.stringify(finalRequest, null, 2));

    // Log request arrival as soon as we have the basic info
    log_request_arrival({
      method: "POST",
      path: "/v1/chat/completions",
    });

    // Count tokens for log (best effort)
    let num_tokens = null;
    try {
      num_tokens = await countTokensFast(finalRequest.messages || [], finalRequest.model || "gpt-4o");
    } catch {
      num_tokens = null;
    }

    if (req.signal.aborted) throw httpError(499, "Client disconnected");

      const logRequest = async ({ duration_ms = null, output_tokens, tokens_per_sec } = {}) => {
        const num_messages = (finalRequest?.messages || []).length;
        const num_tools = Array.isArray(body?.tools) ? body.tools.length : 0;
        const display_model = requestedModel?.includes("/")
          ? requestedModel.split("/").pop()
          : requestedModel;
        const has_images = config._hasImageContent(body);
        const thinking = body.thinking?.type === 'enabled' || config._hasOpenAIThinking(body);
        const stream = !!body?.stream;
        const temperature = body?.temperature ?? null;
        const max_tokens = body?.max_tokens ?? null;
        const tools = body?.tools ?? null;

        await log_request_completion({
          method: "POST",
          path: "/v1/chat/completions",
          claude_model: display_model || finalRequest.model,
          openai_model: selectedBackend,
          num_messages,
          num_tools,
          status_code: 200,
          num_tokens: num_tokens || undefined,
          output_tokens: output_tokens ?? undefined,
          tokens_per_sec: tokens_per_sec ?? undefined,
          duration_ms,
          config,
          has_images,
          thinking,
          stream,
          temperature,
          max_tokens,
          tools,
        });
      };

      if (body?.stream) {
        const streamStart = Date.now();
        let usageStats = null;

        const upstream = openai_client.create_chat_completion_stream(finalRequest, {
          requestId: request_id,
          signal: req.signal,
        });

        const instrumentedStream = (async function* () {
          try {
            for await (const chunk of upstream) {
              const trimmed = chunk.trim();
              if (trimmed.startsWith("data:")) {
                const payload = trimmed.slice(5).trim();
                if (payload && payload !== "[DONE]") {
                  try {
                    const parsed = JSON.parse(payload);
                    if (parsed?.usage) usageStats = parsed.usage;
                  } catch {
                    // ignore JSON parse errors for non-JSON chunks
                  }
                }
              }
              yield chunk;
            }
          } finally {
            const endTime = Date.now();
            const response_time = Math.max(0, (endTime - streamStart) / 1000);
            const duration_ms = response_time > 0 ? response_time * 1000 : null;
            const completion_tokens = usageStats?.completion_tokens ?? usageStats?.output_tokens ?? null;
            const tokens_per_sec = response_time > 0 && completion_tokens != null && completion_tokens > 0
              ? completion_tokens / response_time
              : null;

            await logRequest({
              duration_ms,
              output_tokens: completion_tokens ?? undefined,
              tokens_per_sec,
            });
          }
        })();

        try {
          return sseResponse(instrumentedStream);
        } finally {
          config.backend = originalBackend;
          config.failover = originalFailover;
        }
      } else {
        const startTime = Date.now();
        const response = await openai_client.create_chat_completion(finalRequest, { requestId: request_id });
        const endTime = Date.now();

        const response_time = Math.max(0, (endTime - startTime) / 1000);
        const output_tokens = response?.usage?.completion_tokens || 0;
        const tokens_per_sec = response_time > 0 && output_tokens > 0 ? output_tokens / response_time : null;
        const duration_ms = response_time > 0 ? response_time * 1000 : null;

        await logRequest({ duration_ms, output_tokens, tokens_per_sec });

        config.backend = originalBackend;
        config.failover = originalFailover;

        return jsonResponse(response);
      }
    } catch (error) {
      // Restore backend on error
      config.backend = originalBackend;
      config.failover = originalFailover;

      // Log error if needed
      if (error?.status !== 401 && error?.type !== "AuthenticationError") {
        logger.error(`Chat completions request failed: ${error?.message || error}`);
        if (process.env.DEBUG === "true") {
          logger.error(error.stack);
        }
      }

      // Re-throw HTTP errors with proper status
      if (error.status) {
        throw httpError(error.status, error.message);
      }

      // Generic error
      throw httpError(500, "Internal server error");
    }
  };
}
