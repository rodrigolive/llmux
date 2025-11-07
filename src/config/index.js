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

    this.backend = cfg?.backend ?? "openai:gpt-4o";
    if (!String(this.backend).includes(":")) {
      throw new Error("Backend must be in provider:model format");
    }
    const [provider, model] = this.backend.split(":", 2);
    this.provider = provider;
    this.model = model;

    this.failover = Array.isArray(cfg?.failover) ? [...cfg.failover] : [];

    this.providers = cfg?.provider ?? {};

    this.host = String(cfg?.host ?? "0.0.0.0");
    this.port = Number(cfg?.port ?? 8082);
    this.log_level = String(cfg?.log_level ?? "INFO");
    this.max_tokens_limit = cfg?.max_tokens_limit ?? 4096;
    this.min_tokens_limit = cfg?.min_tokens_limit ?? 100;

    this.request_timeout = Number(cfg?.request_timeout ?? 90);
    this.max_retries = Number(cfg?.max_retries ?? 2);

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