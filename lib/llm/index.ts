import { LlmProvider } from './provider';
import { GeminiProvider } from './geminiProvider';
import { AnthropicProvider } from './anthropicProvider';

let instance: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (instance) return instance;

  const provider = process.env.LLM_PROVIDER || 'gemini';
  instance = provider === 'anthropic' ? new AnthropicProvider() : new GeminiProvider();
  return instance;
}