const DEFAULT_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterDelayMs(retryAfterHeader) {
  if (!retryAfterHeader) return null;

  const numericSeconds = Number(retryAfterHeader);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return numericSeconds * 1000;
  }

  const retryDate = Date.parse(retryAfterHeader);
  if (!Number.isNaN(retryDate)) {
    const delay = retryDate - Date.now();
    return delay > 0 ? delay : 0;
  }

  return null;
}

function getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs) {
  const jitter = Math.floor(Math.random() * 125);
  const exponential = baseDelayMs * (2 ** attempt);
  return Math.min(exponential + jitter, maxDelayMs);
}

function isRetryableNetworkError(error) {
  if (!error) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError;
}

function normalizeError(error, fallbackMessage, context) {
  const finalError = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
  const safeContext = context ? ` [${context}]` : '';
  finalError.message = `${fallbackMessage}${safeContext} Detalhe: ${finalError.message}`;
  return finalError;
}

async function fetchWithTimeout(input, init, timeoutMs) {
  const controller = new AbortController();
  const externalSignal = init?.signal;

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let onAbort = null;
  if (externalSignal) {
    onAbort = () => controller.abort();
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error(`Timeout de ${timeoutMs}ms atingido`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && onAbort) {
      externalSignal.removeEventListener('abort', onAbort);
    }
  }
}

export async function requestWithFallback(input, init = {}, options = {}) {
  const {
    retries = 2,
    timeoutMs = 12000,
    retryableStatus = DEFAULT_RETRYABLE_STATUS,
    baseDelayMs = 300,
    maxDelayMs = 2500,
    fallbackMessage = 'Falha ao processar a requisicao.',
    context = '',
    onRetry = null
  } = options;

  const maxAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);

      if (response.ok || !retryableStatus.has(response.status) || attempt === retries) {
        return response;
      }

      const retryAfterMs = getRetryAfterDelayMs(response.headers.get('retry-after'));
      const delayMs = retryAfterMs ?? getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      if (typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 1,
          maxAttempts,
          reason: `status_${response.status}`,
          delayMs
        });
      }
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      const canRetry = isRetryableNetworkError(error) && attempt < retries;
      if (!canRetry) {
        throw normalizeError(error, fallbackMessage, context);
      }

      const delayMs = getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      if (typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 1,
          maxAttempts,
          reason: error?.name || 'network_error',
          delayMs
        });
      }
      await sleep(delayMs);
    }
  }

  throw normalizeError(lastError, fallbackMessage, context);
}

export async function requestJsonWithFallback(input, init = {}, options = {}) {
  const response = await requestWithFallback(input, init, options);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    const excerpt = bodyText.trim().slice(0, 180);
    const httpError = new Error(excerpt || `Erro HTTP ${response.status}`);
    httpError.status = response.status;
    throw normalizeError(
      httpError,
      options.fallbackMessage || 'Falha ao obter resposta JSON.',
      options.context || ''
    );
  }
  return response.json();
}
