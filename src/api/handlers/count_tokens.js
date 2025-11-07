import { requireClientAuth } from "../../http/auth.js";
import { readJSON, jsonResponse } from "../../http/responses.js";
import { httpError } from "../../http/errors.js";
import { logger } from "../../logging.js";
import { countTokensFast } from "../../tokenize/tiktoken.js";
import { ModelManager } from "../../model/manager.js";

export function buildCountTokensHandler({ config, model_manager }) {
  return async function handler(req) {
    requireClientAuth(req, config);
    const body = await readJSON(req);

    try {
      const openai_model_full = model_manager.map_claude_model_to_openai(body?.model || config.backend);
      const openai_model = openai_model_full.includes(":") ? openai_model_full.split(":")[1] : openai_model_full;
      let total_tokens = 0;

      try {
        // system
        let sysChars = 0;
        if (body?.system) {
          if (typeof body.system === "string") {
            sysChars += body.system.length;
            total_tokens += await countTokensFast(body.system, openai_model);
          } else if (Array.isArray(body.system)) {
            let sysText = "";
            for (const block of body.system) {
              if (block?.text) sysText += block.text;
            }
            sysChars += sysText.length;
            total_tokens += await countTokensFast(sysText, openai_model);
          }
        }

        // messages
        total_tokens += await countTokensFast(body?.messages || [], openai_model);
      } catch (e) {
        logger.warning("Token counting failed, falling back to char estimation:", e?.message || e);
        // fallback chars/4
        let total_chars = 0;
        if (body?.system) {
          if (typeof body.system === "string") total_chars += body.system.length;
          else if (Array.isArray(body.system)) {
            for (const block of body.system) if (block?.text) total_chars += block.text.length;
          }
        }
        for (const msg of body?.messages || []) {
          const c = msg?.content;
          if (!c) continue;
          if (typeof c === "string") total_chars += c.length;
          else if (Array.isArray(c)) for (const b of c) if (b?.text) total_chars += b.text.length;
        }
        total_tokens = Math.max(1, Math.floor(total_chars / 4));
      }

      const display_model = (body?.model || "").includes("/") ? body.model.split("/").pop() : (body?.model || "");
      const mapped = model_manager.map_claude_model_to_openai(body?.model || config.backend);

      const num_messages = (body?.messages || []).length;
      const num_tools = Array.isArray(body?.tools) ? body.tools.length : 0;

      logger.info(`POST /v1/messages/count_tokens ${display_model} → ${mapped} ${num_tools}🆃 ${num_messages}🅼 ${total_tokens}↑`);

      return jsonResponse({ input_tokens: total_tokens });
    } catch (e) {
      logger.error("Error counting tokens:", e?.message || e);
      throw httpError(500, String(e?.message || e));
    }
  };
}