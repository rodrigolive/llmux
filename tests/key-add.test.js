/**
 * Tests for key addition functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { addKeys, applyKeyAdditions } from '../src/utils/key_add.js';

describe('key_add utility functions', () => {
  describe('addKeys', () => {
    it('should add keys to top-level object', () => {
      const obj = {
        temperature: 0.7,
        top_p: 0.9
      };
      const keyAddMap = { max_tokens: 1000 };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1000
      });
    });

    it('should add multiple keys', () => {
      const obj = {
        temperature: 0.7
      };
      const keyAddMap = { max_tokens: 1000, presence_penalty: 0.1 };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        temperature: 0.7,
        max_tokens: 1000,
        presence_penalty: 0.1
      });
    });

    it('should not overwrite existing keys', () => {
      const obj = {
        max_tokens: 500,
        temperature: 0.7
      };
      const keyAddMap = { max_tokens: 1000, presence_penalty: 0.1 };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        max_tokens: 500, // Should remain unchanged
        temperature: 0.7,
        presence_penalty: 0.1
      });
    });

    it('should add keys to nested objects at any depth', () => {
      const obj = {
        messages: [{
          content: {
            text: "hello"
          }
        }],
        temperature: 0.7
      };
      const keyAddMap = { max_tokens: 500 };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        max_tokens: 500, // Added to root level
        messages: [{
          max_tokens: 500, // Added to message array items (objects)
          content: {
            max_tokens: 500, // Added to nested content
            text: "hello"
          }
        }],
        temperature: 0.7
      });
    });

    it('should handle addition within arrays', () => {
      const obj = {
        tools: [{
          function: {
            name: "test"
          }
        }, {
          function: {
            name: "test2"
          }
        }]
      };
      const keyAddMap = { tool_choice: "auto" };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        tool_choice: "auto",
        tools: [{
          tool_choice: "auto",
          function: {
            tool_choice: "auto",
            name: "test"
          }
        }, {
          tool_choice: "auto",
          function: {
            tool_choice: "auto",
            name: "test2"
          }
        }]
      });
    });

    it('should not add keys to primitive types', () => {
      const obj = {
        text: "hello",
        number: 123,
        boolean: true,
        null_value: null
      };
      const keyAddMap = { extra: "value" };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        text: "hello",
        number: 123,
        boolean: true,
        null_value: null,
        extra: "value"
      });

      // Primitives should not get the extra keys
      expect(typeof result.text).toBe('string');
      expect(typeof result.number).toBe('number');
      expect(typeof result.boolean).toBe('boolean');
      expect(result.null_value).toBe(null);
    });

    it('should handle empty key addition map', () => {
      const obj = {
        temperature: 0.7,
        max_tokens: 1000
      };
      const keyAddMap = {};

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual(obj);
    });

    it('should handle empty object', () => {
      const obj = {};
      const keyAddMap = { max_tokens: 1000 };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        max_tokens: 1000
      });
    });

    it('should handle different value types', () => {
      const obj = {};
      const keyAddMap = {
        string: "hello",
        number: 123,
        boolean: true,
        object: { nested: "value" },
        array: [1, 2, 3]
      };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual(keyAddMap);
    });

    it('should handle primitive values gracefully', () => {
      expect(addKeys('string', { extra: 'value' })).toBe('string');
      expect(addKeys(123, { extra: 'value' })).toBe(123);
      expect(addKeys(true, { extra: 'value' })).toBe(true);
      expect(addKeys(null, { extra: 'value' })).toBe(null);
      expect(addKeys(undefined, { extra: 'value' })).toBe(undefined);
    });
  });

  describe('applyKeyAdditions', () => {
    const mockBackendConfig = {
      key_add: { max_tokens: 1000, presence_penalty: 0.1 }
    };

    const mockEmptyBackendConfig = {
      key_add: null
    };

    const mockInvalidBackendConfig = {
      key_add: 'not_an_object'
    };

    it('should apply key additions from backend config', () => {
      const request = {
        temperature: 0.7,
        model: "gpt-4"
      };

      const result = applyKeyAdditions(request, mockBackendConfig);

      expect(result).toEqual({
        temperature: 0.7,
        model: "gpt-4",
        max_tokens: 1000,
        presence_penalty: 0.1
      });
    });

    it('should return original request if no key_add config', () => {
      const request = {
        temperature: 0.7
      };

      const result = applyKeyAdditions(request, mockEmptyBackendConfig);

      expect(result).toEqual(request);
    });

    it('should return original request if key_add is not valid', () => {
      const request = {
        temperature: 0.7
      };

      const result = applyKeyAdditions(request, mockInvalidBackendConfig);

      expect(result).toEqual(request);
    });

    it('should not mutate original request object', () => {
      const request = {
        temperature: 0.7,
        nested: {
          text: "hello"
        }
      };

      const result = applyKeyAdditions(request, mockBackendConfig);

      // Original request should be unchanged
      expect(request.max_tokens).toBeUndefined();
      expect(request.nested.max_tokens).toBeUndefined();

      // Result should have additions applied
      expect(result.max_tokens).toBe(1000);
      expect(result.nested.max_tokens).toBe(1000);
    });
  });

  describe('complex scenarios', () => {
    it('should handle deeply nested structures with mixed additions', () => {
      const obj = {
        model: "gpt-4",
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Hello"
              },
              {
                type: "image"
              }
            ]
          }
        ],
        tools: [
          {
            function: {
              name: "test"
            }
          }
        ]
      };

      const keyAddMap = {
        max_tokens: 1000,
        presence_penalty: 0.1
      };

      const result = addKeys(obj, keyAddMap);

      expect(result).toEqual({
        model: "gpt-4",
        temperature: 0.7,
        max_tokens: 1000,
        presence_penalty: 0.1,
        messages: [
          {
            max_tokens: 1000,
            presence_penalty: 0.1,
            role: "user",
            content: [
              {
                max_tokens: 1000,
                presence_penalty: 0.1,
                type: "text",
                text: "Hello"
              },
              {
                max_tokens: 1000,
                presence_penalty: 0.1,
                type: "image"
              }
            ]
          }
        ],
        tools: [
          {
            max_tokens: 1000,
            presence_penalty: 0.1,
            function: {
              max_tokens: 1000,
              presence_penalty: 0.1,
              name: "test"
            }
          }
        ]
      });
    });

    it('should respect order of operations with existing keys', () => {
      // Test that existing keys are preserved even when addition tries to add the same key
      const request = {
        model: "gpt-4",
        max_tokens: 500, // Existing value
        temperature: 0.7
      };

      const config = {
        key_add: { max_tokens: 1000, presence_penalty: 0.1 }
      };

      const result = applyKeyAdditions(request, config);

      expect(result).toEqual({
        model: "gpt-4",
        max_tokens: 500, // Should preserve original value
        temperature: 0.7,
        presence_penalty: 0.1 // Should add this new key
      });
    });

    it('should work with complex nested structures', () => {
      const complexObject = {
        request: {
          messages: [
            {
              content: {
                parts: [
                  { text: "Hello" }
                ]
              }
            }
          ]
        }
      };

      const keyAddMap = { processed: true };

      const result = addKeys(complexObject, keyAddMap);

      expect(result).toEqual({
        processed: true,
        request: {
          processed: true,
          messages: [
            {
              processed: true,
              content: {
                processed: true,
                parts: [
                  {
                    processed: true,
                    text: "Hello"
                  }
                ]
              }
            }
          ]
        }
      });
    });
  });
});