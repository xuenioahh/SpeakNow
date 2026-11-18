import { countModelRequest, countModelUsage } from './_requestContext.js';
export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`timeout_${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeoutId);
    },
  };
}

function dedupeModels(models = []) {
  return [...new Set(models.filter(Boolean))];
}

export function normalizeDeepSeekModel(model) {
  if (['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].includes(model)) return 'deepseek-flash';
  return model || 'deepseek-flash';
}

function providerFailure(provider, status) {
  const code = status === 401 ? 'provider_key_invalid' : status === 402 ? 'provider_balance_insufficient' : status === 429 ? 'provider_rate_limited' : status >= 500 ? 'provider_unavailable' : 'provider_request_invalid';
  return Object.assign(new Error(code), { status, code, provider, retryable: status === 408 || status === 429 || status >= 500 });
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isRetryableMessage(message = "") {
  const lower = String(message || "").toLowerCase();
  return lower.includes("timeout_") || lower.includes("status=429") || lower.includes("status=408") || lower.includes("status=409") || lower.includes("status=500") || lower.includes("status=502") || lower.includes("status=503") || lower.includes("status=504");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestCompatibleJson({ provider, apiKey, baseUrl, models, systemText, userText, schemaName, timeoutMs = 6000, maxModelsPerProvider = 1, retryOnce = true, maxOutputTokens = 1200, deadline = Infinity, validateResult }) {
  let lastError = null;

  for (const model of dedupeModels(models).slice(0, maxModelsPerProvider)) {
    const maxAttempts = retryOnce ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (Date.now() >= deadline) break;
      const { signal, clear } = withTimeout(Math.min(timeoutMs, deadline - Date.now()));
      try {
        countModelRequest();
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal,
          body: JSON.stringify({
            model,
            ...(provider === 'deepseek' ? { max_tokens: maxOutputTokens, thinking: { type: 'disabled' } } : { max_completion_tokens: maxOutputTokens }),
            messages: [
              { role: "system", content: systemText },
              { role: "user", content: userText },
            ],
            ...(provider === "openai" ? {} : { temperature: 0.5 }),
            response_format: {
              type: "json_object",
            },
          }),
        });

        if (!response.ok) {
          lastError = providerFailure(provider, response.status);
          if (attempt === 0 && retryOnce && isRetryableStatus(response.status)) {
            await wait(300 + Math.floor(Math.random() * 500));
            continue;
          }
          break;
        }

        const data = await response.json();
        countModelUsage(data.usage);
        const parsed = safeJsonParse(data?.choices?.[0]?.message?.content || "");
        if (data?.choices?.[0]?.finish_reason === 'length') throw Object.assign(new Error('provider_response_truncated'), { code: 'provider_response_truncated', retryable: true });
        if (!parsed) {
          throw Object.assign(new Error('invalid_model_payload'), { code: 'provider_invalid_payload', retryable: true });
        }
        if (validateResult) {
          try { validateResult(parsed); } catch { throw Object.assign(new Error('provider_invalid_feedback'), { code: 'provider_invalid_feedback', retryable: true }); }
        }
        return { provider, model: data?.model || model, parsed, usage: data.usage || null };
      } catch (error) {
        lastError = error?.code ? error : Object.assign(new Error(`provider_${provider}_request_failed`), { code: 'provider_request_failed', provider, retryable: true });
        if (attempt === 0 && retryOnce && (lastError.retryable || isRetryableMessage(error?.message)) && Date.now() + 400 < deadline) {
          await wait(350);
          continue;
        }
        break;
      } finally {
        clear();
      }
    }
  }

  throw lastError || new Error(`provider=${provider} all_models_failed`);
}

export function llmProviderConfiguration({ openaiModels = [process.env.OPENAI_MODEL, "gpt-5-mini", "gpt-5", "gpt-4.1"], openrouterModels = [process.env.OPENROUTER_VOICE_CHAT_MODEL, "openrouter/free"], deepseekModels = [process.env.DEEPSEEK_MODEL, 'deepseek-flash'] } = {}) {
  return [
    { provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: "https://api.deepseek.com", models: deepseekModels.map(normalizeDeepSeekModel) },
    { provider: "openai", apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", models: openaiModels },
    { provider: "openrouter", apiKey: process.env.OPENROUTER_API_KEY, baseUrl: "https://openrouter.ai/api/v1", models: openrouterModels },
    { provider: "zhipu", apiKey: process.env.ZHIPU_API_KEY, baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: [process.env.ZHIPU_MODEL, "glm-4.7-flash", "glm-4.5-flash"] },
    { provider: "longcat", apiKey: process.env.LONGCAT_API_KEY, baseUrl: "https://api.longcat.chat/openai/v1", models: [process.env.LONGCAT_MODEL, "LongCat-Flash-Lite", "LongCat-Flash-Chat"] },
    { provider: "partner", apiKey: process.env.PARTNER_API_KEY, baseUrl: process.env.PARTNER_BASE_URL, models: [process.env.PARTNER_MODEL] },
  ].map(config => ({ ...config, baseUrl: config.baseUrl?.replace(/\/$/, ""), models: dedupeModels(config.models) }));
}

export function expressionServiceStatus() {
  const selected = process.env.EXPRESSION_LLM_PROVIDER || process.env.LLM_PROVIDER || "auto";
  const configurations = llmProviderConfiguration();
  const configured = configurations.filter(c => c.apiKey && c.baseUrl && c.models.length);
  // Explicit providers never silently spend on a different provider.
  const candidates = configured.filter(c => selected === "auto" || c.provider === selected);
  return { available: candidates.length > 0, selection: selected,
    providers: candidates.map(c => ({ provider: c.provider, model: c.models[0] })),
    connection: "not_tested", videoUploaded: false };
}

export async function requestStructuredLlm({ systemText, userText, schema, schemaName = "structured_reply", openaiModels, openrouterModels,
  deepseekModels, provider = process.env.LLM_PROVIDER || "auto", timeoutMs = 6000, maxModelsPerProvider = 1, retryOnce = true, totalTimeoutMs = Infinity, maxOutputTokens = 1200, validateResult }) {
  const configurations = llmProviderConfiguration({ openaiModels, openrouterModels, deepseekModels });
  if (provider !== "auto" && !configurations.some(c => c.provider === provider)) throw new Error("unknown_llm_provider");
  const candidates = configurations.filter(c => c.apiKey && c.baseUrl && c.models.length && (provider === "auto" || c.provider === provider));
  if (!candidates.length) throw new Error("no_llm_api_key_configured");
  if (systemText.length + userText.length > 40000) throw new Error('model_input_too_large');
  let lastError = null;
  const deadline = Date.now() + totalTimeoutMs;
  for (const config of candidates.slice(0, 2)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      return await requestCompatibleJson({ ...config,
        systemText: `${systemText}\nReturn strict JSON only matching this schema: ${JSON.stringify(schema || {})}`,
        userText, schemaName, timeoutMs: Math.min(timeoutMs, remaining), maxModelsPerProvider: Math.min(maxModelsPerProvider, 1), retryOnce, deadline, maxOutputTokens, validateResult });
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("all_llm_providers_failed");
}

export async function checkProviderHealth({ probe = false } = {}) {
  if (!process.env.DEEPSEEK_API_KEY) return { provider: 'deepseek', configured: false, authentication: 'not_checked', balance: 'not_checked', model: 'not_checked' };
  const response = await fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, signal: AbortSignal.timeout(10000) });
  if (response.status === 401) throw providerFailure('deepseek', response.status);
  const result = { provider: 'deepseek', configured: true, authentication: response.ok ? 'verified' : 'unverified', balance: 'not_checked', model: 'not_checked' };
  if (response.ok) {
    const balance = await response.json();
    result.balance = balance.is_available === true ? 'available' : 'insufficient';
    result.currencies = (balance.balance_infos || []).map(item => ({ currency: item.currency, total: item.total_balance }));
  } else if (response.status === 402) result.balance = 'insufficient';
  else if (![403, 404].includes(response.status)) throw providerFailure('deepseek', response.status);
  if (probe && result.balance !== 'insufficient') {
    const sample = await requestStructuredLlm({ provider: 'deepseek', systemText: 'Return JSON with exactly one key, ok, whose value is true.', userText: 'Check this model connection.', schema: { ok: true }, maxOutputTokens: 32, timeoutMs: 10000, totalTimeoutMs: 10000 });
    result.model = sample.parsed?.ok === true ? 'available' : 'invalid_response';
    if (result.model === 'available') result.authentication = 'verified';
    result.modelId = sample.model;
    result.usage = sample.usage;
  }
  return result;
}

export async function streamConversationReply({ systemText, userText, onDelta, signal, timeoutMs = 12000 }) {
  if (!process.env.DEEPSEEK_API_KEY) throw Object.assign(new Error('no_deepseek_api_key_configured'), { code: 'no_deepseek_api_key_configured', status: 503 });
  if (systemText.length + userText.length > 12000) throw Object.assign(new Error('model_input_too_large'), { code: 'model_input_too_large', status: 413 });
  const model = normalizeDeepSeekModel(process.env.DEEPSEEK_CONVERSATION_MODEL || process.env.DEEPSEEK_MODEL);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('provider_timeout')), timeoutMs);
  const started = performance.now();
  let response;
  try {
    countModelRequest();
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model, thinking: { type: 'disabled' }, stream: true, stream_options: { include_usage: true }, max_tokens: 180, messages: [{ role: 'system', content: systemText }, { role: 'user', content: userText }] }),
    });
    if (!response.ok) throw providerFailure('deepseek', response.status);
    if (!response.body) throw Object.assign(new Error('provider_stream_missing'), { code: 'provider_stream_missing' });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', reply = '', firstTokenMs = null, usage = null, done = false, finishReason = null;
    try { while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, boundary).trim(); buffer = buffer.slice(boundary + 2);
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
        if (!data) continue;
        if (data === '[DONE]') { done = true; break; }
        let value;
        try { value = JSON.parse(data); } catch { throw Object.assign(new Error('provider_stream_invalid_json'), { code: 'provider_stream_invalid_json' }); }
        if (value.usage) { usage = value.usage; countModelUsage(usage); }
        if (value.choices?.[0]?.finish_reason) finishReason = value.choices[0].finish_reason;
        const delta = value.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - started);
          reply += delta;
          if (reply.length > 1000) throw Object.assign(new Error('provider_response_too_long'), { code: 'provider_response_too_long' });
          await onDelta?.(delta);
        }
      }
    } } finally { if (!done) await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!done || finishReason !== 'stop' || !reply.trim()) throw Object.assign(new Error('provider_stream_incomplete'), { code: 'provider_stream_incomplete' });
    return { provider: 'deepseek', model, reply: reply.trim(), usage, firstTokenMs, totalMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    if (!response?.body?.locked) await response?.body?.cancel?.().catch(() => {});
  }
}
