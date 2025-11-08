export const Colors = {
  CYAN: "\x1b[96m",
  BLUE: "\x1b[94m",
  GREEN: "\x1b[92m",
  YELLOW: "\x1b[93m",
  RED: "\x1b[91m",
  MAGENTA: "\x1b[95m",
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  UNDERLINE: "\x1b[4m",
  DIM: "\x1b[2m",
};

const logLevels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
const LogLevelRank = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 };

let CURRENT_LOG_LEVEL = "INFO";

export function setLogLevel(lvl) {
  const L = (lvl || "INFO").toUpperCase().split(/\s+/)[0];
  CURRENT_LOG_LEVEL = logLevels.includes(L) ? L : "INFO";
}

function logAt(level, ...args) {
  if (LogLevelRank[level] >= LogLevelRank[CURRENT_LOG_LEVEL]) {
    console.log(...args);
  }
}

export const logger = {
  debug: (...a) => logAt("DEBUG", Colors.DIM, "[DEBUG]", Colors.RESET, ...a),
  info: (...a) => logAt("INFO", Colors.BLUE, "[INFO ]", Colors.RESET, ...a),
  warn: (...a) => logAt("WARNING", Colors.YELLOW, "[WARN ]", Colors.RESET, ...a),
  warning: (...a) => logAt("WARNING", Colors.YELLOW, "[WARN ]", Colors.RESET, ...a),
  error: (...a) => logAt("ERROR", Colors.RED, "[ERROR]", Colors.RESET, ...a),
  critical: (...a) => logAt("CRITICAL", Colors.MAGENTA, "[CRIT ]", Colors.RESET, ...a),
};

export function log_request_beautifully({
  method,
  path,
  claude_model,
  openai_model,
  num_messages,
  num_tools,
  status_code,
  num_tokens,
  output_tokens,
  tokens_per_sec,
  duration_ms,
  config = null,
  has_images = false,
  thinking = false,
  stream = false,
  temperature = null,
  max_tokens = null,
  tools = null,
}) {
  const claude_display = `${Colors.CYAN}${claude_model}${Colors.RESET}`;
  let openai_display = openai_model || "";
  if (openai_display.includes("/")) {
    openai_display = openai_display.split("/").pop();
  }
  openai_display = `${Colors.GREEN}${openai_display}${Colors.RESET}`;

  const tools_str = num_tools != null ? `${Colors.MAGENTA}${num_tools}🆃${Colors.RESET}` : "";
  const messages_str = num_messages != null ? `${Colors.BLUE}${num_messages}🅼${Colors.RESET}` : "";
  const input_tokens_str = num_tokens != null ? `${Colors.YELLOW}${num_tokens}↑${Colors.RESET}` : "";
  const output_tokens_str = output_tokens != null ? `${Colors.YELLOW}${output_tokens}↓${Colors.RESET}` : "";
  const tps_str = tokens_per_sec != null ? `${Colors.YELLOW}${tokens_per_sec.toFixed(1)} t/s${Colors.RESET}` : "";
  const status_str = status_code === 200
    ? `${Colors.GREEN}✓ ${status_code} OK${Colors.RESET}`
    : `${Colors.RED}✗ ${status_code}${Colors.RESET}`;

  const timestamp = new Date().toISOString().replace('T', ' ');

  // Build request flags (only if config allows)
  let flags_str = '';
  if (config?.log_request_details) {
    const flags = [];
    if (has_images) flags.push('image');
    if (thinking) flags.push('thinking');
    if (stream) flags.push('stream');
    if (max_tokens != null) flags.push(`max=${max_tokens}`);
    if (temperature != null) flags.push(`t=${temperature}`);
    if (tools && Array.isArray(tools) && tools.length > 0) {
      const tool_names = tools.map(t => t.name || t).filter(Boolean).join(',');
      if (tool_names) flags.push(`tools=${tool_names}`);
    }
    flags_str = flags.length > 0 ? `${Colors.DIM}▤ ${flags.join(', ')}${Colors.RESET}` : '';
  }

  const log_line = `${Colors.BOLD}${method} ${path}${Colors.RESET} ${status_str} ${Colors.DIM}⧗ ${timestamp}${Colors.RESET}${flags_str ? ' ' + flags_str : ''}`;
  const parts = [claude_display, "→", openai_display, tools_str, messages_str, input_tokens_str, output_tokens_str, "tks"];
  let model_line = parts.filter(p => String(p).trim()).join(" ");
  if (tokens_per_sec != null) model_line += ` ${tps_str}`;
  if (duration_ms != null) model_line += ` ${Colors.YELLOW}${duration_ms.toFixed(0)} ms${Colors.RESET}`;

  console.log(log_line);
  console.log(model_line);
}

export function log_failover_beautifully(error_code, original_model, failover_backend, num_tokens) {
  const error_display = `${Colors.RED}${error_code}${Colors.RESET}`;
  const claude_display = `${Colors.CYAN}${original_model}${Colors.RESET}`;
  let backend_display = failover_backend;
  if (backend_display.includes("/")) backend_display = backend_display.split("/").pop();
  backend_display = `${Colors.YELLOW}${backend_display}${Colors.RESET}`;
  const tokens_display = `${Colors.GREEN}${num_tokens}${Colors.RESET}`;
  const line = `${Colors.BOLD}failover: ${error_display} | ${claude_display} → ${backend_display} (${tokens_display} tokens)${Colors.RESET}`;
  console.log(line);
}

export function log_tool_error_details(error, request, original_request) {
  const s = String(error?.message || error || "");
  if (!s.toLowerCase().includes("tool")) return;
  const tools_list = request?.tools ?? [];
  const tool_names = [];
  for (const t of tools_list) {
    if (t && typeof t === "object") {
      if ("function" in t) {
        tool_names.push(t.function?.name || "");
      } else if ("name" in t) {
        tool_names.push(t.name || "");
      }
    }
  }
  logger.error(`Tools list sent with request: ${JSON.stringify(tool_names)}`);

  // current_tool_calls is maintained in streaming functions only; skip here.

  logger.error("Full error (stack if any):", error?.stack || s);
}