import { Constants } from "../constants.js";
import { httpError } from "../http/errors.js";

export function toResponsesTools(toolsIn) {
  if (!toolsIn || !Array.isArray(toolsIn)) return toolsIn;
  const out = [];
  for (const t of toolsIn) {
    if (t?.type === "function" && typeof t.function === "object") {
      const f = t.function || {};
      out.push({
        type: "function",
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      });
    } else {
      out.push(t);
    }
  }
  return out;
}

export function normalizeToolChoice(tool_choice) {
  if (!tool_choice) return tool_choice;
  if (typeof tool_choice === "string") return tool_choice; // "auto" | "none" | "required"
  if (typeof tool_choice === "object") {
    const t = tool_choice.type;
    if (t === "auto" || t === "none" || t === "required") return t;
    if (t === "function" && tool_choice.function && tool_choice.function.name) {
      return { type: "function", name: tool_choice.function.name };
    }
  }
  return tool_choice;
}

export function cleanResponsesPayload(payload) {
  const unsupported = [
    "temperature",
    "top_p",
    "n",
    "presence_penalty",
    "frequency_penalty",
    "logit_bias",
    "user",
    "response_format",
  ];
  for (const k of unsupported) delete payload[k];
  return payload;
}

export function map_finish_reason_to_stop_reason(fr) {
  if (fr === "length") return Constants.STOP_MAX_TOKENS;
  if (fr === "tool_calls" || fr === "function_call") return Constants.STOP_TOOL_USE;
  if (fr === "stop") return Constants.STOP_END_TURN;
  return Constants.STOP_END_TURN;
}