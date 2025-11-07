import { Config } from '../src/config/index.js';

describe('Messages Handler Integration', () => {
  let config;

  beforeEach(() => {
    const mockCfg = {
      backend: [
        {
          model: "cerebras_gig:zai-glm-4.6",
          context: 131000,
          vision: false,
          thinking: false
        },
        {
          model: "openai:gpt-4.1-mini",
          context: 1000000,
          vision: true,
          thinking: false
        },
        {
          model: "openai:o3",
          context: 1000000,
          vision: false,
          thinking: true,
          model_match: ["*opus*"]
        }
      ]
    };
    config = new Config(mockCfg);
  });

  test('should select correct backend for image request', () => {
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

    const selected = config.selectBackend(imageRequest);
    expect(selected).toBe("openai:gpt-4.1-mini"); // Should select vision-enabled backend
  });

  test('should select correct backend for thinking request', () => {
    const thinkingRequest = {
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: "Explain quantum physics" }],
      max_tokens: 4000,
      thinking: { type: "enabled", budget_tokens: 16000 }
    };

    const selected = config.selectBackend(thinkingRequest);
    expect(selected).toBe("openai:o3"); // Should select thinking backend that matches opus pattern
  });

  test('should return null for vision request when no vision backend available', () => {
    const noVisionConfig = new Config({
      backend: [
        {
          model: "cerebras_gig:zai-glm-4.6",
          context: 131000,
          vision: false,
          thinking: false
        }
      ]
    });

    const imageRequest = {
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "test" }
            }
          ]
        }
      ],
      max_tokens: 4000
    };

    const selected = noVisionConfig.selectBackend(imageRequest);
    expect(selected).toBeNull(); // No vision support
  });

  test('should detect image content correctly', () => {
    const hasImages = {
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", data: "test" } },
            { type: "text", text: "analyze" }
          ]
        }
      ]
    };

    const noImages = {
      messages: [
        {
          role: "user",
          content: "plain text message"
        }
      ]
    };

    expect(config._hasImageContent(hasImages)).toBe(true);
    expect(config._hasImageContent(noImages)).toBe(false);
    expect(config._hasImageContent({})).toBe(false);
  });
});