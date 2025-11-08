<h1 align="center">
    ꙮ LLMux
</h1>
<p align="center">
    OpenAI-compatible gateway that multiplexes every LLM backend with intelligent routing and protocol translation.
    <br>
    One config, every model provider.
</p>
<p align="center">
    <a href="#-quick-start">Quick Start</a> &bull;
    <a href="CMD_LINE_APP.md">CLI Reference</a> &bull;
    <a href="KEY_RENAME_FEATURE.md">Key Rename Flow</a>
</p>
<p align="center">
    <a href="https://bun.sh">
        <img src="https://img.shields.io/badge/Built%20with-Bun-000000?style=flat-square&logo=bun" alt="Built with Bun">
    </a>
    <a href="https://github.com/rod/llmux/actions">
        <img src="https://img.shields.io/badge/CI-GitHub%20Actions-blue?style=flat-square&logo=githubactions" alt="GitHub Actions CI">
    </a>
    <a href="https://github.com/rod/llmux/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/License-GNU%20GPLv3-blue?style=flat-square" alt="GNU GPLv3 License">
    </a>
</p>

**ꙮ llmux** is a sophisticated proxy server that acts as a universal adapter between Language Model APIs. It provides intelligent protocol translation, provider multiplexing, and automatic backend selection to create a seamless, resilient interface for your LLM applications.

## Key Features

- Protocol Translation** - Convert between Claude API and OpenAI API formats transparently
- Intelligent Routing** - Automatically select the optimal backend based on request requirements
- High Availability** - Built-in failover with smart cooldown periods
- Vision Support** - Handle image inputs in base64 format across providers
- Thinking Mode** - Support for reasoning models with special token allocation
- Streaming** - Real-time streaming responses for interactive applications
- Tool Calling** - Full function/tool calling support with format translation
- Authentication** - Bearer token authentication for client access control
- Rate Limiting** - Per-provider rate limits (daily, hourly, 5-hour windows)
- HTTPS Support** - SSL/TLS termination with custom certificates

## Architecture

llmux is built with a modular, extensible architecture:

- **Dynamic CLI** - Command loading using Sade framework
- **HTTP Router** - Intelligent request routing and authentication
- **Protocol Converters** - Bidirectional Claude ↔ OpenAI format translation
- **Provider Manager** - Unified client with automatic retry/failover logic
- **Backend Selector** - Sophisticated algorithm for optimal backend selection
- **Configuration System** - TOML-based with runtime overrides

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd llmux

# Install dependencies
bun install

# Make the CLI executable
chmod +x bin/llmux

# Install globally (optional)
bun install -g
```

### Basic Configuration

Create a `config.toml` file:

```toml
# Server configuration
host = "0.0.0.0"
port = 8082
log_level = "INFO"

# Provider configurations
[provider.openai]
api_key = "sk-your-openai-key"
base_url = "https://api.openai.com/v1"

[provider.cerebras_gig]
api_key = "csk-your-cerebras-key"
base_url = "https://api.cerebras.ai/v1"

# Backend definitions with capabilities
[[backend]]
model = "openai:gpt-4o"
context = 128000
vision = true
thinking = false
max_per_day = 1000

[[backend]]
model = "cerebras_gig:zai-glm-4.6"
context = 131000
vision = false
thinking = false

[[backend]]
model = "openai:o3"
context = 1000000
vision = false
thinking = true
model_match = ["*opus*", "*o1*"]

# Client authentication
[tokens]
client1 = "your-secret-api-key"
```

### Start the Server

```bash
# Start with default config
llmux start

# Custom configuration
llmux start --config ./my-config.toml

# Override port and enable HTTPS
llmux start --port 8443 --https --ssl-key ./key.pem --ssl-cert ./cert.pem

# Enable verbose logging
llmux start --verbose
```

## 🎯 Intelligent Backend Selection

llmux automatically selects the best backend based on your request requirements:

**Request Size Matching**
- Routes large requests to backends with sufficient context windows
- Optimizes for cost by using smaller models when appropriate

**Capability-Based Routing**
- **Vision Requests**: Automatically routes to backends that support image analysis
- **Thinking Mode**: Routes to specialized reasoning models when requested
- **Model Patterns**: Uses pattern matching to select specialized providers

**Automatic Failover**
- Routes to alternate backends when primary ones are unavailable
- Implements smart cooldown periods for failed backends
- Tracks performance to optimize future routing decisions

## 📡 API Endpoint

Once started, llmux provides a unified API endpoint that accepts both Claude and OpenAI API formats:

**Server URL**: `http://localhost:8082` (or your configured host/port)

**Available Endpoints**:
- `/v1/messages` - Claude API compatible endpoint
- `/v1/chat/completions` - OpenAI API compatible endpoint

Simply configure your existing LLM client to point to the llmux server URL using your client authentication token.

## 🛠️ Supported Features

**Core Functionality**
- ✓ Chat completions via both Claude and OpenAI API formats
- ✓ Streaming responses for real-time interaction
- ✓ Function/tool calling with automatic format translation
- ✓ Vision/image analysis support
- ✓ Thinking mode for reasoning models

**Advanced Capabilities**
- ✓ Dynamic parameter renaming for backend compatibility
- ✓ Token counting and context limit enforcement
- ✓ Rate limiting per provider (daily, hourly, 5-hour windows)
- ✓ HTTPS/TSSL support with custom certificates
- ✓ Comprehensive logging and monitoring

## 📊 Rate Limiting

llmux automatically tracks usage and enforces per-provider rate limits to prevent overages:

```toml
[[backend]]
model = "cerebras_gig:zai-glm-4.6"
max_per_day = 1000      # Daily request limit
max_per_hour = 100      # Hourly request limit
max_per_5hours = 400    # 5-hour window limit
```

When limits are approached or exceeded, llmux returns appropriate error messages and automatically routes to alternate backends when available.

## 🔐 Security & Authentication

### Client Access Control
Secure your server with client authentication tokens:

```toml
[tokens]
frontend_app = "your-secure-api-key-here"
mobile_app = "mobile-access-key"
internal_service = "internal-service-key"
```

Clients include their token in the request headers:
- `x-api-key: your-token` (Claude API format)
- `Authorization: Bearer your-token` (OpenAI API format)

### HTTPS Encryption
Enable secure connections with custom SSL certificates:

```bash
llmux start --https \
  --ssl-key ./private-key.pem \
  --ssl-cert ./certificate.crt
```

## 🎪 Usage Examples

The `examples/` directory contains demonstration scripts that show how llmux intelligently routes different request types:

- **Backend Selection Demo** - Shows how requests are routed based on requirements
- **Configuration Examples** - Sample configurations for different use cases
- **Client Integration** - Examples of connecting various applications

Run examples with:
```bash
cd examples
bun run backend-selector-example.js
```

### Common Use Cases

**Multi-Provider Setup**
- Configure multiple providers for high availability
- Use different models for cost optimization
- Implement failover for reliability

**Application Integration**
- Point your existing LLM client to the llmux server URL
- Use your standard API libraries with the unified endpoint
- No code changes required to gain multi-provider benefits

**Production Deployment**
- Run behind a reverse proxy for additional security
- Configure health checks and monitoring
- Use rate limiting to control costs

## ⚙️ Configuration Reference

### Server Settings

```toml
host = "0.0.0.0"           # Bind address
port = 8082                # HTTP port
request_timeout = 90       # Request timeout (seconds)
max_retries = 2           # Max retry attempts
log_level = "INFO"        # Logging level
```

Enabling HTTPs:

```toml
https_enabled = false      # Enable HTTPS
ssl_key_file = ""          # SSL private key path
ssl_cert_file = ""         # SSL certificate path
```

### Provider Settings

Providers are whoever serves you the LLM. These can be local or cloud.

```toml
[provider.openai]
api_key = "sk-..."         # API key
base_url = "https://api.openai.com/v1"  # Base URL

[provider.cerebras]
api_key = "csk-..."
base_url = "https://api.cerebras.ai/v1"

[provider.synthetic]
api_key = "syn_..."
base_url = "https://api.synthetic.new/openai/v1"

[provider.lmstudio]
api_key = "sk-your-lmstudio-api-key-here"
base_url = "http://localhost:1234/v1"
```

### Backend Configuration & Ordering

Backends are the specific models you want to use from your providers. They are evaluated **in configuration order** - the first backend that meets all request requirements is selected.

**Priority-Based Selection Algorithm:**
1. Filter out failed/backends with cooldown
2. Iterate through backends in configuration order
3. Check each against constraints (context → vision → thinking → model patterns)
4. Select first matching backend or `null` if none suitable

#### Simple Examples

**Single Backend:**
```toml
[[backend]]
model = "cerebras:gpt-4-small"
context = 128000
```
*All requests go to this backend unless it fails or context is exceeded.*

**Basic Failover:**
```toml
[[backend]]
model = "cerebras:gpt-4-small"
context = 128000

[[backend]]
model = "openai:gpt-4o"
context = 128000
```
*First backend gets priority, second is fallback only.*

#### Complex Example with Capabilities

```toml
# Fast & cheap for simple requests (highest priority)
[[backend]]
model = "synthetic:hf:Qwen/Qwen3-Coder-480B-A35B-Instruct"
context = 256000

# Vision-enabled (selected when images present)
[[backend]]
model = "openai:gpt-4o"
context = 128000
vision = true

# Large context (selected when text exceeds first backend)
[[backend]]
model = "openai:gpt-4-turbo"
context = 1000000

# Reasoning specialist (pattern-based selection)
[[backend]]
model = "openai:o3"
context = 1000000
thinking = true
model_match = ["*opus*", "*o1*"]
key_rename = { max_tokens = "max_completion_tokens" }
```

**Selection Flow:**
- **Simple text** → `cerebras:gpt-4-small` (first backend fits)
- **Images** → `openai:gpt-4o` (skips first backend, needs vision)
- **Large context (>128K)** → `openai:gpt-4-turbo` (exceeds first two context limits)
- **Opus model + thinking** → `openai:o3` (matches thinking + model pattern)

#### Configuration Parameters

```toml
[[backend]]
model = "provider:model"           # Required: provider:model format
context = 128000                  # Context window size
vision = true/false               # Image support (default: false)
thinking = true/false             # Reasoning support (default: false)
max_per_day = 1000               # Daily request limit
max_per_hour = 100              # Hourly request limit
max_per_5hours = 400            # 5-hour window limit
model_match = ["*pattern*"]      # Model matching patterns
key_rename = { old_param = "new_param" }  # Parameter rename
key_delete = "param_name"        # Remove incompatible params
key_add = { new_param = "value" } # Add required params
```

## Troubleshooting

**Connection Issues**
- Verify server is running: `llmux start --verbose`
- Check firewall settings for the configured port
- Ensure client authentication tokens are correctly configured

**Backend Failures**
- Review logs for provider-specific error messages
- Verify API keys and base URLs are correct
- Check rate limiting configurations if requests are being throttled

**Performance**
- Monitor token usage to stay within provider limits
- Use model patterns to optimize for cost vs. capability
- Enable verbose logging to diagnose routing decisions

## Support

For questions and support:
- Check the `examples/` directory for configuration templates
- Use `--verbose` flag for detailed operational logging
- Review the configuration reference for available options

## License

This project is licensed under the MIT License.

---

**ꙮ llmux** - Simplify your language model infrastructure with intelligent routing and universal compatibility.
