import { test, describe, expect, beforeEach } from '@jest/globals';
import { Config } from '../src/config/index.js';
import { estimateTokens } from '../src/utils/token-counter.js';

describe('Context Length Backend Detection Integration', () => {
  let config;

  beforeEach(() => {
    // Setup configuration with context limits matching real config.toml
    const mockConfig = {
      backend: [
        { model: "cerebras_gig:zai-glm-4.6", context: 131000 },
        { model: "synthetic:hf:zai-org/GLM-4.6", context: 198000 },
        { model: "openai:gpt-4.1-mini", context: 1000000, vision: true },
        { model: "openai:o3", context: 1000000, thinking: true }
      ],
      tokens: {
        "test-token": "ccr-4b7d8e9f1a3c5h2j6k9m3n7p5q8r2s4t6u9v3w7x5y8z2a4b6c8d0e3f7"
      },
      provider: {
        "cerebras_gig": { api_key: "test-key", base_url: "https://api.test.com/v1" },
        "synthetic": { api_key: "test-key", base_url: "https://api.test.com/v1" },
        "openai": { api_key: "test-key", base_url: "https://api.test.com/v1" }
      }
    };
    config = new Config(mockConfig);
  });

  test('should detect when request exceeds cerebras gig context and select synthetic', () => {
    // Create a request that would exceed cerebras gig (131k) but fit synthetic (198k)
    const largeRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: "Test content for context length detection. ".repeat(2000)
        }
      ],
      max_tokens: 4000,
      stream: false
    };

    // Use the actual error token count from your original report: 132086 > 131072
    const estimatedTokens = 132086;
    console.log(`Testing with your original error token count: ${estimatedTokens}`);

    const selectedBackend = config.selectBackend(largeRequest, estimatedTokens);
    const backendConfig = config.getBackendConfig(selectedBackend);

    console.log(`Selected backend: ${selectedBackend}`);
    console.log(`Backend context limit: ${backendConfig.context}`);

    // Should prefer synthetic over cerebras for this size
    expect(selectedBackend).toBe("synthetic:hf:zai-org/GLM-4.6");
    expect(backendConfig.context).toBe(198000);
  });

  test('should detect requests that exceed both small backends and select large backend', () => {
    // Create a request that would exceed both cerebras (131k) and synthetic (198k)
    const veryLargeRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: "A".repeat(1000) // Just some content, we'll use manual token count
        }
      ],
      max_tokens: 4000,
      stream: false
    };

    // Simulate a request that exceeds both small backends but fits openai (1M)
    const estimatedTokens = 200000;
    console.log(`Testing with token count exceeding both small backends: ${estimatedTokens}`);

    const selectedBackend = config.selectBackend(veryLargeRequest, estimatedTokens);
    const backendConfig = config.getBackendConfig(selectedBackend);

    console.log(`Selected backend: ${selectedBackend}`);
    console.log(`Backend context limit: ${backendConfig.context}`);

    expect(selectedBackend).toBe("openai:gpt-4.1-mini");
    expect(backendConfig.context).toBe(1000000);
  });

  test('should handle exact threshold scenarios correctly', () => {
    // Test the exact boundary where context errors occur
    const boundaryRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: "Test content at boundary".repeat(10000)
        }
      ]
    };

    // Test exact boundary conditions
    const testCases = [
      { tokens: 131000, expected: "cerebras_gig:zai-glm-4.6" },      // Exactly at limit
      { tokens: 131001, expected: "synthetic:hf:zai-org/GLM-4.6" },  // 1 over cerebras limit
      { tokens: 198000, expected: "synthetic:hf:zai-org/GLM-4.6" },  // Exactly at synthetic limit
      { tokens: 198001, expected: "openai:gpt-4.1-mini" },          // 1 over synthetic limit
    ];

    testCases.forEach(({ tokens, expected }) => {
      const selected = config.selectBackend(boundaryRequest, tokens);
      console.log(`Tokens: ${tokens} → Backend: ${selected} (expected: ${expected})`);
      expect(selected).toBe(expected);
    });
  });

  test('should detect context requirements for vision + large text combinations', () => {
    const visionLargeRequest = {
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
              text: "Vision analysis request"
            }
          ]
        }
      ],
      max_tokens: 4000,
      stream: false
    };

    // Skip slow token estimation and use manual value
    const estimatedTokens = 150000;
    console.log(`Vision request token count: ${estimatedTokens}`);

    // Should select the first backend that supports both vision AND large context
    const selectedBackend = config.selectBackend(visionLargeRequest, estimatedTokens);
    const backendConfig = config.getBackendConfig(selectedBackend);

    console.log(`Selected backend: ${selectedBackend}`);
    console.log(`Supports vision: ${backendConfig.vision}`);
    console.log(`Context limit: ${backendConfig.context}`);

    expect(selectedBackend).toBe("openai:gpt-4.1-mini");
    expect(backendConfig.vision).toBe(true);
    expect(backendConfig.context).toBe(1000000);
  });

  test('should detect context requirements for thinking + large text combinations', () => {
    const thinkingLargeRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: "Complex reasoning problem"
        }
      ],
      thinking: { type: "enabled" },
      max_tokens: 10000,
      stream: false
    };

    // Skip slow token estimation and use manual value
    const estimatedTokens = 250000;
    console.log(`Thinking request token count: ${estimatedTokens}`);

    // Should select the first backend that supports both thinking AND large context
    const selectedBackend = config.selectBackend(thinkingLargeRequest, estimatedTokens);
    const backendConfig = config.getBackendConfig(selectedBackend);

    console.log(`Selected backend: ${selectedBackend}`);
    console.log(`Supports thinking: ${backendConfig.thinking}`);
    console.log(`Context limit: ${backendConfig.context}`);

    expect(selectedBackend).toBe("openai:o3");
    expect(backendConfig.thinking).toBe(true);
    expect(backendConfig.context).toBe(1000000);
  });

  test('should return null for requests that exceed all available backends', () => {
    const extremelyLargeRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: "A".repeat(1000) // Just some content
        }
      ]
    };

    // Test with a token count that exceeds all available backends
    const estimatedTokens = 2000000; // 2M tokens exceeds all backends (max 1M)
    console.log(`Testing with extremely large token count: ${estimatedTokens}`);

    const selectedBackend = config.selectBackend(extremelyLargeRequest, estimatedTokens);

    console.log(`Selected backend: ${selectedBackend}`);
    expect(selectedBackend).toBeNull();
  });

  test('should respect failed backends when selecting for large context', () => {
    const largeRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: "A".repeat(150000) // Too large for cerebras, should use synthetic
        }
      ]
    };

    // Test with synthetic backend marked as failed
    const failedBackends = ["synthetic:hf:zai-org/GLM-4.6"];

    const selectedBackend = config.selectBackend(largeRequest, 150000, failedBackends);
    console.log(`Selected backend with synthetic failed: ${selectedBackend}`);

    // Should fall back to openai since synthetic is failed and cerebras is too small
    expect(selectedBackend).toBe("openai:gpt-4.1-mini");
  });
});