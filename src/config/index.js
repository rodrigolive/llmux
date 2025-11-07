import { loadToml } from "./toml.js";
import { logger } from "../logging.js";

export class Config {
  constructor(cfg) {
    this.tokens = cfg?.tokens ?? {};
    if (!this.tokens || Object.keys(this.tokens).length === 0) {
      console.log("Warning: No tokens configured. Client authentication will be disabled.");
    } else {
      console.log(`Info: ${Object.keys(this.tokens).length} token(s) configured for client authentication.`);
    }

    // Parse [[backend]] array of tables if available
    this.backends = Array.isArray(cfg?.backend) ? [...cfg.backend] : [];

    // If [[backend]] is configured, extract primary backend and failover from it
    if (this.backends.length > 0) {
      this.backend = this.backends[0].model || "openai:gpt-4o";
      console.log(`Info: Using primary backend from [[backend]]: ${this.backend}`);

      // Extract failover from backends array (excluding the first one which is primary)
      this.failover = this.backends.slice(1).map(b => b.model);
    } else {
      // Fallback to legacy single backend and failover configuration
      this.backend = cfg?.backend ?? "openai:gpt-4o";
      this.failover = Array.isArray(cfg?.failover) ? [...cfg.failover] : [];
    }

    if (!String(this.backend).includes(":")) {
      throw new Error("Backend must be in provider:model format");
    }
    const colonIndex = this.backend.indexOf(":");
    this.provider = this.backend.slice(0, colonIndex);
    this.model = this.backend.slice(colonIndex + 1);

    // Store backend configurations with context limits and other settings
    this.backend_configs = {};
    this.backends.forEach(backend => {
      this.backend_configs[backend.model] = {
        context: backend.context,
        vision: backend.vision ?? false,
        thinking: backend.thinking ?? false,
        max_per_day: backend.max_per_day,
        max_per_hour: backend.max_per_hour,
        max_per_5h: backend.max_per_5h,
        model_match: backend.model_match,
        key_rename: backend.key_rename,
        key_delete: backend.key_delete,
        key_add: backend.key_add
      };
    });

    this.providers = cfg?.provider ?? {};

    this.host = String(cfg?.host ?? "0.0.0.0");
    this.port = Number(cfg?.port ?? 8082);
    this.log_level = String(cfg?.log_level ?? "INFO");
    this.max_tokens_limit = cfg?.max_tokens_limit ?? 4096;
    this.min_tokens_limit = cfg?.min_tokens_limit ?? 100;

    this.request_timeout = Number(cfg?.request_timeout ?? 90);
    this.max_retries = Number(cfg?.max_retries ?? 2);

    // Logging Configuration
    this.log = cfg?.log ?? {};
    this.log_request_details = Boolean(this.log?.request_details ?? false);

    // HTTPS/SSL Configuration
    this.https_enabled = Boolean(cfg?.https_enabled ?? false);
    this.ssl_key_file = String(cfg?.ssl_key_file ?? "");
    this.ssl_cert_file = String(cfg?.ssl_cert_file ?? "");
    this.ssl_ca_file = String(cfg?.ssl_ca_file ?? "");
  }

  validate_api_key() {
    // Not required; backward compat
    return true;
  }

  validate_client_api_key(clientKey) {
    if (!this.tokens || Object.keys(this.tokens).length === 0) return true;
    return Object.values(this.tokens).includes(clientKey);
  }

  /**
   * Get backend configuration for a specific model
   * @param {string} model - Model identifier in provider:model format
   * @returns {object} Backend configuration with context, images, etc.
   */
  getBackendConfig(model = null) {
    if (!model) {
      model = this.backend;
    }
    return this.backend_configs[model] || {
      context: 128000, // default context
      vision: false,    // default vision support - must be explicitly enabled
      thinking: false,  // default thinking support - must be explicitly enabled
      max_per_day: null,
      max_per_hour: null,
      max_per_5h: null,
      model_match: null,
      key_rename: null,
      key_delete: null,
      key_add: null
    };
  }

  /**
   * Select the best backend for a given request based on various constraints
   * @param {object} request - The request object
   * @param {number} estimatedTokens - Estimated token count for the request
   * @param {string[]} failedBackends - Array of backend models that have failed
   * @returns {string|null} Selected backend model or null if no suitable backend found
   */
  selectBackend(request, estimatedTokens = 0, failedBackends = []) {
    const needsVision = this._hasImageContent(request);
    const needsThinking = request.thinking?.type === 'enabled' || this._hasOpenAIThinking(request);

    // Filter out failed backends
    const availableBackends = this.backends.filter(
      backend => !failedBackends.includes(backend.model)
    );

    // Find first backend that matches all constraints
    for (const backend of availableBackends) {
      const config = this.getBackendConfig(backend.model);

      // Check context limit
      if (config.context && estimatedTokens > config.context) {
        continue;
      }

      // Check vision support
      if (needsVision && !config.vision) {
        continue;
      }

      // Check thinking support
      if (needsThinking && !config.thinking) {
        continue;
      }

      // Check model match patterns (for things like "*opus*")
      // Only apply pattern matching if the backend has specific model_match patterns
      if (config.model_match?.length > 0) {
        const requestedModel = request.model || '';
        const matches = config.model_match.some(pattern =>
          this._matchPattern(pattern, requestedModel)
        );
        if (!matches) {
          continue; // Skip this backend if pattern doesn't match
        }
      }
      // If no model_match patterns, this backend matches any model

      // This backend matches all requirements
      return backend.model;
    }

    // No backend found
    return null;
  }

  /**
   * Check if request contains image content
   * @param {object} request - The request object
   * @returns {boolean} True if request contains images
   */
  _hasImageContent(request) {
    if (!request.messages) return false;

    return request.messages.some(message => {
      if (!Array.isArray(message.content)) return false;

      return message.content.some(content =>
        content.type === 'image' || content.type === 'image_url'
      );
    });
  }

  /**
   * Check if request contains thinking mode for OpenAI format
   * @param {object} request - The request object
   * @returns {boolean} True if request has thinking enabled
   */
  _hasOpenAIThinking(request) {
    // OpenAI format thinking could be in different formats
    // Check for reasoning_content in the request or specific model types
    return request.model?.includes('o1') ||
           request.model?.includes('o3') ||
           request.thinking?.type === 'enabled' ||
           request.reasoning_mode === true;
  }

  /**
   * Simple pattern matching for model selection (supports * wildcards)
   * @param {string} pattern - Pattern like "*opus*"
   * @param {string} value - Value to match against
   * @returns {boolean} True if pattern matches
   */
  _matchPattern(pattern, value) {
    // Return true if pattern matches "*" wildcard (matches anything)
    if (pattern === "*") return true;
    if (!pattern || !value) return false;

    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`, 'i').test(value);
  }
}

export async function loadConfig(configPath = "config.toml") {
  try {
    const loaded = await loadToml(configPath);
    const configData = loaded || {};
    const config = new Config(configData);
    console.log("✅ Configuration loaded successfully with failover support");
    return config;
  } catch (e) {
    logger.error(`❌ Configuration Error: ${e?.message || e}`);
    throw e;
  }
}
