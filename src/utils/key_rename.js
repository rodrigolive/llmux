/**
 * Utility functions for recursive key renaming in request objects
 */

/**
 * Recursively renames keys in an object based on the provided mapping
 * @param {object} obj - The object to process (can be any depth)
 * @param {object} keyMap - Mapping of old keys to new keys (e.g., { max_tokens: "max_completion_tokens" })
 * @returns {object} - New object with renamed keys
 */
export function renameKeys(obj, keyMap) {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => renameKeys(item, keyMap));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // Use the new key name if it exists in the mapping, otherwise keep original
    const newKey = keyMap?.[key] || key;

    // Recursively process the value
    result[newKey] = renameKeys(value, keyMap);
  }

  return result;
}

/**
 * Apply key renaming to a request object based on backend configuration
 * @param {object} request - The request object to transform
 * @param {object} backendConfig - Backend configuration containing key_rename mapping
 * @returns {object} - Modified request object with renamed keys
 */
export function applyKeyRenames(request, backendConfig) {
  if (!backendConfig?.key_rename || typeof backendConfig.key_rename !== 'object') {
    return request;
  }

  // Create a deep copy to avoid mutating the original request
  const requestCopy = JSON.parse(JSON.stringify(request));

  return renameKeys(requestCopy, backendConfig.key_rename);
}