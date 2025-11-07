import { encoding_for_model } from "@dqbd/tiktoken";

/**
 * Estimate the number of tokens in a request
 * @param {object} request - The request object
 * @returns {number} Estimated token count
 */
export function estimateTokens(request) {
  let totalTokens = 0;

  // Get encoding for the model (fall back to gpt-4 for unknown models)
  let modelEncoding = "gpt-4";
  if (request.model) {
    if (request.model.includes("gpt-4")) {
      modelEncoding = "gpt-4";
    } else if (request.model.includes("gpt-3.5")) {
      modelEncoding = "gpt-3.5-turbo";
    } else if (request.model.includes("claude")) {
      // Claude models use different tokenization, but we can approximate with gpt-4
      modelEncoding = "gpt-4";
    }
  }

  const encoding = encoding_for_model(modelEncoding);

  try {
    // Count tokens in messages
    if (request.messages) {
      for (const message of request.messages) {
        if (typeof message.content === "string") {
          totalTokens += countTokens(encoding, message.content);
        } else if (Array.isArray(message.content)) {
          for (const content of message.content) {
            if (content.type === "text") {
              totalTokens += countTokens(encoding, content.text || "");
            }
            // Images typically count as a fixed number of tokens
            // This varies by provider, but 85 tokens is a common approximation
            if (content.type === "image") {
              totalTokens += 85;
            }
          }
        }
      }
    }

    // Add some overhead for the request structure (roles, formatting, etc.)
    // Only add if we actually have messages with content
    if (request.messages && request.messages.length > 0) {
      totalTokens += request.messages.length * 4;
    }

    // Add tokens for system prompts if present
    if (request.system) {
      totalTokens += countTokens(encoding, request.system);
    }

    // Add tokens for max_tokens response (estimated)
    // We don't count this as part of the context limit selection
    // since it's the output tokens, not input tokens

    return totalTokens;
  } finally {
    encoding.free();
  }
}

/**
 * Count tokens for text
 * @param {object} encoding - Tiktoken encoding
 * @param {string} text - Text to count tokens for
 * @returns {number} Number of tokens
 */
function countTokens(encoding, text) {
  if (!text || typeof text !== "string") return 0;
  return encoding.encode(text).length;
}

/**
 * Test the token counter with sample requests
 */
export function testTokenCounter() {
  const simpleRequest = {
    model: "claude-3-5-sonnet-20241022",
    messages: [
      { role: "user", content: "Why is the sky blue?" }
    ],
    max_tokens: 4000,
    thinking: { type: "disabled" }
  };

  const imageRequest = {
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

  console.log("Simple request tokens:", estimateTokens(simpleRequest));
  console.log("Image request tokens:", estimateTokens(imageRequest));
}