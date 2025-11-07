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

export async function startServer({ configPath = "config.toml", host = null, port = null } = {}) {
  const config = await loadConfig(configPath);
  setLogLevel(config.log_level);

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
  console.log(`   Client Authentication: ${config.tokens && Object.keys(config.tokens).length ? "Enabled" : "Disabled"}`);
  console.log("");

  const server = Bun.serve({
    hostname: actualHost,
    port: actualPort,
    idleTimeout: 120,
    development: process.env.NODE_ENV !== "production",
    fetch: router,
  });

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