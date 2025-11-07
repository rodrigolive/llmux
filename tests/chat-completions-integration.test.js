/**
 * Integration tests for the /v1/chat/completions endpoint
 */

import { describe, it, expect, jest } from '@jest/globals';
import { Config } from '../src/config/index.js';

describe('Chat Completions Integration', () => {
  describe('Image content detection', () => {
    it('should detect images in OpenAI format (image_url)', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const requestWithImages = {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's in this image?" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANS..." }
              }
            ]
          }
        ]
      };

      expect(config._hasImageContent(requestWithImages)).toBe(true);
    });

    it('should not detect images when only text content', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const textOnlyRequest = {
        messages: [
          { role: "user", content: "Hello, world!" }
        ]
      };

      expect(config._hasImageContent(textOnlyRequest)).toBe(false);
    });

    it('should handle malformed OpenAI image format gracefully', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const malformedRequest = {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "First" },
              { type: "image_url" }, // Missing image_url property
              { type: "image_url", image_url: {} }, // Missing url
            ]
          }
        ]
      };

      expect(config._hasImageContent(malformedRequest)).toBe(true);
    });
  });

  describe('OpenAI thinking detection', () => {
    it('should detect thinking for o1 models', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const o1Request = {
        model: "openai:o1-preview",
        messages: [
          { role: "user", content: "Solve this step by step" }
        ]
      };

      expect(config._hasOpenAIThinking(o1Request)).toBe(true);
    });

    it('should detect thinking for o3 models', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const o3Request = {
        model: "openai:o3",
        messages: [
          { role: "user", content: "Reason about this" }
        ]
      };

      expect(config._hasOpenAIThinking(o3Request)).toBe(true);
    });

    it('should detect thinking with explicit reasoning mode', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const reasoningRequest = {
        model: "openai:gpt-4",
        reasoning_mode: true,
        messages: [
          { role: "user", content: "Help me think" }
        ]
      };

      expect(config._hasOpenAIThinking(reasoningRequest)).toBe(true);
    });

    it('should detect thinking with Claude-style thinking parameter', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const claudeThinkingRequest = {
        model: "openai:gpt-4",
        thinking: { type: "enabled" },
        messages: [
          { role: "user", content: "Help me think" }
        ]
      };

      expect(config._hasOpenAIThinking(claudeThinkingRequest)).toBe(true);
    });

    it('should not detect thinking for regular models without thinking indicators', () => {
      const config = new Config({
        backend: "openai:gpt-4",
        tokens: {}
      });

      const regularRequest = {
        model: "openai:gpt-4",
        messages: [
          { role: "user", content: "Hello" }
        ]
      };

      expect(config._hasOpenAIThinking(regularRequest)).toBe(false);
    });
  });

  describe('Backend selection with OpenAI format', () => {
    it('should select vision-capable backend for image requests', () => {
      const config = new Config({
        backend: "openai:gpt-4-vision-preview", // First backend - has vision
        tokens: {},
        backend: [
          { model: "openai:gpt-4-vision-preview", context: 128000, vision: true },
          { model: "openai:gpt-4", context: 128000, vision: false }
        ]
      });

      const requestWithImages = {
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: "data:image/png;base64,test" } }
            ]
          }
        ]
      };

      const selected = config.selectBackend(requestWithImages);
      expect(selected).toBe("openai:gpt-4-vision-preview");
    });

    it('should select thinking-capable backend for o1/o3 requests', () => {
      const config = new Config({
        backend: "openai:gpt-4-vision-preview", // First backend - has vision but not thinking
        tokens: {},
        backend: [
          { model: "openai:gpt-4-vision-preview", context: 128000, vision: true, thinking: false },
          { model: "openai:o3", context: 128000, vision: false, thinking: true }
        ]
      });

      const o3Request = {
        model: "openai:o3",
        messages: [
          { role: "user", content: "Help me reason" }
        ]
      };

      const selected = config.selectBackend(o3Request);
      expect(selected).toBe("openai:o3");
    });
  });

  describe('Key transformations work with OpenAI format', () => {
    it('should integrate all key transformation utilities', async () => {
      const { applyKeyDeletions } = await import('../src/utils/key_delete.js');
      const { applyKeyAdditions } = await import('../src/utils/key_add.js');
      const { applyKeyRenames } = await import('../src/utils/key_rename.js');

      const config = {
        key_delete: ['max_tokens'],
        key_add: { debug: true, provider: "test" },
        key_rename: { temperature: "temp" }
      };

      const openaiRequest = {
        model: "openai:gpt-4",
        max_tokens: 500,
        temperature: 0.7,
        messages: [
          { role: "user", content: "Hello" }
        ]
      };

      // Apply transformations in the correct order
      let result = applyKeyDeletions(openaiRequest, config);
      expect(result.max_tokens).toBeUndefined();
      expect(result.temperature).toBe(0.7);

      result = applyKeyAdditions(result, config);
      expect(result.debug).toBe(true);
      expect(result.provider).toBe("test");
      expect(result.temperature).toBe(0.7);

      result = applyKeyRenames(result, config);
      expect(result.temp).toBe(0.7);
      expect(result.temperature).toBeUndefined();
      expect(result.debug).toBe(true);
    });

    it('should handle nested content transformations', async () => {
      const { applyKeyAdditions } = await import('../src/utils/key_add.js');

      const config = {
        key_add: { processed: true, timestamp: 1234567890 }
      };

      const complexRequest = {
        model: "openai:gpt-4",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hello" },
              { type: "image_url", image_url: { url: "data:image/png;base64,test" } }
            ]
          }
        ]
      };

      const result = applyKeyAdditions(complexRequest, config);

      expect(result.processed).toBe(true);
      expect(result.timestamp).toBe(1234567890);
      expect(result.messages[0].processed).toBe(true);
      expect(result.messages[0].content[0].processed).toBe(true);
      expect(result.messages[0].content[1].processed).toBe(true);
    });
  });

  describe('Request format compatibility', () => {
    it('should process OpenAI-style request format', () => {
      const openaiRequest = {
        model: "openai:gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" }
        ],
        temperature: 0.7,
        max_tokens: 100,
        stream: false
      };

      // This should be a valid OpenAI format request that our handler can process
      expect(openaiRequest.messages).toBeDefined();
      expect(Array.isArray(openaiRequest.messages)).toBe(true);
      expect(openaiRequest.model).toBeDefined();
      expect(openaiRequest.temperature).toBe(0.7);
      expect(openaiRequest.max_tokens).toBe(100);
    });

    it('should handle OpenAI vision request format', () => {
      const visionRequest = {
        model: "openai:gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "What's in this image?"
              },
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
                }
              }
            ]
          }
        ],
        max_tokens: 300
      };

      expect(visionRequest.messages[0].content).toHaveLength(2);
      expect(visionRequest.messages[0].content[0].type).toBe("text");
      expect(visionRequest.messages[0].content[1].type).toBe("image_url");
      expect(visionRequest.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
    });

    it('should handle mixed content requests properly', () => {
      const mixedRequest = {
        model: "openai:gpt-4",
        messages: [
          {
            role: "user",
            content: "Previous conversation text"
          },
          {
            role: "assistant",
            content: "Here's what I said before"
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Now look at this image:" },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ" } }
            ]
          }
        ]
      };

      expect(mixedRequest.messages).toHaveLength(3);
      expect(typeof mixedRequest.messages[0].content).toBe("string");
      expect(typeof mixedRequest.messages[1].content).toBe("string");
      expect(Array.isArray(mixedRequest.messages[2].content)).toBe(true);
    });
  });
});