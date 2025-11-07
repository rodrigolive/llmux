/**
 * Tests for key renaming functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { renameKeys, applyKeyRenames } from '../src/utils/key_rename.js';

describe('key_rename utility functions', () => {
  describe('renameKeys', () => {
    it('should rename top-level keys', () => {
      const obj = {
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      };
      const keyMap = { max_tokens: 'max_completion_tokens' };

      const result = renameKeys(obj, keyMap);

      expect(result).toEqual({
        max_completion_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      });
    });

    it('should rename nested keys at any depth', () => {
      const obj = {
        messages: [{
          content: {
            max_tokens: 500,
            text: "hello"
          },
          max_tokens: 1000
        }],
        temperature: 0.7
      };
      const keyMap = { max_tokens: 'max_completion_tokens' };

      const result = renameKeys(obj, keyMap);

      expect(result).toEqual({
        messages: [{
          content: {
            max_completion_tokens: 500,
            text: "hello"
          },
          max_completion_tokens: 1000
        }],
        temperature: 0.7
      });
    });

    it('should handle arrays of objects', () => {
      const obj = {
        tools: [
          { max_tokens: 100, name: "tool1" },
          { max_tokens: 200, name: "tool2" }
        ]
      };
      const keyMap = { max_tokens: 'max_completion_tokens' };

      const result = renameKeys(obj, keyMap);

      expect(result).toEqual({
        tools: [
          { max_completion_tokens: 100, name: "tool1" },
          { max_completion_tokens: 200, name: "tool2" }
        ]
      });
    });

    it('should handle multiple key mappings', () => {
      const obj = {
        max_tokens: 1000,
        stop_sequences: ["stop"],
        temperature: 0.7
      };
      const keyMap = {
        max_tokens: 'max_completion_tokens',
        stop_sequences: 'stop'
      };

      const result = renameKeys(obj, keyMap);

      expect(result).toEqual({
        max_completion_tokens: 1000,
        stop: ["stop"],
        temperature: 0.7
      });
    });

    it('should preserve values that are not objects', () => {
      const obj = {
        string: "hello",
        number: 42,
        boolean: true,
        null: null
      };
      const keyMap = {};

      const result = renameKeys(obj, keyMap);

      expect(result).toEqual(obj);
    });

    it('should handle empty objects and arrays', () => {
      const obj = {
        empty_object: {},
        empty_array: [],
        nested: {
          empty: {}
        }
      };
      const keyMap = {};

      const result = renameKeys(obj, keyMap);

      expect(result).toEqual(obj);
    });
  });

  describe('applyKeyRenames', () => {
    it('should return original request when no key_rename configuration', () => {
      const request = { max_tokens: 1000, temperature: 0.7 };
      const backendConfig = {};

      const result = applyKeyRenames(request, backendConfig);

      expect(result).toEqual(request);
    });

    it('should return original request when key_rename is null', () => {
      const request = { max_tokens: 1000, temperature: 0.7 };
      const backendConfig = { key_rename: null };

      const result = applyKeyRenames(request, backendConfig);

      expect(result).toEqual(request);
    });

    it('should apply key renaming when key_rename is configured', () => {
      const request = {
        max_tokens: 1000,
        temperature: 0.7,
        nested: { max_tokens: 500 }
      };
      const backendConfig = {
        key_rename: { max_tokens: 'max_completion_tokens' }
      };

      const result = applyKeyRenames(request, backendConfig);

      expect(result).toEqual({
        max_completion_tokens: 1000,
        temperature: 0.7,
        nested: { max_completion_tokens: 500 }
      });
    });

    it('should not mutate original request object', () => {
      const request = { max_tokens: 1000, temperature: 0.7 };
      const backendConfig = {
        key_rename: { max_tokens: 'max_completion_tokens' }
      };

      const result = applyKeyRenames(request, backendConfig);

      // Original should be unchanged
      expect(request).toEqual({ max_tokens: 1000, temperature: 0.7 });
      // Result should have renamed keys
      expect(result).toEqual({ max_completion_tokens: 1000, temperature: 0.7 });
    });
  });

  describe('real-world request scenarios', () => {
    it('should handle complex Claude API request structure', () => {
      const claudeRequest = {
        model: "openai:gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Complete this request with max_tokens limit"
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        stop_sequences: ["stop1", "stop2"],
        tools: [
          {
            name: "test_tool",
            input_schema: {
              max_tokens: 100,
              type: "object"
            }
          }
        ]
      };

      const backendConfig = {
        key_rename: { max_tokens: 'max_completion_tokens' }
      };

      const result = applyKeyRenames(claudeRequest, backendConfig);

      // Check all instances of max_tokens are renamed
      expect(result.max_completion_tokens).toBe(1000);
      expect(result.tools[0].input_schema.max_completion_tokens).toBe(100);

      // Ensure other keys are unchanged
      expect(result.temperature).toBe(0.7);
      expect(result.stop_sequences).toEqual(["stop1", "stop2"]);
      expect(result.model).toBe("openai:gpt-4o");
    });

    it('should handle deeply nested structures with mixed data types', () => {
      const complexRequest = {
        level1: {
          max_tokens: 1000,
          level2: {
            max_tokens: 500,
            data: {
              nested_object: {
                max_tokens: 100,
                other_field: "unchanged"
              },
              nested_array: [
                { max_tokens: 50, item: "test" },
                { no_match: 123 }
              ]
            }
          }
        },
        top_level_max: "should not change"
      };

      const backendConfig = {
        key_rename: { max_tokens: 'max_completion_tokens' }
      };

      const result = applyKeyRenames(complexRequest, backendConfig);

      expect(result.level1.max_completion_tokens).toBe(1000);
      expect(result.level1.level2.max_completion_tokens).toBe(500);
      expect(result.level1.level2.data.nested_object.max_completion_tokens).toBe(100);
      expect(result.level1.level2.data.nested_array[0].max_completion_tokens).toBe(50);
      expect(result.level1.level2.data.nested_array[1].no_match).toBe(123);
      expect(result.top_level_max).toBe("should not change");
    });
  });
});