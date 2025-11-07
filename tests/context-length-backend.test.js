import { test, describe, expect, beforeEach } from '@jest/globals';
import { Config } from '../src/config/index.js';

describe('Context Length Backend Selection', () => {
  let config;

  beforeEach(() => {
    // Mock configuration with multiple backends and their context limits
    const mockConfig = {
      backend: [
        { model: "cerebras_gig:zai-glm-4.6", context: 131000 },
        { model: "synthetic:hf:zai-org/GLM-4.6", context: 198000 },
        { model: "openai:gpt-4.1-mini", context: 1000000, vision: true },
        { model: "openai:o3", context: 1000000, thinking: true }
      ],
      tokens: {},
      provider: {}
    };
    config = new Config(mockConfig);
  });

  test('should select backend with sufficient context limit', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "Hello" }
      ]
    };

    // Test with 150k tokens - should select synthetic backend (198k context)
    const selectedBackend = config.selectBackend(request, 150000);
    expect(selectedBackend).toBe("synthetic:hf:zai-org/GLM-4.6");
  });

  test('should select backend with highest context when exceeding primary', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "A".repeat(200000) } // Large content
      ]
    };

    // Test with 500k tokens - should select openai backend (1M context)
    const selectedBackend = config.selectBackend(request, 500000);
    expect(selectedBackend).toBe("openai:gpt-4.1-mini");
  });

  test('should return null when no backend can handle the context length', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "A".repeat(2000000) } // Very large content
      ]
    };

    // Test with 2M tokens - no backend can handle this
    const selectedBackend = config.selectBackend(request, 2000000);
    expect(selectedBackend).toBeNull();
  });

  test('should filter out failed backends from selection', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "Hello" }
      ]
    };

    // Test with failed backends
    const failedBackends = ["synthetic:hf:zai-org/GLM-4.6"];

    // With 150k tokens and synthetic backend failed, should select openai:gpt-4.1-mini
    // since cerebras only supports 131k and synthetic is failed
    const selectedBackend = config.selectBackend(request, 150000, failedBackends);
    expect(selectedBackend).toBe("openai:gpt-4.1-mini");

    // With 100k tokens and synthetic failed, should select cerebras
    const selectedBackend2 = config.selectBackend(request, 100000, failedBackends);
    expect(selectedBackend2).toBe("cerebras_gig:zai-glm-4.6");
  });

  test('should respect context limits exactly at boundary', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "Hello" }
      ]
    };

    // Test exactly at the limit - should still work
    const selectedBackend = config.selectBackend(request, 131000);
    expect(selectedBackend).toBe("cerebras_gig:zai-glm-4.6");

    // Test one over the limit - should fail to next available backend
    const selectedBackend2 = config.selectBackend(request, 131001);
    expect(selectedBackend2).toBe("synthetic:hf:zai-org/GLM-4.6");
  });

  test('should prioritize backends by order in config when multiple can handle context', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "Hello" }
      ]
    };

    // With small request, should select the first backend (cerebras)
    const selectedBackend = config.selectBackend(request, 1000);
    expect(selectedBackend).toBe("cerebras_gig:zai-glm-4.6");
  });

  test('should handle vision and thinking requirements with context limits', () => {
    const visionRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAA..." } },
            { type: "text", text: "What's in this image?" }
          ]
        }
      ]
    };

    const thinkingRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "Solve this complex problem" }
      ],
      thinking: { type: "enabled" }
    };

    // Vision request should only select backends with vision support
    const visionBackend = config.selectBackend(visionRequest, 1000);
    expect(visionBackend).toBe("openai:gpt-4.1-mini"); // First backend with vision=true

    // Thinking request should only select backends with thinking support
    const thinkingBackend = config.selectBackend(thinkingRequest, 1000);
    expect(thinkingBackend).toBe("openai:o3"); // First backend with thinking=true
  });
});