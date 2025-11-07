import { startServer } from "../server.js";
import { Colors } from "../logging.js";

export default {
  describe: 'Start the LLMux server',
  alias: 's',
  options: [
    {
      name: '--config',
      description: 'Path to configuration file',
      default: 'config.toml'
    },
    {
      name: '--host',
      description: 'Server host address',
      default: null
    },
    {
      name: '--port',
      description: 'Server port number',
      default: null
    },
    {
      name: '--https',
      description: 'Enable HTTPS',
      default: false
    },
    {
      name: '--ssl-key',
      description: 'Path to SSL key file',
      default: null
    },
    {
      name: '--ssl-cert',
      description: 'Path to SSL certificate file',
      default: null
    },
    {
      name: '--ssl-ca',
      description: 'Path to SSL CA file',
      default: null
    }
  ],
  examples: [
    'llmux start',
    'llmux start --port 8082',
    'llmux start --host 0.0.0.0 --port 8082',
    'llmux start --config config.toml --verbose',
    'llmux start --https --ssl-key ./key.pem --ssl-cert ./cert.pem',
    'llmux s -p 8082 --config custom.toml'
  ],
  action: async (opts) => {
    const { server, config } = await startServer({
      configPath: opts.config,
      host: opts.host,
      port: opts.port,
      https_enabled: opts.https,
      ssl_key_file: opts['ssl-key'],
      ssl_cert_file: opts['ssl-cert'],
      ssl_ca_file: opts['ssl-ca']
    });

    // Graceful shutdown (exact copy from original src/app.js)
    function shutdown(sig) {
      console.log(Colors.DIM, `\nReceived ${sig}, shutting down...`, Colors.RESET);
      try {
        server.stop(true);
      } catch {}
      process.exit(0);
    }
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
};