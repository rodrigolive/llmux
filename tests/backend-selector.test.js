import { Config } from '../src/config/index.js';

describe('Backend Selector', () => {
  let config;

  beforeEach(() => {
    // Mock config with test backends
    const mockCfg = {
      backend: [
        {
          model: "cerebras_gig:zai-glm-4.6",
          context: 131000,
          vision: false,
          thinking: false
        },
        {
          model: "synthetic:hf:zai-org/GLM-4.6",
          context: 198000,
          vision: false,
          thinking: false
        },
        {
          model: "openai:gpt-4.1-mini",
          context: 1000000,
          vision: true,
          thinking: false
        },
        {
          model: "openai:o3",
          context: 1000000,
          vision: false,
          thinking: true,
          model_match: ["*opus*"]
        },
        {
          model: "anthropic:claude-3-5-sonnet-20241022",
          context: 200000,
          vision: false,
          thinking: true
        }
      ]
    };
    config = new Config(mockCfg);
  });

  describe('Basic Selection', () => {
    test('should select first available backend for simple request', () => {
      const request = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello world" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      const selected = config.selectBackend(request);
      expect(selected).toBe("cerebras_gig:zai-glm-4.6");
    });
  });

  describe('Vision Support', () => {
    test('should select backend with vision support for image requests', () => {
      const imageRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "iVBORw0KGgoAAAANSUhEUgAA..."
                }
              },
              {
                type: "text",
                text: "What's in this picture?"
              }
            ]
          }
        ],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      const selected = config.selectBackend(imageRequest);
      expect(selected).toBe("openai:gpt-4.1-mini"); // First backend with vision=true
    });

    test('should skip non-vision backends for image requests', () => {
      const imageRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: "test-data"
                }
              },
              {
                type: "text",
                text: "Analyze this image"
              }
            ]
          }
        ],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      const selected = config.selectBackend(imageRequest);
      // Should skip cerebras_gig and synthetic (vision=false) and select openai:gpt-4.1-mini
      expect(selected).toBe("openai:gpt-4.1-mini");
    });
  });

  describe('Thinking Support', () => {
    test('should select backend with thinking support for thinking enabled requests', () => {
      const thinkingRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Why is the sky blue?" }],
        max_tokens: 4000,
        thinking: {
          type: "enabled",
          budget_tokens: 16000
        }
      };

      const selected = config.selectBackend(thinkingRequest);
      expect(selected).toBe("anthropic:claude-3-5-sonnet-20241022"); // First backend with thinking=true
    });

    test('should select non-thinking backend when thinking is disabled', () => {
      const noThinkingRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Why is the sky blue?" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      const selected = config.selectBackend(noThinkingRequest);
      expect(selected).toBe("cerebras_gig:zai-glm-4.6"); // First backend (thinking doesn't matter when disabled)
    });
  });

  describe('Context Limits', () => {
    test('should skip backend if request exceeds context limit', () => {
      const largeRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Large request" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // Request size exceeds first backend (131,000) but not second (198,000)
      const selected = config.selectBackend(largeRequest, 150000);
      expect(selected).toBe("synthetic:hf:zai-org/GLM-4.6");
    });

    test('should skip multiple backends that exceed context limits', () => {
      const hugeRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Huge request" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // Request size exceeds first three backends but not ones with 1M context
      const selected = config.selectBackend(hugeRequest, 500000);
      expect(selected).toBe("openai:gpt-4.1-mini"); // First backend with 1M context
    });

    test('should return null if all backends exceed context limit', () => {
      const impossibleRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Impossible request" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // Request size exceeds all backend context limits
      const selected = config.selectBackend(impossibleRequest, 2000000);
      expect(selected).toBeNull();
    });
  });

  describe('Failed Backends', () => {
    test('should skip failed backends and try alternatives', () => {
      const request = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello world" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // First backend failed
      const selected = config.selectBackend(request, 0, ["cerebras_gig:zai-glm-4.6"]);
      expect(selected).toBe("synthetic:hf:zai-org/GLM-4.6");
    });

    test('should skip multiple failed backends', () => {
      const request = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello world" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // First two backends failed
      const selected = config.selectBackend(request, 0, [
        "cerebras_gig:zai-glm-4.6",
        "synthetic:hf:zai-org/GLM-4.6"
      ]);
      expect(selected).toBe("openai:gpt-4.1-mini");
    });

    test('should return null if all backends failed', () => {
      const request = {
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: "Hello world" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // All backends failed
      const selected = config.selectBackend(request, 0, [
        "cerebras_gig:zai-glm-4.6",
        "synthetic:hf:zai-org/GLM-4.6",
        "openai:gpt-4.1-mini",
        "openai:o3",
        "anthropic:claude-3-5-sonnet-20241022"
      ]);
      expect(selected).toBeNull();
    });
  });

  describe('Model Matching', () => {
    test('should use model_match patterns for selection', () => {
      const opusRequest = {
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "Opus question" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      const selected = config.selectBackend(opusRequest);
      expect(selected).toBe("cerebras_gig:zai-glm-4.6"); // First backend matches (no pattern restrictions)
    });

    test('should use opus-patterned backend for opus models when thinking is enabled', () => {
      const opusThinkingRequest = {
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "Complex opus question" }],
        max_tokens: 4000,
        thinking: { type: "enabled" }
      };

      const selected = config.selectBackend(opusThinkingRequest);
      expect(selected).toBe("openai:o3"); // First thinking backend that matches *opus* pattern
    });

    test('should skip backend with model_match if pattern does not match', () => {
      const sonnetRequest = {
        model: "claude-3-sonnet-20240229",
        messages: [{ role: "user", content: "Sonnet question" }],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      const selected = config.selectBackend(sonnetRequest);
      expect(selected).toBe("cerebras_gig:zai-glm-4.6"); // Skips openai:o3 (no match), uses first available
    });
  });

  describe('Combined Constraints', () => {
    test('should handle vision + thinking constraints together', () => {
      // No backend has both vision=true and thinking=true
      const visionThinkingRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "test-data"
                }
              },
              {
                type: "text",
                text: "Analyze this image with reasoning"
              }
            ]
          }
        ],
        max_tokens: 4000,
        thinking: { type: "enabled" }
      };

      const selected = config.selectBackend(visionThinkingRequest);
      expect(selected).toBeNull(); // No backend satisfies both vision=true and thinking=true
    });

    test('should handle context + vision constraints together', () => {
      const largeVisionRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "test-data"
                }
              },
              {
                type: "text",
                text: "Large image analysis request"
              }
            ]
          }
        ],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // Request size: 500,000 tokens, needs vision
      // Only openai:gpt-4.1-mini has both vision=true and context >= 500,000 (it has 1M)
      const selected = config.selectBackend(largeVisionRequest, 500000);
      expect(selected).toBe("openai:gpt-4.1-mini");
    });

    test('should handle failed backends + constraints together', () => {
      const imageRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "test-data"
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        thinking: { type: "disabled" }
      };

      // Vision request but vision backend failed
      const selected = config.selectBackend(imageRequest, 0, ["openai:gpt-4.1-mini"]);
      expect(selected).toBeNull(); // No other backend supports vision
    });
  });

  describe('Helper Functions', () => {
    test('should correctly detect image content in requests', () => {
      const imageRequest = {
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", data: "test" } },
              { type: "text", text: "analyze" }
            ]
          }
        ]
      };

      const textRequest = {
        messages: [
          {
            role: "user",
            content: "plain text message"
          }
        ]
      };

      expect(config._hasImageContent(imageRequest)).toBe(true);
      expect(config._hasImageContent(textRequest)).toBe(false);
      expect(config._hasImageContent({})).toBe(false);
      expect(config._hasImageContent({ messages: [] })).toBe(false);
    });

    test('should correctly match patterns', () => {
      expect(config._matchPattern("*opus*", "claude-3-opus-20240229")).toBe(true);
      expect(config._matchPattern("*opus*", "some-opus-model")).toBe(true);
      expect(config._matchPattern("*opus*", "claude-3-sonnet-20240229")).toBe(false);
      expect(config._matchPattern("claude-*", "claude-3-sonnet")).toBe(true);
      expect(config._matchPattern("", "anything")).toBe(false);
      expect(config._matchPattern("*", "")).toBe(true);
    });
  });
});