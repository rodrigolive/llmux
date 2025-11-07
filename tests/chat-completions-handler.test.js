import { describe, it, expect, jest } from "@jest/globals";
import { Config } from "../src/config/index.js";
import { buildChatCompletionsHandler } from "../src/api/handlers/chat_completions.js";
import * as logging from "../src/logging.js";

describe("/v1/chat/completions handler", () => {
  it("logs non-streaming requests with backend-selected model metadata", async () => {
    const config = new Config({
      tokens: {},
      backend: [
        { model: "openai:gpt-4o", context: 128000, vision: false },
        { model: "cerebras_gig:zai-glm-4.6", context: 131000, vision: true },
      ],
    });

    const mockOpenAIClient = {
      create_chat_completion: jest
        .fn()
        .mockResolvedValue({ id: "cmpl-123", choices: [], usage: {} }),
    };

    const handler = buildChatCompletionsHandler({
      config,
      model_manager: null,
      openai_client: mockOpenAIClient,
    });

    const controller = new AbortController();
    const requestBody = {
      model: "openai:gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe the picture" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" },
            },
          ],
        },
      ],
      stream: false,
    };

    const reqHeaders = {
      get: () => null,
    };

    const req = {
      method: "POST",
      url: "http://localhost/v1/chat/completions",
      headers: reqHeaders,
      json: jest.fn().mockResolvedValue(requestBody),
      signal: controller.signal,
    };

    const logSpy = jest.spyOn(logging, "log_request_beautifully").mockImplementation(() => {});

    await handler(req);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logArgs = logSpy.mock.calls[0][0];
    expect(logArgs).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      claude_model: requestBody.model,
      openai_model: "cerebras_gig:zai-glm-4.6",
      status_code: 200,
    });
    expect(mockOpenAIClient.create_chat_completion).toHaveBeenCalledTimes(1);
    const outboundRequest = mockOpenAIClient.create_chat_completion.mock.calls[0][0];
    expect(outboundRequest.model).toBe("cerebras_gig:zai-glm-4.6");

    logSpy.mockRestore();
  });

  it("logs streaming requests after the SSE stream completes using usage chunks", async () => {
    const config = new Config({
      tokens: {},
      backend: [
        { model: "openai:gpt-4o", context: 128000, vision: false },
        { model: "openai:o3", context: 200000, vision: false, thinking: true },
      ],
    });

    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":12,"completion_tokens":5}}\n\n',
      "data: [DONE]\n\n",
    ];
    const streamGenerator = async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    };

    const mockOpenAIClient = {
      create_chat_completion_stream: jest.fn().mockReturnValue(streamGenerator()),
    };

    const handler = buildChatCompletionsHandler({
      config,
      model_manager: null,
      openai_client: mockOpenAIClient,
    });

    const controller = new AbortController();
    const requestBody = {
      model: "openai:o3-mini",
      messages: [{ role: "user", content: "Stream me something" }],
      stream: true,
    };

    const reqHeaders = { get: () => null };
    const req = {
      method: "POST",
      url: "http://localhost/v1/chat/completions",
      headers: reqHeaders,
      json: jest.fn().mockResolvedValue(requestBody),
      signal: controller.signal,
    };

    const logSpy = jest.spyOn(logging, "log_request_beautifully").mockImplementation(() => {});

    const res = await handler(req);
    expect(res instanceof Response).toBe(true);

    // Drain the stream so the instrumented logger runs
    const reader = res.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(mockOpenAIClient.create_chat_completion_stream).toHaveBeenCalledTimes(1);
    const outboundRequest = mockOpenAIClient.create_chat_completion_stream.mock.calls[0][0];
    expect(outboundRequest.model).toBe("openai:o3");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logArgs = logSpy.mock.calls[0][0];
    expect(logArgs).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      stream: true,
      openai_model: "openai:o3",
      output_tokens: 5,
    });
    expect(typeof logArgs.duration_ms).toBe("number");
    expect(logArgs.duration_ms).toBeGreaterThanOrEqual(0);

    logSpy.mockRestore();
  });
});
