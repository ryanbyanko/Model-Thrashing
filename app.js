/* ═══════════════════════════════════════════════════════════════════
   app.js — Live Model-Thrashing Demo
   ═══════════════════════════════════════════════════════════════════ */

// ── Palette (extremely vibrant, modern slate-accented neons) ────────
const PALETTE = [
  { bg: 'rgba(56, 189, 248, 0.15)', bd: '#38bdf8', tx: '#7dd3fc' }, // Sky Blue
  { bg: 'rgba(236, 72, 153, 0.15)', bd: '#ec4899', tx: '#fbcfe8' }, // Pink/Rose
  { bg: 'rgba(168, 85, 247, 0.15)', bd: '#a855f7', tx: '#c084fc' }, // Purple
  { bg: 'rgba(16, 185, 129, 0.15)', bd: '#10b981', tx: '#a7f3d0' }, // Emerald Green
  { bg: 'rgba(245, 158, 11, 0.15)', bd: '#f59e0b', tx: '#fde68a' }, // Amber/Yellow
  { bg: 'rgba(239, 68, 68, 0.15)', bd: '#ef4444', tx: '#fca5a5' }, // Vibrant Red
  { bg: 'rgba(6, 182, 212, 0.15)', bd: '#06b6d4', tx: '#67e8f9' }, // Cyan
  { bg: 'rgba(99, 102, 241, 0.15)', bd: '#6366f1', tx: '#c7d2fe' }, // Indigo
];

// ── State ────────────────────────────────────────────────────────────
let configs = [];         // { label, model, system_prompt, temperature, top_p, color }
let tokens = [];          // same shape as JSON output
let isRunning = false;
let abortCtrl = null;
let lastFullText = '';
let selectedConfigIdx = 0; // currently expanded/focused config pane index

// ── DOM refs ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const expNameEl = $('expName');
const baseUrlEl = $('baseUrl');
const apiKeyEl = $('apiKey');
const testConnBtn = $('testConnBtn');
const testConnStatus = $('testConnStatus');
const urlWarning = $('urlWarning');
const userPromptEl = $('userPrompt');
const routingPreset = $('routingPreset');
const routingCustomPanel = $('routingCustomPanel');
const routingToggleContainer = $('routingToggleContainer');
const customRoutingType = $('customRoutingType');
const routingExprEl = $('routingExpr');
const tokenTrigger = $('tokenTrigger');
const tokenTriggerFieldContainer = $('tokenTriggerFieldContainer');
const maxTokensEl = $('maxTokens');
const peekTokensEl = $('peekTokens');
const calculatedMaxTokens = $('calculatedMaxTokens');
const runBtn = $('runBtn');
const runBtnWrapper = $('runBtnWrapper');
const continueBtn = $('continueBtn');
const stopBtn = $('stopBtn');
const loadBtn = $('loadBtn');
//const saveBtn        = $('saveBtn');
const downloadBtn = $('downloadBtn');
const fileInput = $('fileInput');
const configPanesEl = $('configPanes');
const legendEl = $('legend');
const mdLayer = $('mdLayer');
const tokenLayer = $('tokenLayer');
const responseCard = $('responseCard');
const tooltipEl = $('tooltip');
const statusDot = $('statusDot');
const statusText = $('statusText');
const viewToggle = $('viewToggle');
const lblTk = $('lblTk');
const lblMd = $('lblMd');
const lblFixed = $('lblFixed');
const lblTokenBased = $('lblTokenBased');

// ── Helpers ──────────────────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function setStatus(state, text) {
  statusDot.className = 'status-dot' + (state ? ' ' + state : '');
  statusText.textContent = text;
}

// ── Reactive Validation ──────────────────────────────────────────────
window.validateInputs = function () {
  const baseUrl = baseUrlEl.value.trim();
  const preset = routingPreset.value;
  const expr = routingExprEl.value.trim();
  const trigger = tokenTrigger.value.trim();
  const isCustom = (preset === 'custom');
  const isTokenBased = isCustom ? customRoutingType.checked : (preset === 'paragraph');

  let isValid = true;

  // 1. Base URL must be set
  if (!baseUrl) isValid = false;

  // 2. Routing Expression must be set if custom
  if (isCustom && !expr) isValid = false;

  // 3. Trigger tokens must be set if custom and token-based
  if (isCustom && isTokenBased && !trigger) isValid = false;

  // 4. At least one config and at least one model name
  if (configs.length === 0) isValid = false;
  const hasModelName = configs.some(c => c.model && c.model.trim() !== '');
  if (!hasModelName) isValid = false;

  runBtn.disabled = !isValid;

  // Dynamically assemble missing inputs warning for Run Button wrapper
  if (!isValid) {
    const missing = [];
    if (!baseUrl) missing.push('Base URL');
    if (isCustom && !expr) missing.push('Routing expression');
    if (isCustom && isTokenBased && !trigger) missing.push('Trigger tokens');
    if (configs.length === 0) missing.push('at least one Config');
    const hasModel = configs.some(c => c.model && c.model.trim() !== '');
    if (configs.length > 0 && !hasModel) missing.push('a Config Model Name');

    runBtnWrapper.setAttribute('data-tooltip', 'Missing: ' + missing.join(', '));
  } else {
    runBtnWrapper.removeAttribute('data-tooltip');
  }

  // Enable/disable continuation run option
  if (tokens.length > 0 && tokens[tokens.length - 1].finish_reason !== 'stop' && !isRunning && isValid) {
    continueBtn.style.display = 'inline-flex';
  } else {
    continueBtn.style.display = 'none';
  }
};

// Bind inputs for dynamic validation
baseUrlEl.addEventListener('input', validateInputs);
routingExprEl.addEventListener('input', validateInputs);
tokenTrigger.addEventListener('input', validateInputs);

// ── External URL Warning Badging & Hover Tooltip ────────────────────
window.isLocalUrl = function (url) {
  try {
    if (!url) return true;
    const hostname = url.replace(/^(https?:\/\/)?/i, '').split('/')[0].split(':')[0];
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '') {
      return true;
    }
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

window.checkBaseUrl = function () {
  const url = baseUrlEl.value.trim();
  if (isLocalUrl(url)) {
    urlWarning.style.display = 'none';
  } else {
    urlWarning.style.display = 'inline';
  }
  validateInputs();
};

urlWarning.addEventListener('mouseover', (e) => {
  tooltipEl.innerHTML = `
    <div class="tooltip-header" style="color:var(--danger)">⚠️ External API Warnings</div>
    <div class="tooltip-section">
      <div class="tooltip-label">Cost</div>
      <div style="color:var(--text)">Using external APIs (like OpenAI or Anthropic) will incur token costs based on your usage.</div>
    </div>
    <div class="tooltip-section">
      <div class="tooltip-label">Latency</div>
      <div style="color:var(--text)">Remote calls introduce network latency compared to local inference servers.</div>
    </div>
    <div class="tooltip-section">
      <div class="tooltip-label">Rate Limiting</div>
      <div style="color:var(--text)">External providers enforce strict rate limits that may interrupt continuous thrashed generation.</div>
    </div>
  `;
  tooltipEl.classList.add('visible');
});

urlWarning.addEventListener('mouseout', () => {
  tooltipEl.classList.remove('visible');
});

urlWarning.addEventListener('mousemove', (e) => {
  const pad = 16;
  let x = e.clientX + pad, y = e.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - pad) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - pad) y = e.clientY - rect.height - pad;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
});

// ── Test Connection Button Logic ────────────────────────────────────
window.testConnection = async function () {
  const baseUrl = baseUrlEl.value.replace(/\/+$/, '');
  const key = apiKeyEl.value.trim();

  testConnBtn.disabled = true;
  testConnBtn.textContent = '⏳ Testing...';
  testConnStatus.style.display = 'block';
  testConnStatus.className = 'test-status-msg info';
  testConnStatus.textContent = 'Sending request to verify server connectivity...';

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const resp = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      const models = data.data || [];
      testConnStatus.className = 'test-status-msg success';
      testConnStatus.innerHTML = `✅ <b>Connection successful!</b> Server is online and responded with ${models.length} available models.`;
    } else {
      const text = await resp.text().catch(() => '');
      testConnStatus.className = 'test-status-msg warning';
      testConnStatus.innerHTML = `⚠️ <b>Server responded with error (${resp.status}):</b> ${esc(text.slice(0, 150))}<br>` +
        `Ensure your base URL is correct and the server is compatible with the OpenAI API.`;
    }
  } catch (e) {
    testConnStatus.className = 'test-status-msg error';
    if (e.name === 'AbortError') {
      testConnStatus.innerHTML = `❌ <b>Connection timed out!</b> The server at <code>${esc(baseUrl)}</code> took too long to respond. Ensure the server is running and accessible.`;
    } else if (e instanceof TypeError) {
      testConnStatus.innerHTML = `❌ <b>Failed to connect!</b> This is likely due to one of the following:<br>` +
        `1. <b>CORS (Cross-Origin Resource Sharing) Issue:</b> The local server is running but is blocking requests from this origin. Try enabling CORS (e.g. <code>--cors</code> or <code>host: "0.0.0.0"</code>).<br>` +
        `2. <b>Server Offline:</b> The server is not running or is not listening on the specified port.<br>` +
        `3. <b>Blocked by HTTPS/HTTP mix:</b> If this page is served over HTTPS, it cannot make requests to plain HTTP local URLs.`;
    } else {
      testConnStatus.innerHTML = `❌ <b>Connection failed:</b> ${esc(e.message)}`;
    }
  } finally {
    testConnBtn.disabled = false;
    testConnBtn.textContent = 'Test Connection';
    validateInputs();
  }
};

testConnBtn.addEventListener('click', testConnection);

// ── View Toggle Switch ───────────────────────────────────────────────
window.toggleViewSwitch = function () {
  if (viewToggle.checked) {
    setView('md');
  } else {
    setView('tk');
  }
};

window.setView = function (mode) {
  if (mode === 'tk') {
    responseCard.classList.add('show-tokens');
    lblTk.classList.add('active');
    lblMd.classList.remove('active');
    viewToggle.checked = false;
  } else {
    responseCard.classList.remove('show-tokens');
    lblMd.classList.add('active');
    lblTk.classList.remove('active');
    viewToggle.checked = true;
    tooltipEl.classList.remove('visible');
  }
};

// ══════════════════════════════════════════════════════════════════════
// CONFIG MANAGEMENT & CUSTOM COLORS
// ══════════════════════════════════════════════════════════════════════

function hexToRgb(hex) {
  let c = hex.substring(1);
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getConfigColor(c, idx) {
  if (c.color) {
    try {
      const rgb = hexToRgb(c.color);
      return {
        bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
        bd: c.color,
        tx: c.color
      };
    } catch (e) {
      console.error('Failed to parse color', e);
    }
  }
  return PALETTE[idx % PALETTE.length];
}

window.onConfigColorChange = function (event, idx) {
  configs[idx].color = event.target.value;
  const col = getConfigColor(configs[idx], idx);
  const pane = configPanesEl.children[idx];
  if (pane) {
    pane.style.borderLeftColor = col.bd;
  }
  renderLegend();
  renderAllTokens(); // Re-render outputs to reflect new color in real-time!
};

window.selectPane = function (idx) {
  selectedConfigIdx = idx;
  const panes = configPanesEl.children;
  for (let i = 0; i < panes.length; i++) {
    const pane = panes[i];
    if (i === idx) {
      if (pane.classList.contains('collapsed')) {
        pane.classList.remove('collapsed');
      }
    } else {
      pane.classList.add('collapsed');
    }
  }
};

function addConfig(cfg) {
  const c = {
    label: cfg?.label || `Config ${configs.length + 1}`,
    model: cfg?.model || '',
    system_prompt: cfg?.system_prompt || '',
    temperature: cfg?.temperature ?? 0,
    top_p: cfg?.top_p ?? 1,
    color: cfg?.color || '',
  };
  configs.push(c);
  selectedConfigIdx = configs.length - 1; // expand newly added config
  renderConfigPanes();
  renderLegend();
  validateInputs();
}

function removeConfig(idx) {
  if (configs.length <= 1) return;
  configs.splice(idx, 1);
  if (selectedConfigIdx >= configs.length) {
    selectedConfigIdx = configs.length - 1;
  }
  renderConfigPanes();
  renderLegend();
  validateInputs();
}

function readConfigFromPane(idx) {
  const pane = configPanesEl.children[idx];
  if (!pane) return;
  const c = configs[idx];
  c.label = pane.querySelector('.cfg-label-input').value || `Config ${idx + 1}`;
  c.model = pane.querySelector('.cfg-model').value;
  c.system_prompt = pane.querySelector('.cfg-sysprompt').value;
  c.temperature = parseFloat(pane.querySelector('.cfg-temp').value) || 0;
  c.top_p = parseFloat(pane.querySelector('.cfg-topp').value) || 1;
  validateInputs();
}

function readAllConfigs() {
  for (let i = 0; i < configs.length; i++) readConfigFromPane(i);
}

function renderConfigPanes() {
  configPanesEl.innerHTML = '';
  configs.forEach((c, i) => {
    const col = getConfigColor(c, i);
    const pane = document.createElement('div');
    const isSelected = (i === selectedConfigIdx);
    pane.className = 'config-pane' + (isSelected ? '' : ' collapsed');
    pane.style.borderLeftColor = col.bd;

    // Clicking anywhere inside config box maximizes it (stopPropagation on inner inputs)
    pane.setAttribute('onclick', `selectPane(${i})`);

    pane.innerHTML = `
      <div class="config-pane-header">
        <input class="cfg-color-picker" type="color" value="${col.bd}"
               onclick="event.stopPropagation()" onchange="onConfigColorChange(event, ${i})">
        <input class="cfg-label-input" type="text" value="${esc(c.label)}" spellcheck="false"
               onclick="event.stopPropagation()" onchange="readConfigFromPane(${i})">
        <span class="cfg-chevron">▼</span>
        <button class="btn danger cfg-remove" onclick="event.stopPropagation();removeConfig(${i})"
                title="Remove config" ${configs.length <= 1 ? 'disabled' : ''}>✕</button>
      </div>
      <div class="config-pane-body" onclick="event.stopPropagation()">
        <div class="field">
          <label data-tooltip="Model identifier (e.g. qwen/qwen3.7-max)">Model Name</label>
          <input class="cfg-model" type="text" value="${esc(c.model)}"
                 placeholder="(uses first non-empty)" spellcheck="false" oninput="readConfigFromPane(${i})">
        </div>
        <div class="field">
          <label data-tooltip="Instructions given to the model before generating responses">System Prompt</label>
          <textarea class="cfg-sysprompt" rows="3" spellcheck="false"
                    oninput="readConfigFromPane(${i})">${esc(c.system_prompt)}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label data-tooltip="Lower is more deterministic, higher is more creative">Temperature</label>
            <input class="cfg-temp" type="number" value="${c.temperature}" step="0.1" min="0" max="5"
                   oninput="readConfigFromPane(${i})">
          </div>
          <div class="field">
            <label data-tooltip="Filters candidate tokens based on cumulative probability">Top P</label>
            <input class="cfg-topp" type="number" value="${c.top_p}" step="0.05" min="0" max="1"
                   oninput="readConfigFromPane(${i})">
          </div>
        </div>
      </div>`;
    configPanesEl.appendChild(pane);
  });
}

// ── Legend ────────────────────────────────────────────────────────────
function renderLegend() {
  readAllConfigs();
  legendEl.innerHTML = '';
  configs.forEach((c, i) => {
    const col = getConfigColor(c, i);
    const item = document.createElement('div');
    item.className = 'legend-item';

    const params = [];
    if (c.model) params.push(`model: ${c.model}`);
    if (c.temperature !== undefined) params.push(`temperature: ${c.temperature}`);
    if (c.top_p !== undefined && c.top_p !== 1) params.push(`top_p: ${c.top_p}`);

    item.innerHTML =
      `<div class="legend-dot" style="background:${col.bd}"></div>${esc(c.label)}` +
      `<div class="legend-tooltip">` +
      `<div class="lt-title">${esc(c.label)}</div>` +
      (params.length ? `<div class="lt-label">Parameters</div><div class="lt-text">${esc(params.join(', '))}</div>` : '') +
      `<div class="lt-label">System Prompt</div><div class="lt-text">${esc(c.system_prompt || '(none)')}</div>` +
      `</div>`;
    legendEl.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════════════════
// ROUTING preset state and validation transitions
// ══════════════════════════════════════════════════════════════════════

window.onRoutingPresetChange = function () {
  const preset = routingPreset.value;

  if (preset === 'custom') {
    // Enable custom routing controls (no longer grayed out)
    routingExprEl.disabled = false;
    customRoutingType.disabled = false;
    routingToggleContainer.style.opacity = '1';
    routingToggleContainer.style.pointerEvents = 'auto';

    // Placeholders
    routingExprEl.placeholder = "enter expression";
    tokenTrigger.placeholder = "trigger tokens";

    // Toggle state dictates trigger field visibility
    onRoutingTypeToggle();
  } else {
    // Disable custom routing controls (grayed out)
    routingExprEl.disabled = true;
    customRoutingType.disabled = true;
    routingToggleContainer.style.opacity = '0.4';
    routingToggleContainer.style.pointerEvents = 'none';

    // Set appropriate pre-configured expressions
    if (preset === 'alternate') {
      routingExprEl.value = 'i % n';
      customRoutingType.checked = false;
      tokenTriggerFieldContainer.style.display = 'none';
    } else if (preset === 'chunk') {
      routingExprEl.value = 'Math.floor(i / 10) % n';
      customRoutingType.checked = false;
      tokenTriggerFieldContainer.style.display = 'none';
    } else if (preset === 'random') {
      routingExprEl.value = 'r(n)';
      customRoutingType.checked = false;
      tokenTriggerFieldContainer.style.display = 'none';
    } else if (preset === 'paragraph') {
      routingExprEl.value = '(l + 1) % n';
      customRoutingType.checked = true;
      tokenTrigger.value = '\\n';
      tokenTriggerFieldContainer.style.display = 'block';
      tokenTrigger.disabled = true; // disabled preset trigger
    }
  }

  // Update toggle display text active classes
  if (customRoutingType.checked) {
    lblTokenBased.classList.add('active');
    lblFixed.classList.remove('active');
  } else {
    lblFixed.classList.add('active');
    lblTokenBased.classList.remove('active');
  }

  validateInputs();
};

window.onRoutingTypeToggle = function () {
  if (customRoutingType.checked) {
    tokenTriggerFieldContainer.style.display = 'block';
    tokenTrigger.disabled = (routingPreset.value !== 'custom');
    lblTokenBased.classList.add('active');
    lblFixed.classList.remove('active');
  } else {
    tokenTriggerFieldContainer.style.display = 'none';
    lblFixed.classList.add('active');
    lblTokenBased.classList.remove('active');
  }
  validateInputs();
};

function parseMultipleTriggers(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r');
  });
}

function buildRouter() {
  const preset = routingPreset.value;
  const helperR = (x) => Math.floor(Math.random() * x);

  if (preset === 'alternate') {
    return {
      type: 'fixed',
      fn: (i, n) => i % n
    };
  }
  if (preset === 'chunk') {
    return {
      type: 'fixed',
      fn: (i, n) => Math.floor(i / 10) % n
    };
  }
  if (preset === 'random') {
    return {
      type: 'fixed',
      fn: (i, n) => helperR(n)
    };
  }
  if (preset === 'paragraph') {
    return {
      type: 'token',
      triggers: ['\n'],
      nextFn: (l, n, i) => Math.floor((l + 1) % n)
    };
  }

  // Custom
  const isTokenBased = customRoutingType.checked;
  const expr = routingExprEl.value.trim() || 'i % n';
  try {
    const customFn = new Function('i', 'l', 'n', 'r', 'return Math.floor(' + expr + ')');
    if (isTokenBased) {
      return {
        type: 'token',
        triggers: parseMultipleTriggers(tokenTrigger.value),
        nextFn: (l, n, i) => customFn(i, l, n, helperR)
      };
    } else {
      return {
        type: 'fixed',
        fn: (i, n, l) => customFn(i, l, n, helperR)
      };
    }
  } catch (e) {
    alert('Invalid Routing Custom Expression: ' + e.message);
    return null;
  }
}

// ── Global Delegated Tooltips ────────────────────────────────────────
document.addEventListener('mouseover', (e) => {
  const target = e.target.closest('[data-tooltip]');
  if (!target) return;

  // Do not show if the target input element itself is disabled
  if (target.disabled) return;

  // Do not show if label points to a disabled target
  if (target.htmlFor) {
    const assoc = $(target.htmlFor);
    if (assoc && assoc.disabled) return;
  }

  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  // Simplify tooltips to unformatted text, no emojis or linebreaks, tight padding
  tooltipEl.textContent = text;
  tooltipEl.style.padding = '8px 12px';
  tooltipEl.style.minWidth = 'auto';
  tooltipEl.style.maxWidth = '320px';
  tooltipEl.style.lineHeight = '1.4';
  tooltipEl.style.fontSize = '0.78rem';
  tooltipEl.style.borderRadius = '6px';
  tooltipEl.classList.add('visible');
});

document.addEventListener('mouseout', (e) => {
  const target = e.target.closest('[data-tooltip]');
  if (target) {
    tooltipEl.classList.remove('visible');
    // Restore styling
    tooltipEl.style.padding = '';
    tooltipEl.style.minWidth = '';
    tooltipEl.style.maxWidth = '';
    tooltipEl.style.lineHeight = '';
    tooltipEl.style.fontSize = '';
    tooltipEl.style.borderRadius = '';
  }
});

document.addEventListener('mousemove', (e) => {
  const target = e.target.closest('[data-tooltip]');
  if (!target || target.disabled) return;
  if (target.htmlFor) {
    const assoc = $(target.htmlFor);
    if (assoc && assoc.disabled) return;
  }

  const pad = 16;
  let x = e.clientX + pad, y = e.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - pad) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - pad) y = e.clientY - rect.height - pad;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
});

// ══════════════════════════════════════════════════════════════════════
// API CALL
// ══════════════════════════════════════════════════════════════════════

async function callApi(messages, config, maxTok, signal) {
  const baseUrl = baseUrlEl.value.replace(/\/+$/, '');
  const key = apiKeyEl.value.trim();

  // Resolve model: per-config first, then fall back to first config with a model
  let model = config.model;
  if (!model) {
    for (const c of configs) {
      if (c.model) { model = c.model; break; }
    }
  }
  if (!model) throw new Error('No model name specified in any config');

  const payload = {
    model,
    messages,
    max_tokens: maxTok,
    stream: false,
    think: false,                    // Ollama / local thinking disable
    thinking: { type: 'disabled' },   // DeepSeek API thinking disable
    reasoning: { enabled: false },   // OpenRouter / Together AI thinking disable
    reasoning_level: 'none',         // GPT-5 / unified standard reasoning disable
    reasoning_effort: 'none',        // Works for qwen3.5-9b
    enable_thinking: false           // Qwen / DashScope thinking disable
  };
  if (config.temperature !== undefined) payload.temperature = config.temperature;
  if (config.top_p !== undefined && config.top_p !== 1) payload.top_p = config.top_p;

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

function buildMessages(systemPrompt, userPrompt, generatedSoFar) {
  const msgs = [{ role: 'system', content: systemPrompt }];
  msgs.push({ role: 'user', content: userPrompt });
  if (generatedSoFar) msgs.push({ role: 'assistant', content: generatedSoFar });
  return msgs;
}

// ══════════════════════════════════════════════════════════════════════
// RENDER TOKENS (shared between live + load)
// ══════════════════════════════════════════════════════════════════════

function getColorForLabel(label) {
  const idx = configs.findIndex(c => c.label === label);
  const c = configs[idx] || {};
  return getConfigColor(c, idx >= 0 ? idx : 0);
}

function appendTokenSpan(tok) {
  const col = getColorForLabel(tok.system_prompt_label);
  const span = document.createElement('span');
  const cls = ['tk'];
  if (tok.finish_reason === 'stop') cls.push('tk-stop');
  span.className = cls.join(' ');
  span.dataset.label = tok.system_prompt_label;
  if (tok.config_snapshot?._peek) span.dataset.peek = tok.config_snapshot._peek;
  if (tok.finish_reason === 'stop') span.dataset.stop = '1';
  span.style.background = col.bg;
  span.style.color = col.tx;

  span.textContent = tok.token;
  tokenLayer.appendChild(span);
}

function renderAllTokens() {
  tokenLayer.innerHTML = '';
  tokens.forEach(t => appendTokenSpan(t));
  updateMarkdown();
}

function updateMarkdown() {
  const text = tokens.map(t => t.token).join('');
  lastFullText = text;
  if (!text) {
    mdLayer.innerHTML = '<span class="placeholder-text">Output will appear here...</span>';
    return;
  }
  try {
    mdLayer.innerHTML = marked.parse(text);
  } catch {
    mdLayer.textContent = text;
  }
  tryRenderLatex();
}

function tryRenderLatex() {
  if (typeof renderMathInElement === 'function') {
    try {
      renderMathInElement(mdLayer, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      });
    } catch { /* ignore */ }
  }
}

// ══════════════════════════════════════════════════════════════════════
// RUN EXPERIMENT / CONTINUATION
// ══════════════════════════════════════════════════════════════════════

window.updateMaxTokensCalc = function () {
  const maxTok = parseInt(maxTokensEl.value);
  const peekTok = parseInt(peekTokensEl.value) || 0;
  if (maxTok === 0) {
    calculatedMaxTokens.textContent = 'Infinite';
  } else {
    const val = maxTok || 0;
    calculatedMaxTokens.textContent = val * (peekTok + 1);
  }
  validateInputs();
};

function removeTempPeekSpans() {
  const temps = tokenLayer.querySelectorAll('.temp-peek');
  temps.forEach(t => t.remove());
}

async function runExperiment(isContinuation = false) {
  readAllConfigs();
  const router = buildRouter();
  if (!router) return;

  if (configs.length === 0) { alert('Add at least one config'); return; }
  const userPrompt = userPromptEl.value.trim();
  if (!userPrompt) { alert('Enter a user prompt'); return; }

  // Reset or prepare continuation
  if (!isContinuation) {
    tokens = [];
    tokenLayer.innerHTML = '';
    mdLayer.innerHTML = '<span class="placeholder-text">Output will appear here...</span>';
    lastFullText = '';
  } else {
    removeTempPeekSpans();
  }

  isRunning = true;
  abortCtrl = new AbortController();
  runBtn.disabled = true;
  continueBtn.style.display = 'none';
  stopBtn.disabled = false;
  //saveBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus('running', isContinuation ? 'continuing…' : 'generating…');



  const maxTok = parseInt(maxTokensEl.value);
  const peekTok = parseInt(peekTokensEl.value) || 0;

  let generated = tokens.map(t => t.token).join('');
  const startIdx = isContinuation ? tokens.length : 0;

  // 0 means infinite, limited to safety ceiling of 10,000
  const limit = (maxTok === 0) ? 10000 : (isContinuation ? tokens.length + maxTok : maxTok);

  let lastCfgIdx = 0;
  if (isContinuation && tokens.length > 0) {
    const lastToken = tokens[tokens.length - 1];
    const lastIdx = configs.findIndex(c => c.label === lastToken.system_prompt_label);
    if (lastIdx >= 0) lastCfgIdx = lastIdx;
  }

  try {
    for (let i = startIdx; i < limit; i++) {
      if (!isRunning) break;

      let cfgIdx = lastCfgIdx;
      const n = configs.length;

      if (i === 0) {
        cfgIdx = 0; // default start
      } else if (router.type === 'fixed') {
        cfgIdx = router.fn(i, n, lastCfgIdx);
      } else if (router.type === 'token') {
        const latestTokenText = tokens[i - 1]?.token || '';
        const matched = router.triggers.some(trig => latestTokenText.includes(trig));
        if (matched) {
          cfgIdx = router.nextFn(lastCfgIdx, n, i);
        } else {
          cfgIdx = lastCfgIdx;
        }
      }

      cfgIdx = Math.max(0, Math.min(n - 1, Math.floor(cfgIdx)));
      lastCfgIdx = cfgIdx;

      const config = configs[cfgIdx];
      const sysPrompt = config.system_prompt || '';
      const messages = buildMessages(sysPrompt, userPrompt, generated);

      const t0 = performance.now();
      let data;
      try {
        data = await callApi(messages, config, 2, abortCtrl.signal);
      } catch (e) {
        if (e.name === 'AbortError') break;
        setStatus('err', e.message);
        break;
      }
      const latency = performance.now() - t0;

      const choice = data.choices?.[0];
      if (!choice) { setStatus('err', 'No choices in response'); break; }

      const tokenText = choice.message?.content || '';
      const finish = choice.finish_reason || null;

      const snapshot = {};
      if (config.temperature !== undefined) snapshot.temperature = config.temperature;
      if (config.top_p !== undefined && config.top_p !== 1) snapshot.top_p = config.top_p;

      // Peek
      if (peekTok > 0 && isRunning) {
        try {
          const peekMsgs = buildMessages(sysPrompt, userPrompt, generated + tokenText);
          const peekData = await callApi(peekMsgs, config, peekTok, abortCtrl.signal);
          snapshot._peek = peekData.choices?.[0]?.message?.content || '';
        } catch (e) {
          if (e.name === 'AbortError') break;
          snapshot._peek = ''; // skip peek
        }
      }

      const rec = {
        index: i,
        token: tokenText,
        system_prompt_label: config.label,
        system_prompt_text: sysPrompt,
        config_snapshot: snapshot,
        latency_ms: Math.round(latency * 10) / 10,
        finish_reason: finish,
      };

      tokens.push(rec);
      generated += tokenText;

      // Live render: remove peek spans if present, then append token
      removeTempPeekSpans();
      appendTokenSpan(rec);

      // Display fading peek tokens before the next token is generated
      if (snapshot._peek) {
        const col = getColorForLabel(config.label);
        const segments = snapshot._peek.match(/\s+|\S+/g) || [];
        segments.forEach((seg, sIdx) => {
          const tempSpan = document.createElement('span');
          tempSpan.className = 'tk temp-peek';

          // computed fading opacity (gradual fadeout - a little more transparent)
          const opacity = Math.max(0.08, 0.45 - (sIdx * 0.35 / segments.length));
          tempSpan.style.opacity = opacity;
          tempSpan.style.color = col.tx;
          tempSpan.style.fontStyle = 'normal';

          tempSpan.textContent = seg;
          tokenLayer.appendChild(tempSpan);
        });
      }

      updateMarkdown();

      if (finish === 'stop') {
        setStatus('ok', `stopped at token ${i}`);
        break;
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('err', e.message);
  }

  // Cleanup
  removeTempPeekSpans();
  isRunning = false;
  abortCtrl = null;
  runBtn.disabled = false;
  stopBtn.disabled = true;
  //saveBtn.disabled = tokens.length === 0;
  downloadBtn.disabled = tokens.length === 0;
  if (statusDot.classList.contains('running')) {
    setStatus('ok', `done — ${tokens.length} tokens`);
  }

  renderLegend();
  validateInputs();
}

function stopExperiment() {
  isRunning = false;
  if (abortCtrl) abortCtrl.abort();
  setStatus('', 'stopped');
  validateInputs();
}

// ══════════════════════════════════════════════════════════════════════
// JSON SAVE / LOAD
// ══════════════════════════════════════════════════════════════════════

function buildResultJson() {
  readAllConfigs();
  let model = '';
  for (const c of configs) { if (c.model) { model = c.model; break; } }

  return {
    experiment_name: expNameEl.value,
    model,
    user_prompt: userPromptEl.value,
    total_tokens: tokens.length,
    tokens,
    full_text: tokens.map(t => t.token).join(''),
    metadata: {
      routing_preset: routingPreset.value,
      custom_routing_type: customRoutingType.checked ? 'token' : 'fixed',
      routing_expression: routingExprEl.value,
      token_trigger: tokenTrigger.value,
      configs: configs.map(c => ({
        label: c.label,
        model: c.model,
        system_prompt: c.system_prompt,
        temperature: c.temperature,
        top_p: c.top_p
      })),
    },
  };
}

function downloadJson() {
  const obj = buildResultJson();
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (expNameEl.value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'thrash_result') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      importResult(data);
    } catch (e) {
      alert('Failed to parse JSON: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function importResult(data) {
  expNameEl.value = data.experiment_name || 'Loaded Experiment';
  userPromptEl.value = data.user_prompt || '';

  const seen = new Map();
  (data.tokens || []).forEach(t => {
    if (!seen.has(t.system_prompt_label)) {
      const snap = t.config_snapshot || {};
      seen.set(t.system_prompt_label, {
        label: t.system_prompt_label,
        model: data.model || '',
        system_prompt: t.system_prompt_text || '',
        temperature: snap.temperature ?? 0,
        top_p: snap.top_p ?? 1,
        color: '',
      });
    }
  });

  if (data.metadata?.configs) {
    configs = data.metadata.configs.map(c => ({
      label: c.label || '',
      model: c.model || data.model || '',
      system_prompt: c.system_prompt || '',
      temperature: c.temperature ?? 0,
      top_p: c.top_p ?? 1,
      color: '',
    }));
  } else {
    configs = Array.from(seen.values());
  }

  if (data.metadata?.routing_preset) {
    routingPreset.value = data.metadata.routing_preset;
  }
  if (data.metadata?.custom_routing_type) {
    customRoutingType.checked = (data.metadata.custom_routing_type === 'token');
  }
  if (data.metadata?.routing_expression) {
    routingExprEl.value = data.metadata.routing_expression;
  }
  if (data.metadata?.token_trigger) {
    tokenTrigger.value = data.metadata.token_trigger;
  }

  onRoutingPresetChange();

  tokens = data.tokens || [];
  selectedConfigIdx = 0;
  renderConfigPanes();
  renderLegend();
  renderAllTokens();

  //saveBtn.disabled = tokens.length === 0;
  downloadBtn.disabled = tokens.length === 0;
  setStatus('ok', `loaded — ${tokens.length} tokens`);
  validateInputs();
}

// ══════════════════════════════════════════════════════════════════════
// TOOLTIP (Follows cursor for peeks)
// ══════════════════════════════════════════════════════════════════════

tokenLayer.addEventListener('mouseover', (e) => {
  const tk = e.target.closest('.tk');
  if (!tk || tk.classList.contains('temp-peek')) return;
  const label = tk.dataset.label;
  const peek = tk.dataset.peek || '';
  const isStop = tk.dataset.stop === '1';
  const col = getColorForLabel(label);

  let html = '<div class="tooltip-header">' +
    '<span class="dot" style="background:' + col.bd + '"></span>' +
    esc(label) +
    (isStop ? ' <span style="color:#f43f5e;font-size:0.75em;">⏹ STOP</span>' : '') +
    '</div>';

  if (peek) {
    html += '<div class="tooltip-section">' +
      '<div class="tooltip-label">Peek Tokens</div>' +
      '<span class="tooltip-peek">' + esc(peek) + '</span>' +
      '</div>';
  }

  tooltipEl.innerHTML = html;
  tooltipEl.classList.add('visible');
});

tokenLayer.addEventListener('mouseout', (e) => {
  const tk = e.target.closest('.tk');
  if (!tk) return;
  if (!e.relatedTarget || !e.relatedTarget.closest || e.relatedTarget.closest('.tk') !== tk) {
    tooltipEl.classList.remove('visible');
  }
});

tokenLayer.addEventListener('mousemove', (e) => {
  const tk = e.target.closest('.tk');
  if (!tk) return;
  const pad = 16;
  let x = e.clientX + pad, y = e.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - pad) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - pad) y = e.clientY - rect.height - pad;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
});

// ══════════════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ══════════════════════════════════════════════════════════════════════

runBtn.addEventListener('click', () => runExperiment(false));
continueBtn.addEventListener('click', () => runExperiment(true));
stopBtn.addEventListener('click', stopExperiment);
loadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadJson(fileInput.files[0]); fileInput.value = ''; });
//saveBtn.addEventListener('click', saveJson);
downloadBtn.addEventListener('click', downloadJson);
$('addConfigBtn').addEventListener('click', () => addConfig());

// ══════════════════════════════════════════════════════════════════════
// INIT — seed two default configs
// ══════════════════════════════════════════════════════════════════════

addConfig({
  label: 'NICE',
  model: '',
  system_prompt: 'You are a kind and supportive assistant. You are always optimistic and encouraging, even if the user is being rude or dismissive.',
  temperature: 0,
});
addConfig({
  label: 'MEAN',
  model: '',
  system_prompt: 'You are a rude, condescending assistant. You are always dismissive and mean, even if the user is being kind and supportive.',
  temperature: 0,
});

selectedConfigIdx = 0; // select the first config by default
checkBaseUrl();
updateMaxTokensCalc();
onRoutingPresetChange();
setView('tk'); // default to Token Analysis view
setStatus('', 'idle');
validateInputs();
