#!/usr/bin/env bun
import { startServer } from "./src/server.js";
import { Colors } from "./src/logging.js";

const argv = Bun.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Claude-to-OpenAI API Proxy v1.0.0 (Bun)
Usage:
  bun run cli.js [--config ./config.toml] [--host 0.0.0.0] [--port 8082]
  bun run cli.js --help

Flags override config.toml minimally for convenience.`);
  process.exit(0);
}

const getFlag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i+1] ? argv[i+1] : d;
};

const overrides = {
  configPath: getFlag("--config", "config.toml"),
  host: getFlag("--host", null),
  port: getFlag("--port", null),
};

const { server, config } = await startServer({
  configPath: overrides.configPath,
  host: overrides.host,
  port: overrides.port
});

// Graceful shutdown
function shutdown(sig) {
  console.log(Colors.DIM, `\nReceived ${sig}, shutting down...`, Colors.RESET);
  try {
    server.stop(true);
  } catch {}
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));