#!/usr/bin/env bun
// Test script to verify the conditional logging based on config
import { log_request_beautifully } from "../../src/logging.js";

console.log("Testing conditional logging format:\n");

// Test 1: With config.log_request_details = true (will show flags)
console.log("Test 1 - Request details ENABLED:");
log_request_beautifully({
  method: "POST",
  path: "/v1/messages",
  claude_model: "claude-3-5-sonnet-20241022",
  openai_model: "gpt-4o",
  num_messages: 5,
  num_tools: 2,
  status_code: 200,
  num_tokens: 100,
  output_tokens: 50,
  tokens_per_sec: 33.3,
  duration_ms: 1500,
  config: { log_request_details: true },
  has_images: true,
  thinking: true,
  stream: true,
  temperature: 0.7,
  max_tokens: 1000,
  tools: [
    { name: "search_web" },
    { name: "calculate" }
  ]
});

console.log("\n" + "=".repeat(60) + "\n");

// Test 2: With config.log_request_details = false (will NOT show flags)
console.log("Test 2 - Request details DISABLED:");
log_request_beautifully({
  method: "POST",
  path: "/v1/messages",
  claude_model: "claude-3-haiku-20240307",
  openai_model: "gpt-4o-mini",
  num_messages: 3,
  num_tools: 0,
  status_code: 200,
  num_tokens: 50,
  output_tokens: 25,
  tokens_per_sec: 50.0,
  duration_ms: 500,
  config: { log_request_details: false },
  has_images: true,
  thinking: true,
  stream: true,
  temperature: 0.7,
  max_tokens: 1000,
  tools: [
    { name: "search_web" },
    { name: "calculate" }
  ]
});

console.log("\n" + "=".repeat(60) + "\n");

// Test 3: With no config object (defaults to false, will NOT show flags)
console.log("Test 3 - No config object (defaults to false):");
log_request_beautifully({
  method: "POST",
  path: "/v1/messages",
  claude_model: "claude-3-opus-20240229",
  openai_model: "gpt-4",
  num_messages: 2,
  num_tools: 0,
  status_code: 200,
  num_tokens: 75,
  output_tokens: 100,
  tokens_per_sec: 25.0,
  duration_ms: 4000,
  // No config object at all
  has_images: true,
  thinking: true,
  stream: true,
  temperature: 0.5,
  max_tokens: 500,
  tools: [
    { name: "search_web" }
  ]
});