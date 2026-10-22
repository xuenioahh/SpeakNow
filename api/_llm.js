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

async function requestCompatibleJson({ provider, apiKey, baseUrl, models, systemText, userText, schemaName, timeoutMs = 6000, maxModelsPerProvider = 1, retryOnce = true }) {
  let lastError = null;

  for (const model of dedupeModels(models).slice(0, maxModelsPerProvider)) {
    const maxAttempts = retryOnce ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { signal, clear } = withTimeout(timeoutMs);
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
            max_completion_tokens: 6000,
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
          const text = await response.text();
          lastError = new Error(`provider=${provider} model=${model} status=${response.status} body=${text}`);
          if (attempt === 0 && retryOnce && isRetryableStatus(response.status)) {
            await wait(300 + Math.floor(Math.random() * 500));
            continue;
          }
          break;
        }

        const data = await response.json();
        countModelUsage(data.usage);
        const parsed = safeJsonParse(data?.choices?.[0]?.message?.content || "");
        if (!parsed) {
          lastError = new Error(`provider=${provider} model=${model} invalid_model_payload`);
          break;
        }

        return { provider, model: data?.model || model, parsed };
      } catch (error) {
        lastError = new Error(`provider=${provider} model=${model} ${error?.message || "request_failed"}`);
        if (attempt === 0 && retryOnce && isRetryableMessage(error?.message)) {
          await wait(300 + Math.floor(Math.random() * 500));
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

export function llmProviderConfiguration({ openaiModels = [process.env.OPENAI_MODEL, "gpt-5-mini", "gpt-5", "gpt-4.1"], openrouterModels = [process.env.OPENROUTER_VOICE_CHAT_MODEL, "openrouter/free"] } = {}) {
  return [
    { provider: "openai", apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", models: openaiModels },
    { provider: "openrouter", apiKey: process.env.OPENROUTER_API_KEY, baseUrl: "https://openrouter.ai/api/v1", models: openrouterModels },
    { provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: "https://api.deepseek.com", models: [process.env.DEEPSEEK_MODEL, "deepseek-chat"] },
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
  provider = process.env.LLM_PROVIDER || "auto", timeoutMs = 6000, maxModelsPerProvider = 1, retryOnce = true, totalTimeoutMs = Infinity }) {
  const configurations = llmProviderConfiguration({ openaiModels, openrouterModels });
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
        userText, schemaName, timeoutMs: Math.min(timeoutMs, remaining), maxModelsPerProvider: Math.min(maxModelsPerProvider, 1), retryOnce: false });
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("all_llm_providers_failed");
}
