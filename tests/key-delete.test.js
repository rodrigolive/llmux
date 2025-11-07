/**
 * Tests for key deletion functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { deleteKeys, applyKeyDeletions } from '../src/utils/key_delete.js';

describe('key_delete utility functions', () => {
  describe('deleteKeys', () => {
    it('should delete top-level keys', () => {
      const obj = {
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      };
      const keysToDelete = ['max_tokens'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        temperature: 0.7,
        top_p: 0.9
      });
    });

    it('should delete multiple top-level keys', () => {
      const obj = {
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        presence_penalty: 0.1
      };
      const keysToDelete = ['max_tokens', 'presence_penalty'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        temperature: 0.7,
        top_p: 0.9
      });
    });

    it('should delete nested keys at any depth', () => {
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
      const keysToDelete = ['max_tokens'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        messages: [{
          content: {
            text: "hello"
          }
        }],
        temperature: 0.7
      });
    });

    it('should handle deletion within arrays', () => {
      const obj = {
        tools: [{
          function: {
            max_tokens: 100,
            name: "test"
          }
        }, {
          function: {
            name: "test2"
          }
        }],
        max_tokens: 500
      };
      const keysToDelete = ['max_tokens'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        tools: [{
          function: {
            name: "test"
          }
        }, {
          function: {
            name: "test2"
          }
        }]
      });
    });

    it('should not delete keys not in the deletion list', () => {
      const obj = {
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      };
      const keysToDelete = ['something_else'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      });
    });

    it('should handle empty deletion list', () => {
      const obj = {
        max_tokens: 1000,
        temperature: 0.7
      };
      const keysToDelete = [];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual(obj);
    });

    it('should handle empty object', () => {
      const obj = {};
      const keysToDelete = ['max_tokens'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({});
    });

    it('should handle null and undefined values', () => {
      const obj = {
        max_tokens: 1000,
        temperature: null,
        top_p: undefined
      };
      const keysToDelete = ['max_tokens'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        temperature: null,
        top_p: undefined
      });
    });

    it('should handle primitive values', () => {
      expect(deleteKeys('string', ['max_tokens'])).toBe('string');
      expect(deleteKeys(123, ['max_tokens'])).toBe(123);
      expect(deleteKeys(null, ['max_tokens'])).toBe(null);
      expect(deleteKeys(undefined, ['max_tokens'])).toBe(undefined);
    });
  });

  describe('applyKeyDeletions', () => {
    const mockBackendConfig = {
      key_delete: ['max_tokens', 'presence_penalty']
    };

    const mockEmptyBackendConfig = {
      key_delete: null
    };

    const mockInvalidBackendConfig = {
      key_delete: 'not_an_array'
    };

    it('should apply key deletions from backend config', () => {
      const request = {
        max_tokens: 1000,
        temperature: 0.7,
        presence_penalty: 0.1,
        model: "gpt-4"
      };

      const result = applyKeyDeletions(request, mockBackendConfig);

      expect(result).toEqual({
        temperature: 0.7,
        model: "gpt-4"
      });
    });

    it('should return original request if no key_delete config', () => {
      const request = {
        max_tokens: 1000,
        temperature: 0.7
      };

      const result = applyKeyDeletions(request, mockEmptyBackendConfig);

      expect(result).toEqual(request);
    });

    it('should return original request if key_delete is not valid', () => {
      const request = {
        max_tokens: 1000,
        temperature: 0.7
      };

      const result = applyKeyDeletions(request, mockInvalidBackendConfig);

      expect(result).toEqual(request);
    });

    it('should not mutate original request object', () => {
      const request = {
        max_tokens: 1000,
        temperature: 0.7,
        nested: {
          max_tokens: 500
        }
      };

      const result = applyKeyDeletions(request, mockBackendConfig);

      // Original request should be unchanged
      expect(request.max_tokens).toBe(1000);
      expect(request.nested.max_tokens).toBe(500);

      // Result should have deletions applied
      expect(result.max_tokens).toBeUndefined();
      expect(result.nested.max_tokens).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('should handle deeply nested structures with mixed deletions', () => {
      const obj = {
        model: "gpt-4",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "hello",
                max_tokens: 200
              },
              {
                type: "image",
                max_tokens: 300
              }
            ],
            max_tokens: 500
          }
        ],
        tools: [
          {
            function: {
              name: "test",
              max_tokens: 100
            },
            max_tokens: 50
          }
        ]
      };

      const keysToDelete = ['max_tokens'];

      const result = deleteKeys(obj, keysToDelete);

      expect(result).toEqual({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "hello"
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
      });
    });

    it('should work with the same config as key_rename for consistency', () => {
      // Test that key_delete works the same way as key_rename in terms of structure
      const request = {
        model: "gpt-4",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: "Hello",
            max_tokens: 500
          }]
        }]
      };

      const config = {
        key_delete: ['max_tokens']
      };

      const result = applyKeyDeletions(request, config);

      expect(result.model).toBe("gpt-4");
      expect(result.max_tokens).toBeUndefined();
      expect(result.messages[0].content[0].max_tokens).toBeUndefined();
      expect(result.messages[0].content[0].text).toBe("Hello");
    });
  });
});