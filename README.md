# Model Thrashing Demo

A browser-based tool for experimenting with **model thrashing**: switching between different LLM configurations mid-generation.

Responses are built incrementally, with each token potentially sourced from a different model according to a routing strategy.

The demo runs entirely in-browser, but requires an OpenAI-compatible API endpoint

---

## Quick Start

### 1. Launch the demo

You can open the [live demo here](https://ryanbyanko.github.io/Model-Thrashing/), or download this project and open `index.html` in a browser. If directly opening via `file://` causes CORS problems, you may need to serve it from a local HTTP server instead.

### 2. Set up an LLM Server

The demo talks to any **OpenAI-compatible API** (`/v1/chat/completions`). **It is strongly recommended to use a local server instead of external APIs**. Using OpenRouter, OpenAI, or other cloud providers may incur token costs, add significant latency, and exhaust rate limits quickly. Popular options for local servers include:

| Tool | Command |
|------|---------|
| **LM Studio** | Start a local server from the app (default: `http://127.0.0.1:1234`) |
| **Ollama** | `ollama serve` (default: `http://127.0.0.1:11434`) |
| **vLLM** | `vllm serve <model>` |

> **CORS tip:** If your server blocks browser requests, enable CORS. For Ollama: set `OLLAMA_ORIGINS=*`. For vLLM: add `--allow-credentials`. For LM Studio: enable CORS under server settings.

### 3. Connect and run

1. Enter the **Base URL** of your server (e.g. `http://127.0.0.1:1234`)
2. Click **Test Connection** to verify the server is reachable
3. Configure at least one **Model Config** with a model name (e.g. `qwen/qwen3.5-9b`)
4. Set a **User Prompt** and choose a **Routing Strategy**.
5. Click **▶ Run**.

---

## Controls

### Connection

| Control | Description |
|---------|-------------|
| Base URL | API endpoint root. A warning appears for non-local URLs |
| API Key | Optional bearer token for external providers (OpenAI, OpenRouter, etc.) |
| Test Connection | Sends a `GET /v1/models` request to check server availability and CORS |

### Model Configs

Here's where you define the distinct LLM configs to switch between during generation.

| Field | Description |
|-------|-------------|
| Model Name | Model identifier (e.g. `qwen/qwen3.5-9b`, `llama3.2`), falls back to the first non-empty config if blank |
| System Prompt | Instructions prepended to every request using this config |
| Temperature | Sampling temperature, `0` = deterministic |
| Top P | Nucleus sampling cutoff, `1` = no cutoff |

Use **+ Add Config** to add more. The color swatch lets you assign a custom highlight color.

### Routing

Determines which config generates each token. Built-in presets:

| Preset | Behavior |
|--------|----------|
| Round Robin | Alternates configs every token |
| Chunk Round Robin | Switches every 10 tokens |
| Random | Picks a random config each token. |
| Paragraph Switch | Switches config at every newline. |
| Custom Expression | Write your own JS expression using variables `i` (token index), `l` (last config index), `n` (config count), `r(x)` (random int 0 to x-1). Toggle between **Fixed** (runs every token) or **Token-Triggered** (runs only when a trigger token appears). |

### User Prompt

This is the input prompt submitted to each config to form the response, like the input box in a chatbot interface.

### Run Controls

| Control | Description |
|---------|-------------|
| Max Tokens | Maximum number of tokens to generate (unless a stop token is encountered), `0` = unlimited |
| Peek Tokens | Extra tokens generated speculatively after each real token for visualization purposes, shown as fading ghost text - does not affect the actual output |
| ▶ Run | Starts generation |
| ⏹ Stop | Aborts generation immediately. |
| Continue until stop | Resumes generation until a stop token is encountered (appears if output hits the specified max) |

### Output

Toggle between two views using the switch above the output panel:

- **Token View**: Each token is highlighted in the color of the config that generated it. Hover a token to see its config details and peek preview
- **Markdown Rendered**: Full output rendered as formatted markdown with LaTeX support

### File Controls

| Control | Description |
|---------|-------------|
| Download JSON | Export the current run as a JSON file including all tokens, configs, and metadata |
| Load JSON | Import a previously saved result (restores tokens, configs, and routing settings) |

---

## Note on reasoning models

This demo expects outputs in `response.choices[0].message.content`. If reasoning traces are generated in a seperate field like `message.reasoning_content`, no response might be generated even if requests are still being made. I tried to explicitly disable reasoning using a variety of provider-specific flags, but it's possible I missed some.
