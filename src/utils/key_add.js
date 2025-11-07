/**
 * Utility functions for adding key-value pairs to request objects
 */

/**
 * Recursively adds keys and values to an object based on the provided mapping
 * @param {object} obj - The object to process (can be any depth)
 * @param {object} keyAddMap - Mapping of keys to add with their values (e.g., { mykey: "somevalue" })
 * @returns {object} - New object with added keys
 */
export function addKeys(obj, keyAddMap) {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => addKeys(item, keyAddMap));
  }

  const result = {};

  // Add new keys and values from the mapping first
  for (const [key, value] of Object.entries(keyAddMap || {})) {
    result[key] = value;
  }

  // Add original keys and process nested objects
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = addKeys(value, keyAddMap);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Apply key additions to a request object based on backend configuration
 * @param {object} request - The request object to transform
 * @param {object} backendConfig - Backend configuration containing key_add mapping
 * @returns {object} - Modified request object with added keys
 */
export function applyKeyAdditions(request, backendConfig) {
  if (!backendConfig?.key_add || typeof backendConfig.key_add !== 'object') {
    return request;
  }

  // Create a deep copy to avoid mutating the original request
  const requestCopy = JSON.parse(JSON.stringify(request));

  return addKeys(requestCopy, backendConfig.key_add);
}