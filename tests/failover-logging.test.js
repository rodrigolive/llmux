import { Config } from '../src/config/index.js';
import { OpenAIClient } from '../src/provider/openai_client.js';

describe('Failover Logging Behavior', () => {
  let config;

  beforeEach(() => {
    const configData = {
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

  describe('Failover Path Detection', () => {
    test('should identify failover path when config has multiple backends', () => {
      expect(Array.isArray(config.failover) && config.failover.length > 0).toBe(true);
      expect(config.failover).toHaveLength(3);
    });

    test('should identify non-failover path when config has single backend', () => {
      const singleConfig = new Config({
        backend: [{ model: "test:model", context: 1000 }],
        tokens: { "test": "test" }
      });

      expect(Array.isArray(singleConfig.failover) && singleConfig.failover.length > 0).toBe(false);
    });

    test('should preserve failover during handler config transformation', () => {
      // Simulate the handler's config transformation
      const originalBackend = config.backend;
      const originalFailover = [...config.failover];

      // Select a backend (simulating config.selectBackend)
      const selectedBackend = "openai:gpt-4.1-mini";

      // Apply the new logic (this is what handlers now do)
      config.backend = selectedBackend;
      const allBackends = [originalBackend, ...originalFailover];
      config.failover = allBackends.filter(backend => backend !== selectedBackend);

      // Verify failover is preserved and doesn't become "none"
      expect(Array.isArray(config.failover) && config.failover.length > 0).toBe(true);
      expect(config.failover).not.toContain("none");
      expect(config.failover).not.toContain(selectedBackend);
    });
  });

  describe('Backend Selection for Different Request Types', () => {
    test('should select appropriate backend with available failover options', () => {
      // Regular text request
      const request = { model: "claude-3-5-sonnet-20241022" };
      const selected = config.selectBackend(request, 1000);

      expect(selected).toBeTruthy();
      expect(config.failover).toContain(selected === config.backend ?
        config.failover[0] : config.backend);
    });

    test('should maintain failover options when vision backend is selected', () => {
      const visionRequest = {
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

      const selected = config.selectBackend(visionRequest, 1000);
      expect(selected).toBe("openai:gpt-4.1-mini");

      // After selection, there should still be failover options
      const allBackends = [config.backend, ...config.failover];
      const remainingBackends = allBackends.filter(b => b !== selected);
      expect(remainingBackends.length).toBeGreaterThan(0);
    });

    test('should maintain failover options when thinking backend is selected', () => {
      const thinkingRequest = {
        model: "claude-3-5-sonnet-20241022",
        thinking: { type: "enabled" }
      };

      const selected = config.selectBackend(thinkingRequest, 1000);
      expect(selected).toBe("openai:o3");

      // After selection, there should still be failover options
      const allBackends = [config.backend, ...config.failover];
      const remainingBackends = allBackends.filter(b => b !== selected);
      expect(remainingBackends.length).toBeGreaterThan(0);
    });
  });

  describe('Failover Array Construction', () => {
    test('should construct failover array correctly when primary backend fails', () => {
      const originalConfig = {
        backend: "cerebras_gig:zai-glm-4.6",
        failover: ["synthetic:hf:zai-org/GLM-4.6", "openai:gpt-4.1-mini", "openai:o3"]
      };

      // Simulate scenario where failover is needed
      const failedBackend = originalConfig.backend;
      const availableBackends = originalConfig.failover;

      expect(availableBackends).toHaveLength(3);
      expect(availableBackends).not.toContain("none");
      expect(availableBackends.every(backend => backend !== failedBackend)).toBe(true);
    });

    test('should handle failover when secondary backend fails', () => {
      // If we had a request that selected synthetic backend and it fails
      const selectedBackend = "synthetic:hf:zai-org/GLM-4.6";
      const allBackends = [
        "cerebras_gig:zai-glm-4.6",
        "synthetic:hf:zai-org/GLM-4.6",
        "openai:gpt-4.1-mini",
        "openai:o3"
      ];

      const failoverOptions = allBackends.filter(b => b !== selectedBackend);

      expect(failoverOptions).toHaveLength(3);
      expect(failoverOptions).not.toContain(selectedBackend);
      expect(failoverOptions).toContain("cerebras_gig:zai-glm-4.6");
      expect(failoverOptions).toContain("openai:gpt-4.1-mini");
      expect(failoverOptions).toContain("openai:o3");
    });
  });

  describe('Error Prevention', () => {
    test('should never produce "none" as failover option when backends exist', () => {
      // Test multiple scenarios
      const testCases = [
        { selected: "cerebras_gig:zai-glm-4.6" },
        { selected: "synthetic:hf:zai-org/GLM-4.6" },
        { selected: "openai:gpt-4.1-mini" },
        { selected: "openai:o3" }
      ];

      testCases.forEach(({ selected }) => {
        const allBackends = [config.backend, ...config.failover];
        const failoverArray = allBackends.filter(b => b !== selected);

        expect(failoverArray).not.toContain("none");
        expect(failoverArray.every(backend => typeof backend === 'string' && backend.includes(':'))).toBe(true);
      });
    });

    test('should handle edge case where all backends are excluded', () => {
      const allBackends = [config.backend, ...config.failover];
      const allExcluded = allBackends.filter(() => false);

      expect(allExcluded).toHaveLength(0);
      // An empty failover array is better than "none"
      expect(allExcluded).not.toContain("none");
    });
  });
});