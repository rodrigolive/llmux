#!/usr/bin/env bun
import { startServer } from "./server.js";
import { Colors } from "./logging.js";

const argv = Bun.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Claude-to-OpenAI API Proxy v1.0.0 (Bun)
Usage:
  bun run cli.js [--config ./config.toml] [--host 0.0.0.0] [--port 8082] [--https] [--ssl-key /path/to/key.pem] [--ssl-cert /path/to/cert.pem] [--ssl-ca /path/to/ca.pem]
  bun run cli.js --help

Flags override config.toml minimally for convenience.`);
  process.exit(0);
}

const getFlag = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i+1] ? argv[i+1] : d;
};

const getBoolFlag = (k, d = false) => {
  return argv.includes(k) ? true : d;
};

const overrides = {
  configPath: getFlag("--config", "config.toml"),
  host: getFlag("--host", null),
  port: getFlag("--port", null),
  https_enabled: getBoolFlag("--https", null),
  ssl_key_file: getFlag("--ssl-key", null),
  ssl_cert_file: getFlag("--ssl-cert", null),
  ssl_ca_file: getFlag("--ssl-ca", null),
};

const { server, config } = await startServer({
  configPath: overrides.configPath,
  host: overrides.host,
  port: overrides.port,
  https_enabled: overrides.https_enabled,
  ssl_key_file: overrides.ssl_key_file,
  ssl_cert_file: overrides.ssl_cert_file,
  ssl_ca_file: overrides.ssl_ca_file
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

