import { loadConfig } from "./config/index.js";
import { setLogLevel, logger, Colors } from "./logging.js";
import { ModelManager } from "./model/manager.js";
import { OpenAIClient } from "./provider/openai_client.js";
import { buildMessagesHandler } from "./api/handlers/messages.js";
import { buildCountTokensHandler } from "./api/handlers/count_tokens.js";
import { buildHealthHandler } from "./api/handlers/health.js";
import { buildRootHandler } from "./api/handlers/root.js";
import { buildTestConnectionHandler } from "./api/handlers/test_connection.js";
import { createRouter } from "./http/router.js";

export async function startServer({ configPath = "config.toml", host = null, port = null, https_enabled = null, ssl_key_file = null, ssl_cert_file = null, ssl_ca_file = null } = {}) {
  const config = await loadConfig(configPath);
  setLogLevel(config.log_level);

  // Override config with CLI flags
  if (https_enabled !== null) config.https_enabled = https_enabled;
  if (ssl_key_file !== null) config.ssl_key_file = ssl_key_file;
  if (ssl_cert_file !== null) config.ssl_cert_file = ssl_cert_file;
  if (ssl_ca_file !== null) config.ssl_ca_file = ssl_ca_file;

  const model_manager = new ModelManager(config);
  const openai_client = new OpenAIClient(config, config.request_timeout);

  const handlers = {
    root: buildRootHandler({ config }),
    health: buildHealthHandler({ config }),
    testConnection: buildTestConnectionHandler({ config, openai_client }),
    messages: buildMessagesHandler({ config, model_manager, openai_client }),
    countTokens: buildCountTokensHandler({ config, model_manager }),
  };

  const router = createRouter(handlers);

  const actualHost = host || config.host;
  const actualPort = port ? Number(port) : config.port;

  console.log("🚀 Claude-to-OpenAI API Proxy v1.0.0 (Bun)");
  console.log("✅ Configuration loaded successfully");
  console.log(`   Backend: ${config.backend}`);
  if (Array.isArray(config.failover) && config.failover.length) {
    console.log(`   Failover: ${JSON.stringify(config.failover)}`);
  }
  console.log(`   Max Tokens Policy: ${config.max_tokens_limit}`);
  console.log(`   Min Tokens Policy: ${config.min_tokens_limit}`);
  console.log(`   Request Timeout: ${config.request_timeout}s`);
  console.log(`   Server: ${actualHost}:${actualPort}`);
  console.log(`   HTTPS: ${config.https_enabled ? "Enabled" : "Disabled"}`);
  if (config.https_enabled) {
    if (config.ssl_key_file) console.log(`   SSL Key: ${config.ssl_key_file}`);
    if (config.ssl_cert_file) console.log(`   SSL Cert: ${config.ssl_cert_file}`);
    if (config.ssl_ca_file) console.log(`   SSL CA: ${config.ssl_ca_file}`);
  }
  console.log(`   Client Authentication: ${config.tokens && Object.keys(config.tokens).length ? "Enabled" : "Disabled"}`);
  console.log("");

  const serverOptions = {
    hostname: actualHost,
    port: actualPort,
    idleTimeout: 120,
    development: process.env.NODE_ENV !== "production",
    fetch: router,
  };

  // Add SSL options if HTTPS is enabled
  if (config.https_enabled) {
    if (!config.ssl_key_file || !config.ssl_cert_file) {
      throw new Error("HTTPS enabled but ssl_key_file or ssl_cert_file not specified in config");
    }

    try {
      const keyContent = await Bun.file(config.ssl_key_file).text();
      const certContent = await Bun.file(config.ssl_cert_file).text();
      const caContent = config.ssl_ca_file ? await Bun.file(config.ssl_ca_file).text() : undefined;

      serverOptions.tls = {
        key: keyContent,
        cert: certContent,
        ca: caContent,
      };
    } catch (error) {
      throw new Error(`Failed to load SSL certificates: ${error.message}`);
    }
  }

  const server = Bun.serve(serverOptions);

  return { server, config };
}

function shutdown(sig, server) {
  console.log(Colors.DIM, `\nReceived ${sig}, shutting down...`, Colors.RESET);
  try {
    server.stop(true);
  } catch {}
  process.exit(0);
}

// Start server if this file is run directly
if (import.meta.main) {
  startServer().then(({ server }) => {
    logger.info(`${Colors.GREEN}Listening on${Colors.RESET} ${Colors.BOLD}http://${server.hostname}:${server.port}${Colors.RESET}`);

    // Graceful shutdown
    process.on("SIGINT", () => shutdown("SIGINT", server));
    process.on("SIGTERM", () => shutdown("SIGTERM", server));
  }).catch((e) => {
    logger.error("Failed to start server:", e?.message || e);
    process.exit(1);
  });
}