import { log_request_beautifully } from '../src/logging.js';

// Test to verify timestamp format includes milliseconds
test('timestamp format includes milliseconds', () => {
  // Capture console.log output
  const originalLog = console.log;
  let capturedOutput = [];

  console.log = (...args) => {
    capturedOutput.push(args.join(' '));
  };

  // Call the logging function
  log_request_beautifully({
    method: 'POST',
    path: '/v1/chat/completions',
    claude_model: 'claude-3-sonnet',
    openai_model: 'gpt-4',
    status_code: 200,
    num_messages: 5,
    num_tools: 2,
    num_tokens: 100,
    output_tokens: 50,
    duration_ms: 1500
  });

  // Restore console.log
  console.log = originalLog;

  // Find the line with the timestamp
  const logLine = capturedOutput.find(line => line.includes('⧗'));
  expect(logLine).toBeDefined();

  // Extract timestamp from log line (format: ⧗ 2025-11-07 19:06:56.123Z)
  const timestampMatch = logLine.match(/⧗ (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z)/);
  expect(timestampMatch).toBeDefined();

  const timestamp = timestampMatch[1];

  // Verify timestamp includes millisecond precision (pattern: YYYY-MM-DD HH:MM:SS.mmmZ)
  const timestampFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  expect(timestamp).toMatch(timestampFormat);
});