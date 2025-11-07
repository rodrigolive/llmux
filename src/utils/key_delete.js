/**
 * Utility functions for recursive key deletion in request objects
 */

/**
 * Recursively deletes keys from an object based on the provided list of keys to delete
 * @param {object} obj - The object to process (can be any depth)
 * @param {array} keysToDelete - Array of key names to delete (e.g., ['max_tokens'])
 * @returns {object} - New object with specified keys deleted
 */
export function deleteKeys(obj, keysToDelete) {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deleteKeys(item, keysToDelete));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip this key if it's in the deletion list
    if (!keysToDelete?.includes(key)) {
      // Recursively process the value
      result[key] = deleteKeys(value, keysToDelete);
    }
  }

  return result;
}

/**
 * Apply key deletion to a request object based on backend configuration
 * @param {object} request - The request object to transform
 * @param {object} backendConfig - Backend configuration containing key_delete array
 * @returns {object} - Modified request object with specified keys deleted
 */
export function applyKeyDeletions(request, backendConfig) {
  if (!backendConfig?.key_delete || !Array.isArray(backendConfig.key_delete)) {
    return request;
  }

  // Create a deep copy to avoid mutating the original request
  const requestCopy = JSON.parse(JSON.stringify(request));

  return deleteKeys(requestCopy, backendConfig.key_delete);
}