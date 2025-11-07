import { Constants } from "../constants.js";
import { toResponsesTools, normalizeToolChoice } from "./tools.js";
import { countTokensFast } from "../tokenize/tiktoken.js";
import { logger } from "../logging.js";

export function convert_claude_user_message(msg) {
  if (!msg || msg.role !== Constants.ROLE_USER) {
    return { role: Constants.ROLE_USER, content: "" };
  }
  const c = msg.content;
  if (c == null) return { role: Constants.ROLE_USER, content: "" };
  if (typeof c === "string") return { role: Constants.ROLE_USER, content: c };

  const openai_content = [];
  for (const block of c) {
    if (!block) continue;
    if (block.type === Constants.CONTENT_TEXT) {
      openai_content.push({ type: "text", text: block.text });
    } else if (block.type === Constants.CONTENT_IMAGE) {
      const src = block.source;
      if (src && src.type === "base64" && src.media_type && src.data) {
        openai_content.push({
          type: "image_url",
          image_url: {
            url: `data:${src.media_type};base64,${src.data}`,
          },
        });
      }
    }
  }
  if (openai_content.length === 1 && openai_content[0].type === "text") {
    return { role: Constants.ROLE_USER, content: openai_content[0].text };
  }
  return { role: Constants.ROLE_USER, content: openai_content };
}

export function convert_claude_assistant_message(msg) {
  if (!msg || msg.role !== Constants.ROLE_ASSISTANT) {
    return { role: Constants.ROLE_ASSISTANT, content: null };
  }
  const c = msg.content;
  if (c == null) return { role: Constants.ROLE_ASSISTANT, content: null };
  if (typeof c === "string") return { role: Constants.ROLE_ASSISTANT, content: c };

  const text_parts = [];
  const tool_calls = [];
  for (const block of c) {
    if (!block) continue;
    if (block.type === Constants.CONTENT_TEXT) {
      text_parts.push(block.text);
    } else if (block.type === Constants.CONTENT_TOOL_USE) {
      tool_calls.push({
        id: block.id,
        type: Constants.TOOL_FUNCTION,
        [Constants.TOOL_FUNCTION]: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }
  const msgOut = { role: Constants.ROLE_ASSISTANT, content: text_parts.length ? text_parts.join("") : null };
  if (tool_calls.length) msgOut.tool_calls = tool_calls;
  return msgOut;
}

export function parse_tool_result_content(content) {
  if (content == null) return "No content provided";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object") {
        if (item.type === Constants.CONTENT_TEXT) {
          parts.push(item.text || "");
        } else if ("text" in item) {
          parts.push(item.text || "");
        } else {
          try {
            parts.push(JSON.stringify(item));
          } catch {
            parts.push(String(item));
          }
        }
      }
    }
    return parts.join("\n").trim();
  }
  if (typeof content === "object") {
    if (content.type === Constants.CONTENT_TEXT) return content.text || "";
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  try {
    return String(content);
  } catch {
    return "Unparseable content";
  }
}

export function convert_claude_tool_results(msg) {
  const out = [];
  if (Array.isArray(msg?.content)) {
    for (const block of msg.content) {
      if (block?.type === Constants.CONTENT_TOOL_RESULT) {
        const content = parse_tool_result_content(block.content);
        out.push({
          role: Constants.ROLE_TOOL,
          tool_call_id: block.tool_use_id,
          content,
        });
      }
    }
  }
  return out;
}

export function convert_claude_to_openai_user_or_toolresult(messages, idx) {
  const msg = messages[idx];
  // if normal user message
  if (
    msg.role !== Constants.ROLE_USER ||
    !Array.isArray(msg.content) ||
    !msg.content.some((b) => b?.type === Constants.CONTENT_TOOL_RESULT)
  ) {
    return convert_claude_user_message(msg);
  }
  // If user message holds tool_result blocks, they will be handled by assistant->tool_result expansion path.
  // But Chat Completions expects a "tool" role message; that is added by convert_claude_tool_results when we advance i.
  // Here, just return a harmless user message with empty content if the user also has tool_result blocks (rare).
  return { role: Constants.ROLE_USER, content: "" };
}

export function buildOpenAIRequestMaxTokensPolicy(openai_request, claude_request, config) {
  const reqMax = claude_request?.max_tokens;
  if (config.max_tokens_limit === "ignore") {
    // do nothing
  } else if (config.max_tokens_limit === "request") {
    if (reqMax != null) openai_request.max_tokens = reqMax;
  } else if (typeof config.max_tokens_limit === "number") {
    let minLimit = 100;
    if (typeof config.min_tokens_limit === "number") minLimit = config.min_tokens_limit;
    else if (config.min_tokens_limit === "ignore") minLimit = 0;
    const clamped = Math.min(Math.max(reqMax ?? minLimit, minLimit), config.max_tokens_limit);
    openai_request.max_tokens = clamped;
  } else {
    openai_request.max_tokens = Math.min(Math.max(reqMax ?? 100, 100), 4096);
  }
}

export function convert_claude_to_openai(claude_request, model_manager, config) {
  const openai_model_full = model_manager.map_claude_model_to_openai(claude_request.model);

  const openai_messages = [];
  // system
  if (claude_request.system) {
    let system_text = "";
    if (typeof claude_request.system === "string") {
      system_text = claude_request.system;
    } else if (Array.isArray(claude_request.system)) {
      const parts = [];
      for (const block of claude_request.system) {
        if (block?.type === Constants.CONTENT_TEXT && block?.text) parts.push(block.text);
        else if (block && typeof block === "object" && block.type === Constants.CONTENT_TEXT) {
          parts.push(block.text || "");
        }
      }
      system_text = parts.join("\n\n");
    }
    if (system_text.trim()) {
      openai_messages.push({ role: Constants.ROLE_SYSTEM, content: system_text.trim() });
    }
  }

  // messages
  for (let i = 0; i < (claude_request.messages || []).length; i++) {
    const msg = claude_request.messages[i];
    if (msg.role === Constants.ROLE_USER) {
      openai_messages.push(convert_claude_to_openai_user_or_toolresult(claude_request.messages, i));
    } else if (msg.role === Constants.ROLE_ASSISTANT) {
      const assistantOpenAI = convert_claude_assistant_message(msg);
      openai_messages.push(assistantOpenAI);
      // If next message is user with tool_result blocks, expand
      const next = claude_request.messages[i + 1];
      if (
        next &&
        next.role === Constants.ROLE_USER &&
        Array.isArray(next.content) &&
        next.content.some((b) => b?.type === Constants.CONTENT_TOOL_RESULT)
      ) {
        i += 1;
        const toolMsgs = convert_claude_tool_results(next);
        for (const tm of toolMsgs) openai_messages.push(tm);
      }
    }
  }

  const openai_request = {
    model: openai_model_full,
    messages: openai_messages,
    temperature: claude_request.temperature ?? 1.0,
    stream: !!claude_request.stream,
  };

  // max_tokens policy
  buildOpenAIRequestMaxTokensPolicy(openai_request, claude_request, config);

  if (claude_request.stop_sequences) openai_request.stop = claude_request.stop_sequences;
  if (claude_request.top_p != null) openai_request.top_p = claude_request.top_p;

  // tools
  if (Array.isArray(claude_request.tools) && claude_request.tools.length) {
    const openai_tools = [];
    for (const tool of claude_request.tools) {
      if (!tool?.name || !String(tool.name).trim()) continue;
      openai_tools.push({
        type: Constants.TOOL_FUNCTION,
        [Constants.TOOL_FUNCTION]: {
          name: tool.name,
          description: tool.description || "",
          parameters: tool.input_schema || {},
        },
      });
    }
    if (openai_tools.length) {
      if (openai_model_full.startsWith("openai:gpt-5") || openai_model_full.startsWith("gpt-5")) {
        openai_request.tools = toResponsesTools(openai_tools);
      } else {
        openai_request.tools = openai_tools;
      }
    }
  }

  // tool_choice
  if (claude_request.tool_choice) {
    const ct = claude_request.tool_choice.type;
    if (ct === "auto" || ct === "any") {
      openai_request.tool_choice = "auto";
    } else if (ct === "tool" && claude_request.tool_choice.name) {
      if (openai_model_full.startsWith("openai:gpt-5") || openai_model_full.startsWith("gpt-5")) {
        openai_request.tool_choice = { type: "function", name: claude_request.tool_choice.name };
      } else {
        openai_request.tool_choice = { type: "function", function: { name: claude_request.tool_choice.name } };
      }
    } else {
      openai_request.tool_choice = "auto";
    }
  }

  logger.debug("OpenAI request payload:", JSON.stringify(openai_request, null, 2));
  return openai_request;
}