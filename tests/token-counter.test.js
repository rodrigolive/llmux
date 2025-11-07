import { estimateTokens } from '../src/utils/token-counter.js';

describe('Token Counter', () => {
  test('should count tokens for simple text request', () => {
    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "Why is the sky blue?" }
      ],
      max_tokens: 4000,
      thinking: { type: "disabled" }
    };

    const tokens = estimateTokens(request);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(50); // Should be reasonable for short text
  });

  test('should count tokens for multi-message conversation', () => {
    const request = {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello, how are you?" },
        { role: "assistant", content: "I'm doing well, thank you for asking!" },
        { role: "user", content: "Can you explain quantum physics?" }
      ],
      max_tokens: 1000
    };

    const tokens = estimateTokens(request);
    expect(tokens).toBeGreaterThan(20);
    expect(tokens).toBeLessThan(200);
  });

  test('should handle image content with text', () => {
    const request = {
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

    const tokens = estimateTokens(request);
    expect(tokens).toBeGreaterThan(85); // At least 85 for the image + text tokens
    expect(tokens).toBeLessThan(150);
  });

  test('should handle multiple images', () => {
    const request = {
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: "test-data-1"
              }
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: "test-data-2"
              }
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: "test-data-3"
              }
            },
            {
              type: "text",
              text: "Compare these three images."
            }
          ]
        }
      ],
      max_tokens: 4000
    };

    const tokens = estimateTokens(request);
    expect(tokens).toBeGreaterThan(255); // 85 * 3 images + text tokens
    expect(tokens).toBeLessThan(350);
  });

  test('should handle empty or invalid content gracefully', () => {
    const emptyRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: "" }
      ]
    };

    const nullContentRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: null }
      ]
    };

    const noMessagesRequest = {
      model: "claude-3-5-sonnet-20241022"
    };

    expect(estimateTokens(emptyRequest)).toBeLessThan(10); // Should be very low for empty content
    expect(estimateTokens(nullContentRequest)).toBeLessThan(10);
    expect(estimateTokens(noMessagesRequest)).toBe(0);
  });

  test('should include system prompt tokens', () => {
    const requestWithSystem = {
      model: "gpt-4",
      system: "You are an expert in quantum physics and mathematics.",
      messages: [
        { role: "user", content: "Explain Bell's theorem." }
      ]
    };

    const requestWithoutSystem = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "Explain Bell's theorem." }
      ]
    };

    const tokensWithSystem = estimateTokens(requestWithSystem);
    const tokensWithoutSystem = estimateTokens(requestWithoutSystem);

    expect(tokensWithSystem).toBeGreaterThan(tokensWithoutSystem);
    expect(tokensWithSystem - tokensWithoutSystem).toBeGreaterThanOrEqual(8); // System prompt should add tokens (allowing for variance)
  });

  test('should handle different model encodings', () => {
    const sameRequest = {
      messages: [
        { role: "user", content: "Test message with some content to count." }
      ]
    };

    const claudeTokens = estimateTokens({ ...sameRequest, model: "claude-3-5-sonnet-20241022" });
    const gpt4Tokens = estimateTokens({ ...sameRequest, model: "gpt-4" });
    const gpt35Tokens = estimateTokens({ ...sameRequest, model: "gpt-3.5-turbo" });

    // All should have reasonable token counts
    expect(claudeTokens).toBeGreaterThan(5);
    expect(gpt4Tokens).toBeGreaterThan(5);
    expect(gpt35Tokens).toBeGreaterThan(5);

    // They should be relatively similar (within reasonable variance)
    const diff = Math.max(claudeTokens, gpt4Tokens, gpt35Tokens) -
                  Math.min(claudeTokens, gpt4Tokens, gpt35Tokens);
    expect(diff).toBeLessThan(10); // Should be within 10 tokens of each other
  });
});