import { providerConfigFor } from '../src/provider/openai_client.js';
import { Config } from '../src/config/index.js';

describe('provider:model parsing', () => {
  describe('providerConfigFor function', () => {
    test('should parse simple provider:model correctly', () => {
      const config = { provider: 'openai' };
      const result = providerConfigFor('openai:gpt-4o', config);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
    });

    test('should parse provider:model with colon in model name - huggingface style', () => {
      const config = { provider: 'synthetic' };
      const result = providerConfigFor('synthetic:hf:zai-org/GLM-4.6', config);

      expect(result.provider).toBe('synthetic');
      expect(result.model).toBe('hf:zai-org/GLM-4.6');
    });

    test('should parse provider:model with multiple colons in model name', () => {
      const config = { provider: 'azure' };
      const result = providerConfigFor('azure:deployment:version:1.0', config);

      expect(result.provider).toBe('azure');
      expect(result.model).toBe('deployment:version:1.0');
    });

    test('should handle provider:model without colon (uses default provider)', () => {
      const config = { provider: 'openai', providers: {} };
      const result = providerConfigFor('gpt-4o', config);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
    });
  });

  describe('Config class backend parsing', () => {
    test('should parse backend correctly with colon in model name', () => {
      const configData = {
        backend: 'synthetic:hf:zai-org/GLM-4.6',
        provider: {},
        host: '0.0.0.0',
        port: 8082
      };

      const config = new Config(configData);

      expect(config.provider).toBe('synthetic');
      expect(config.model).toBe('hf:zai-org/GLM-4.6');
    });

    test('should parse simple backend correctly', () => {
      const configData = {
        backend: 'openai:gpt-4o',
        provider: {},
        host: '0.0.0.0',
        port: 8082
      };

      const config = new Config(configData);

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o');
    });

    test('should parse complex backend with multiple colons correctly', () => {
      const configData = {
        backend: 'azure-eastus:deployment:gpt-4:version-1',
        provider: {},
        host: '0.0.0.0',
        port: 8082
      };

      const config = new Config(configData);

      expect(config.provider).toBe('azure-eastus');
      expect(config.model).toBe('deployment:gpt-4:version-1');
    });
  });
});