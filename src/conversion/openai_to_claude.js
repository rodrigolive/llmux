import { Constants } from "../constants.js";
import { map_finish_reason_to_stop_reason } from "./tools.js";
import { httpError } from "../http/errors.js";
import { logger } from "../logging.js";

export function convert_openai_responses_to_claude_response(openai_response, original_request) {
  const output = openai_response?.output || [];
  if (!Array.isArray(output) || output.length === 0) {
    throw httpError(500, "No output in OpenAI Responses API response");
  }
  const content_blocks = [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    for (const content_item of item.content || []) {
      const ctype = content_item?.type;
      if (ctype === "output_text") {
        content_blocks.push({ type: Constants.CONTENT_TEXT, text: content_item.text || "" });
      } else if (ctype === "tool_call") {
        const tool_name = content_item.name || "";
        if (
          Array.isArray(original_request?.tools) &&
          original_request.tools.some((t) => t?.name === tool_name)
        ) {
          const tool_id = content_item.id || `tool_${crypto.randomUUID()}`;
          content_blocks.push({
            type: Constants.CONTENT_TOOL_USE,
            id: tool_id,
            name: tool_name,
            input: content_item.input || {},
          });
        } else {
          logger.warning(`Tool '${tool_name}' not present in the original request tools list, skipping tool call`);
        }
      }
    }
  }
  const stop_reason = content_blocks.some((b) => b?.type === Constants.CONTENT_TOOL_USE)
    ? Constants.STOP_TOOL_USE
    : Constants.STOP_END_TURN;

  return {
    id: openai_response?.id || `msg_${crypto.randomUUID()}`,
    type: "message",
    role: Constants.ROLE_ASSISTANT,
    model: original_request?.model,
    content: content_blocks,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: openai_response?.usage?.prompt_tokens ?? 0,
      output_tokens: openai_response?.usage?.completion_tokens ?? 0,
    },
  };
}

export function convert_openai_to_claude_response(openai_response, original_request) {
  if (openai_response?.object === "response") {
    return convert_openai_responses_to_claude_response(openai_response, original_request);
  }
  const choices = openai_response?.choices || [];
  if (!choices.length) throw httpError(500, "No choices in OpenAI response");
  const choice = choices[0];
  const message = choice?.message || {};
  const content_blocks = [];
  const text_content = message?.content;
  if (text_content != null) content_blocks.push({ type: Constants.CONTENT_TEXT, text: text_content });

  const tool_calls = message?.tool_calls || [];
  for (const tc of tool_calls) {
    if (tc?.type === "function") {
      const f = tc.function || {};
      let args;
      try {
        args = JSON.parse(f.arguments || "{}");
      } catch {
        args = { raw_arguments: f.arguments || "" };
      }
      content_blocks.push({
        type: Constants.CONTENT_TOOL_USE,
        id: tc.id || `tool_${crypto.randomUUID()}`,
        name: f.name || "",
        input: args,
      });
    }
  }
  if (!content_blocks.length) content_blocks.push({ type: Constants.CONTENT_TEXT, text: "" });

  const stop_reason = map_finish_reason_to_stop_reason(choice?.finish_reason || "stop");
  return {
    id: openai_response?.id || `msg_${crypto.randomUUID()}`,
    type: "message",
    role: Constants.ROLE_ASSISTANT,
    model: original_request?.model,
    content: content_blocks,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: openai_response?.usage?.prompt_tokens ?? 0,
      output_tokens: openai_response?.usage?.completion_tokens ?? 0,
    },
  };
}