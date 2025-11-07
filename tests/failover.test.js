import { Config } from '../src/config/index.js';

// Mock dependencies to avoid actual HTTP calls
const mockOpenAIClient = {
  OpenAIClient: class MockOpenAIClient {
    constructor(config, timeout) {
      this.config = config;
      this.timeout = timeout;
      this.create_chat_completion = () => Promise.resolve({});
      this.create_chat_completion_stream = async function* () { yield; };
    }
  }
};

const mockLogging = {
  logger: {
    debug: () => {},
    info: () => {},
    warning: () => {},
    error: () => {}
  },
  log_request_beautifully: () => {},
  Colors: { CYAN: '', RESET: '', GREEN: '', YELLOW: '', RED: '', BOLD: '' }
};

describe('Failover Configuration', () => {
  let configData;
  let config;

  beforeEach(() => {
    configData = {
      backend: [
        { model: "cerebras_gig:zai-glm-4.6", context: 131000 },
        { model: "synthetic:hf:zai-org/GLM-4.6", context: 198000 },
        { model: "openai:gpt-4.1-mini", context: 1000000, vision: true },
        { model: "openai:o3", context: 1000000, thinking: true }
      ],
      tokens: { "test-api": "test-token" }
    };
    config = new Config(configData);
  });

  describe('Config Backend Selection', () => {
    test('should load all backends correctly', () => {
      expect(config.backend).toBe("cerebras_gig:zai-glm-4.6");
      expect(config.backends).toHaveLength(4);
      expect(config.failover).toHaveLength(3);
      expect(config.failover).toEqual([
        "synthetic:hf:zai-org/GLM-4.6",
        "openai:gpt-4.1-mini",
        "openai:o3"
      ]);
    });

    test('should select appropriate backend for regular requests', () => {
      const request = { model: "claude-3-5-sonnet-20241022" };
      const selected = config.selectBackend(request, 1000);
      expect(selected).toBe("cerebras_gig:zai-glm-4.6");
    });

    test('should select vision-capable backend for image requests', () => {
      const request = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What do you see?" },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
            ]
          }
        ]
      };
      const selected = config.selectBackend(request, 1000);
      expect(selected).toBe("openai:gpt-4.1-mini");
    });

    test('should select thinking-capable backend for thinking requests', () => {
      const request = {
        model: "claude-3-5-sonnet-20241022",
        thinking: { type: "enabled" }
      };
      const selected = config.selectBackend(request, 1000);
      expect(selected).toBe("openai:o3");
    });

    test('should exclude failed backends from selection', () => {
      const request = { model: "claude-3-5-sonnet-20241022" };
      const selected = config.selectBackend(request, 1000, ["cerebras_gig:zai-glm-4.6"]);
      expect(selected).toBe("synthetic:hf:zai-org/GLM-4.6");
    });
  });

  describe('Backend Selection Logic', () => {
    test('should preserve failover when excluding selected backend', () => {
      const selectedBackend = "synthetic:hf:zai-org/GLM-4.6";
      const originalBackend = config.backend;
      const originalFailover = [...config.failover];

      // Simulate the selection logic from handlers
      config.backend = selectedBackend;
      const allBackends = [originalBackend, ...originalFailover];
      config.failover = allBackends.filter(backend => backend !== selectedBackend);

      expect(config.backend).toBe(selectedBackend);
      expect(config.failover).toHaveLength(3);
      expect(config.failover).not.toContain(selectedBackend);
      expect(config.failover).toContain(originalBackend);
    });

    test('should handle case when selected backend is primary', () => {
      const originalBackend = config.backend;
      const originalFailover = [...config.failover];

      // When primary is selected, failover should be all other backends
      config.backend = originalBackend;
      const allBackends = [originalBackend, ...originalFailover];
      config.failover = allBackends.filter(backend => backend !== originalBackend);

      expect(config.backend).toBe(originalBackend);
      expect(config.failover).toEqual(originalFailover);
    });

    test('should identify when failover is available', () => {
      // With multiple backends, failover should be available
      expect(Array.isArray(config.failover) && config.failover.length > 0).toBe(true);
    });

    test('should identify when failover is not available', () => {
      const noFailoverData = {
        backend: [{ model: "test:model", context: 1000 }],
        tokens: { "test": "test" }
      };
      const noFailoverConfig = new Config(noFailoverData);
      expect(Array.isArray(noFailoverConfig.failover) && noFailoverConfig.failover.length > 0).toBe(false);
    });

    test('should construct failover array correctly', () => {
      const selected = "openai:gpt-4.1-mini";
      const originalBackend = config.backend;
      const originalFailover = [...config.failover];

      // Test failover construction
      const allBackends = [originalBackend, ...originalFailover];
      const expectedFailover = allBackends.filter(backend => backend !== selected);

      expect(expectedFailover).toHaveLength(3);
      expect(expectedFailover).not.toContain(selected);
      expect(expectedFailover).toContain(originalBackend);
      expect(expectedFailover).toContain("synthetic:hf:zai-org/GLM-4.6");
      expect(expectedFailover).toContain("openai:o3");
    });
  });

  describe('Edge Cases', () => {
    test('should handle single backend without failover', () => {
      const singleBackendData = {
        backend: [{ model: "test:model", context: 1000 }],
        tokens: { "test": "test" }
      };
      const singleConfig = new Config(singleBackendData);

      expect(singleConfig.backend).toBe("test:model");
      expect(singleConfig.failover).toHaveLength(0);
    });

    test('should select correct backend when primary fails', () => {
      const request = { model: "claude-3-5-sonnet-20241022" };

      // Exclude primary backend
      const selected = config.selectBackend(request, 1000, ["cerebras_gig:zai-glm-4.6"]);
      expect(selected).toBe("synthetic:hf:zai-org/GLM-4.6");

      // Exclude first two backends
      const selected2 = config.selectBackend(request, 1000, ["cerebras_gig:zai-glm-4.6", "synthetic:hf:zai-org/GLM-4.6"]);
      expect(selected2).toBe("openai:gpt-4.1-mini");
    });

    test('should return null when all backends are failed', () => {
      const allFailedBackend = config.backends.map(b => b.model);
      const selected = config.selectBackend({ model: "test" }, 1000, allFailedBackend);
      expect(selected).toBe(null);
    });
  });
});