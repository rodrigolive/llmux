import { toResponsesTools, normalizeToolChoice } from "../conversion/tools.js";
import { httpError } from "../http/errors.js";
import { logger, log_failover_beautifully, log_tool_error_details } from "../logging.js";
import { countTokensFast } from "../tokenize/tiktoken.js";

export function providerConfigFor(providerModelString, config) {
  let provider, model;
  if (providerModelString.includes(":")) {
    const colonIndex = providerModelString.indexOf(":");
    provider = providerModelString.slice(0, colonIndex);
    model = providerModelString.slice(colonIndex + 1);
  }
  else {
    provider = config.provider;
    model = providerModelString;
  }
  const provider_cfg = config.providers?.[provider] || {};
  const api_key = provider_cfg.api_key || Bun.env.OPENAI_API_KEY || "";
  const base_url = provider_cfg.base_url || "https://api.openai.com/v1";
  const api_version = provider_cfg.api_version || null;
  return { provider, model, api_key, base_url, api_version };
}

export function isResponsesAPI(modelName) {
  return modelName?.startsWith("gpt-5");
}

export function buildProviderEndpoint({ provider, model, base_url, api_version, apiType }) {
  // apiType: "chat.completions" | "responses"
  // Azure vs standard
  const isAzure = !!api_version; // our heuristic: presence of api_version => Azure-style
  if (!isAzure) {
    if (apiType === "responses") return `${base_url.replace(/\/+$/, "")}/responses`;
    return `${base_url.replace(/\/+$/, "")}/chat/completions`;
  }
  // Azure: /openai/deployments/{deployment}/chat/completions?api-version=...
  const base = base_url.replace(/\/+$/, "");
  if (apiType === "responses") {
    return `${base}/openai/deployments/${encodeURIComponent(model)}/responses?api-version=${encodeURIComponent(api_version)}`;
  }
  return `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(api_version)}`;
}

export function buildProviderHeaders({ provider, api_key, api_version }) {
  const isAzure = !!api_version;
  const headers = {
    "content-type": "application/json",
  };
  if (isAzure) {
    headers["api-key"] = api_key;
  } else {
    headers["authorization"] = `Bearer ${api_key}`;
  }
  return headers;
}

export class OpenAIClient {
  constructor(config, timeoutSec = 90) {
    this.config = config;
    this.timeout = timeoutSec;
    this.activeControllers = new Map(); // requestId -> AbortController
    this._failover_cooldown_until = 0;
  }

  _calculate_token_count(request) {
    try {
      const openai_model = request?.model || "gpt-4o";
      return countTokensFast(request?.messages || [], openai_model);
    } catch (e) {
      logger.warning("Token counting failed:", e?.message || e);
      // fallback char/4
      let chars = 0;
      for (const msg of request?.messages || []) {
        const c = msg?.content;
        if (!c) continue;
        if (typeof c === "string") chars += c.length;
        else if (Array.isArray(c)) for (const b of c) if (b?.type === "text" && b?.text) chars += String(b.text).length;
      }
      return Math.max(1, Math.floor(chars / 4));
    }
  }

  _extract_error_code(err) {
    if (err?.status) return String(err.status);
    const s = String(err?.message || err || "");
    const m = /^(\d{3})[: ]/.exec(s);
    if (m) return m[1];
    return err?.name || "Error";
  }

  cancel_request(requestId) {
    const ctrl = this.activeControllers.get(requestId);
    if (ctrl) {
      ctrl.abort();
      this.activeControllers.delete(requestId);
      return true;
    }
    return false;
  }

  async _do_fetch(providerModelString, payload, { requestId, signal, streamDesired }) {
    const { provider, model, api_key, base_url, api_version } = providerConfigFor(providerModelString, this.config);
    // Determine endpoint
    const modelNameForAPI = model;
    const useResponses = isResponsesAPI(modelNameForAPI);
    const apiType = useResponses ? "responses" : "chat.completions";
    const url = buildProviderEndpoint({ provider, model: modelNameForAPI, base_url, api_version, apiType });
    const headers = buildProviderHeaders({ provider, api_key, api_version });

    let bodyPayload = { ...payload, model: modelNameForAPI };
    if (useResponses) {
      // Convert chat-completions-like payload into responses-compatible
      if (bodyPayload.tools)
        bodyPayload.tools = toResponsesTools(bodyPayload.tools);
      if (bodyPayload.tool_choice)
        bodyPayload.tool_choice = normalizeToolChoice(bodyPayload.tool_choice);
      if (Array.isArray(bodyPayload.messages)) {
        let input = "";
        for (const msg of bodyPayload.messages) {
          if (typeof msg.content === "string") {
            input += `${msg.role || "user"}: ${msg.content}\n\n`;
          } else if (Array.isArray(msg.content)) {
            let textContent = "";
            for (const block of msg.content) {
              if (block?.type === "text") textContent += (block.text || "") + "\n\n";
            }
            if (textContent) input += `${msg.role || "user"}: ${textContent}\n\n`;
          }
        }
        bodyPayload.input = input.trim();
        delete bodyPayload.messages;
      }
      delete bodyPayload.max_tokens; // not used in Responses
    } else {
      // chat.completions; optionally include usage in streaming
      if (streamDesired) {
        bodyPayload.stream = true;
        bodyPayload.stream_options = bodyPayload.stream_options || {};
        bodyPayload.stream_options.include_usage = true;
      }
    }

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort("timeout"), this.timeout * 1000);
    if (signal) {
      signal.addEventListener("abort", () => ctrl.abort("client aborted"), { once: true });
    }
    if (requestId) this.activeControllers.set(requestId, ctrl);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw httpError(res.status, txt || `Provider HTTP ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timeout);
      if (requestId) this.activeControllers.delete(requestId);
    }
  }

  async create_chat_completion(openai_request, { requestId } = {}) {
    // Either perform single attempt (no failover) or try failover with backoff
    if (Array.isArray(this.config.failover) && this.config.failover.length > 0) {
      const result = await this._try_failover_request(openai_request, { requestId });
      if (result && typeof result === 'object' && result.response) {
        result.response._used_backend = result.used_backend;
        return result.response;
      }
      return result.response || result;
    }
    // no failover - still need to handle errors gracefully
    try {
      const res = await this._do_fetch(openai_request.model, openai_request, { requestId, streamDesired: false });
      const json = await res.json();
      if (json && typeof json === 'object') {
        json._used_backend = openai_request.model;
      }
      return json;
    } catch (e) {
      // Log the error nicely even when there's no failover
      const code = this._extract_error_code(e);
      const num_tokens = await this._calculate_token_count(openai_request);
      log_failover_beautifully(code, openai_request.model, "none", num_tokens);
      throw e;
    }
  }

  async *_create_stream(openai_request, { requestId, signal } = {}) {
    const res = await this._do_fetch(openai_request.model, openai_request, {
      requestId,
      signal,
      streamDesired: true,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE is separated by \n\n
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (chunk.trim().length === 0) continue;
        // ensure starts with "data: "
        const lines = chunk.split("\n").filter(Boolean);
        for (const ln of lines) {
          if (ln.startsWith("data:")) {
            yield ln + "\n\n";
          }
        }
      }
    }
    if (buf.trim().length) {
      const lines = buf.split("\n").filter(Boolean);
      for (const ln of lines) {
        if (ln.startsWith("data:")) {
          yield ln + "\n\n";
        }
      }
    }
  }

  async *create_chat_completion_stream(openai_request, { requestId, signal } = {}) {
    if (Array.isArray(this.config.failover) && this.config.failover.length > 0) {
      yield* this._try_failover_stream(openai_request, { requestId, signal });
      return;
    }
    // no failover - still need to handle errors gracefully
    try {
      this._last_used_backend = openai_request.model;
      yield* this._create_stream(openai_request, { requestId, signal });
    } catch (e) {
      // Log the error nicely even when there's no failover
      const code = this._extract_error_code(e);
      const num_tokens = await this._calculate_token_count(openai_request);
      log_failover_beautifully(code, openai_request.model, "none", num_tokens);
      throw e;
    }
  }

  async _try_failover_request(openai_request, { requestId } = {}) {
    const backoff_seq = [2, 4, 8, 15, 15, 30, 30, 60];
    let cycle = 0;
    const max_cycles = 10;
    let all_backends = [this.config.backend, ...this.config.failover];
    const now = Date.now() / 1000;
    if (now < this._failover_cooldown_until) {
      logger.info(`Failover cooldown active until ${this._failover_cooldown_until}, skipping primary backend`);
      all_backends = [...this.config.failover];
    }
    const num_tokens = await this._calculate_token_count(openai_request);

    while (cycle < max_cycles) {
      for (const backend of all_backends) {
        try {
          const payload = { ...openai_request, model: backend };
          const res = await this._do_fetch(backend, payload, { requestId, streamDesired: false });
          const json = await res.json();
          return { response: json, used_backend: backend };
        } catch (e) {
          const errStr = String(e?.message || e || "").toLowerCase();
          const code = this._extract_error_code(e);
          logger.warning(`Failover backend ${backend} failed: ${String(e?.message || e)}`);
          if (
            backend === this.config.backend &&
            (errStr.includes("tokens per day limit exceeded") || errStr.includes("day limit exceeded"))
          ) {
            this._failover_cooldown_until = (Date.now() / 1000) + 300;
            logger.info("Day limit exceeded on main backend. Entering failover cooldown for 300 seconds");
            all_backends = [...this.config.failover];
            break;
          }
          log_tool_error_details(e, openai_request);
          log_failover_beautifully(code, openai_request.model, backend, num_tokens);
          continue;
        }
      }
      cycle += 1;
      if (cycle >= max_cycles) throw httpError(503, `All backends failed after ${max_cycles} retry cycles`);
      const delay = backoff_seq[Math.min(cycle, backoff_seq.length - 1)];
      logger.info(`All backends failed, waiting ${delay}s before retrying (cycle ${cycle}/${max_cycles})...`);
      await Bun.sleep(delay * 1000);
    }
    throw httpError(503, "All backends failed");
  }

  async *_try_failover_stream(openai_request, { requestId, signal } = {}) {
    const backoff_seq = [2, 4, 8, 15, 15, 30, 30, 60];
    let cycle = 0;
    const max_cycles = 10;
    let all_backends = [this.config.backend, ...this.config.failover];
    const now = Date.now() / 1000;
    if (now < this._failover_cooldown_until) {
      logger.info(`Failover cooldown active until ${this._failover_cooldown_until}, skipping primary backend`);
      all_backends = [...this.config.failover];
    }
    const num_tokens = await this._calculate_token_count(openai_request);

    while (cycle < max_cycles) {
      for (const backend of all_backends) {
        try {
          const payload = { ...openai_request, model: backend };
          this._last_used_backend = backend;
          yield* this._create_stream(payload, { requestId, signal });
          return;
        } catch (e) {
          const errStr = String(e?.message || e || "").toLowerCase();
          const code = this._extract_error_code(e);
          logger.warning(`Failover backend ${backend} failed for streaming: ${String(e?.message || e)}`);
          if (
            backend === this.config.backend &&
            (errStr.includes("tokens per day limit exceeded") || errStr.includes("day limit exceeded"))
          ) {
            this._failover_cooldown_until = (Date.now() / 1000) + 300;
            logger.info("Day limit exceeded on main backend. Entering failover cooldown for 300 seconds");
            all_backends = [...this.config.failover];
            break;
          }
          log_tool_error_details(e, openai_request);
          log_failover_beautifully(code, openai_request.model, backend, num_tokens);
          continue;
        }
      }
      cycle += 1;
      if (cycle >= max_cycles) throw httpError(503, `All backends failed for streaming after ${max_cycles} retry cycles`);
      const delay = backoff_seq[Math.min(cycle, backoff_seq.length - 1)];
      logger.info(`All backends failed for streaming, waiting ${delay}s before retrying (cycle ${cycle}/${max_cycles})...`);
      await Bun.sleep(delay * 1000);
    }
    throw httpError(503, "All backends failed (stream)");
  }

  classify_openai_error(detail) {
    const s = String(detail || "").toLowerCase();
    if (s.includes("unsupported_country_region_territory") || s.includes("country, region, or territory not supported")) {
      return "OpenAI API is not available in your region. Consider using a VPN or Azure OpenAI service.";
    }
    if (s.includes("invalid_api_key") || s.includes("unauthorized")) {
      return "Invalid API key. Please check your OPENAI_API_KEY configuration.";
    }
    if (s.includes("rate_limit") || s.includes("quota")) {
      return "Rate limit exceeded. Please wait and try again, or upgrade your API plan.";
    }
    if (s.includes("model") && (s.includes("not found") || s.includes("does not exist"))) {
      return "Model not found. Please check your BIG_MODEL and SMALL_MODEL configuration.";
    }
    if (s.includes("billing") || s.includes("payment")) {
      return "Billing issue. Please check your OpenAI account billing status.";
    }
    return String(detail || "Unknown error");
  }
}