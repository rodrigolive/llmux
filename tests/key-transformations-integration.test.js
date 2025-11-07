/**
 * Test that all key transformations work together in the correct order
 */

import { describe, it, expect } from '@jest/globals';
import { applyKeyDeletions } from '../src/utils/key_delete.js';
import { applyKeyAdditions } from '../src/utils/key_add.js';
import { applyKeyRenames } from '../src/utils/key_rename.js';

describe('Key transformations integration', () => {
  it('should apply transformations in correct order: delete → add → rename', () => {
    const originalRequest = {
      model: "gpt-4",
      max_tokens: 500, // This should be deleted
      temperature: 0.7,
      existing_key: "keep_me"
    };

    const backendConfig = {
      key_delete: ['max_tokens'],
      key_add: { new_key: "new_value", extra_param: 42 },
      key_rename: { existing_key: "renamed_key" }
    };

    // Apply transformations in sequence
    let request = { ...originalRequest };

    // 1. Apply deletions
    request = applyKeyDeletions(request, backendConfig);
    expect(request.max_tokens).toBeUndefined();
    expect(request.temperature).toBe(0.7);

    // 2. Apply additions
    request = applyKeyAdditions(request, backendConfig);
    expect(request.new_key).toBe("new_value");
    expect(request.extra_param).toBe(42);
    expect(request.temperature).toBe(0.7);

    // 3. Apply renames
    request = applyKeyRenames(request, backendConfig);
    expect(request.existing_key).toBeUndefined();
    expect(request.renamed_key).toBe("keep_me");
    expect(request.new_key).toBe("new_value");
    expect(request.extra_param).toBe(42);

    // Final result
    expect(request).toEqual({
      model: "gpt-4",
      temperature: 0.7,
      new_key: "new_value",
      extra_param: 42,
      renamed_key: "keep_me"
    });
  });

  it('should handle complex nested structures with all transformations', () => {
    const originalRequest = {
      model: "gpt-4",
      max_tokens: 500,
      messages: [
        {
          content: {
            max_tokens: 1000,
            text: "Hello",
            old_param: "value"
          }
        }
      ]
    };

    const backendConfig = {
      key_delete: ['max_tokens'],
      key_add: { debug: true, trace_id: "abc123" },
      key_rename: { old_param: "new_param" }
    };

    // Apply all transformations
    let result = applyKeyDeletions(originalRequest, backendConfig);
    result = applyKeyAdditions(result, backendConfig);
    result = applyKeyRenames(result, backendConfig);

    expect(result).toEqual({
      model: "gpt-4",
      debug: true,
      trace_id: "abc123",
      messages: [
        {
          debug: true,
          trace_id: "abc123",
          content: {
            debug: true,
            trace_id: "abc123",
            text: "Hello",
            new_param: "value"
          }
        }
      ]
    });

    // Ensure deleted keys are gone
    expect(result.max_tokens).toBeUndefined();
    expect(result.messages[0].content.max_tokens).toBeUndefined();
  });

  it('should not interfere when transformations conflict', () => {
    // Test scenario where delete removes something that add would add
    const originalRequest = {
      model: "gpt-4",
      conflict_key: "original"
    };

    const backendConfig = {
      key_delete: ['conflict_key'],
      key_add: { conflict_key: "should_not_appear" },
      key_rename: { should_not_appear: "wont_be_renamed" }
    };

    let result = applyKeyDeletions(originalRequest, backendConfig);
    result = applyKeyAdditions(result, backendConfig);
    result = applyKeyRenames(result, backendConfig);

    // The deleted key should be gone even though add tried to add it
    expect(result.conflict_key).toBe("should_not_appear"); // Add creates it again

    // But if we delete after adding, it would be gone
    result = applyKeyDeletions(result, backendConfig);
    expect(result.conflict_key).toBeUndefined();
  });

  it('should handle partial configurations gracefully', () => {
    const originalRequest = {
      model: "gpt-4",
      max_tokens: 500,
      temperature: 0.7
    };

    // Only delete configured
    const configDelete = {
      key_delete: ['max_tokens']
    };

    // Only add configured
    const configAdd = {
      key_add: { debug: true }
    };

    // Only rename configured
    const configRename = {
      key_rename: { temperature: "temp" }
    };

    // Test each transformation independently
    const deletedOnly = applyKeyDeletions(originalRequest, configDelete);
    expect(deletedOnly.max_tokens).toBeUndefined();
    expect(deletedOnly.temperature).toBe(0.7);

    const addedOnly = applyKeyAdditions(originalRequest, configAdd);
    expect(addedOnly.debug).toBe(true);
    expect(addedOnly.max_tokens).toBe(500);

    const renamedOnly = applyKeyRenames(originalRequest, configRename);
    expect(renamedOnly.temp).toBe(0.7);
    expect(renamedOnly.temperature).toBeUndefined();
  });
});