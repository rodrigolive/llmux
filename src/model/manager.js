export class ModelManager {
  constructor(config) {
    this.config = config;
  }

  map_claude_model_to_openai(claude_model) {
    if (String(claude_model).includes(":")) return claude_model;

    if (
      claude_model.startsWith("gpt-") ||
      claude_model.startsWith("o1-") ||
      claude_model.startsWith("ep-") ||
      claude_model.startsWith("doubao-") ||
      claude_model.startsWith("deepseek-") ||
      claude_model.startsWith("cerebras_")
    ) {
      return `${this.config.provider}:${claude_model}`;
    }
    const ml = String(claude_model || "").toLowerCase();
    if (ml.includes("haiku") || ml.includes("sonnet") || ml.includes("opus")) {
      return this.config.backend;
    }
    return this.config.backend;
  }
}