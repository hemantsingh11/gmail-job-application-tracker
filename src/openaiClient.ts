import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ModelPolicy {
  backoffMs: number[];
}

const defaultPolicy: ModelPolicy = { backoffMs: [500, 1000, 2000] };

// Per-model rate-limit aware backoff plans (tunable).
const modelPolicies: Record<string, ModelPolicy> = {
  'gpt-4o-mini': {
    // 2M TPM / 12k RPM — short backoff should absorb brief spikes.
    backoffMs: [400, 800, 1600, 3200],
  },
  'gpt-5-mini': {
    // 500k TPM / ~60 RPM
    backoffMs: [400, 800, 1600, 3200],
  },
  'gpt-5-nano': {
    // 200–300k TPM / ~60 RPM
    backoffMs: [300, 600, 1200, 2400],
  },
};

interface ChatOptions {
  model: string;
  temperature?: number;
  response_format?: any;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(err: any): boolean {
  const status = err?.status || err?.code;
  if (status === 429) return true;
  const message = err?.message || '';
  return typeof message === 'string' && message.toLowerCase().includes('rate limit');
}

export async function callChat(options: ChatOptions): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set; cannot call OpenAI.');
  }
  const policy = modelPolicies[options.model] || defaultPolicy;
  let lastError: any;
  const attempts = policy.backoffMs.length + 1;
  const includeTemperature =
    typeof options.temperature === 'number' && !options.model.startsWith('gpt-5');
  const payload: any = {
    model: options.model,
    messages: options.messages,
  };
  if (includeTemperature) {
    payload.temperature = options.temperature;
  }
  if (options.response_format) {
    payload.response_format = options.response_format;
  }

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data?.error?.message || 'OpenAI request failed';
        const err: any = new Error(errorMessage);
        err.status = response.status;
        err.code = data?.error?.code;
        throw err;
      }
      return data;
    } catch (err: any) {
      lastError = err;
      const shouldRetry = isRateLimit(err) || err?.status === 503;
      if (!shouldRetry || i === attempts - 1) {
        break;
      }
      const delay = policy.backoffMs[i] ?? policy.backoffMs[policy.backoffMs.length - 1];
      await sleep(delay);
    }
  }
  throw lastError;
}
