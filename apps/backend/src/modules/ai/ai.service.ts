import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import OpenAI from 'openai';

/**
 * AI Provider Types
 *
 * Defines the supported AI providers for the multi-provider abstraction system.
 *
 * Available providers:
 * - ollama: Local/on-premise LLM (default)
 * - openrouter: AI provider aggregator
 * - openai: Official OpenAI API
 */
export type AiProvider = 'ollama' | 'openrouter' | 'openai';

/**
 * AiService - Multi-provider AI chat abstraction
 *
 * This service provides a unified interface for generating AI chat completions
 * across multiple providers (Ollama, OpenRouter, OpenAI). It allows the application
 * to switch between providers without changing consumer code.
 *
 * Architecture:
 * - Provider abstraction with unified interface
 * - Multiple OpenAI client instances (one per provider)
 * - Automatic provider initialization on module startup
 * - Default model selection per provider
 * - Graceful failure handling for missing providers
 *
 * Configuration:
 * - OLLAMA_BASE_URL: Base URL for Ollama (default: http://localhost:11434/v1)
 * - OLLAMA_MODEL: Default Ollama model (default: llama3)
 * - OPENROUTER_API_KEY: API key for OpenRouter (required for OpenRouter)
 * - OPENAI_API_KEY: API key for OpenAI (required for OpenAI)
 *
 * @example
 * ```typescript
 * // Generate response using default provider (Ollama)
 * const response = await aiService.chat(
 *   "You are a helpful assistant",
 *   "What is TypeScript?",
 * );
 *
 * // Generate response using specific provider
 * const response = await aiService.chat(
 *   "You are a helpful assistant",
 *   "What is TypeScript?",
 *   'openrouter',
 *   'anthropic/claude-3-haiku'
 * );
 * ```
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  /**
   * Dictionary storing multiple OpenAI client instances
   * Each provider has its own client configured with provider-specific settings
   */
  private clients: Partial<Record<AiProvider, OpenAI>> = {};

  /**
   * Creates an instance of AiService
   *
   * @param config - Configuration service for accessing environment variables
   */
  constructor(private readonly config: ConfigService) {}

  /**
   * NestJS lifecycle hook called when the module is initialized
   *
   * Initializes all available AI providers based on configuration.
   * Ollama is always initialized (local, no API key required).
   * OpenRouter and OpenAI are initialized only if API keys are provided.
   */
  onModuleInit() {
    this.initializeOllama();
    this.initializeOpenRouter();
    this.initializeOpenAI();

    this.logger.log(
      `🤖 AI Service initialized with providers: ${Object.keys(this.clients).join(', ')}`
    );
  }

  /**
   * Initializes the Ollama client (Local LLM)
   *
   * Ollama is a local LLM runtime that doesn't require an API key.
   * The OpenAI client library requires an apiKey parameter, so we pass 'ollama'
   * as a placeholder string which Ollama ignores.
   *
   * Configuration:
   * - OLLAMA_BASE_URL: Custom base URL (default: http://localhost:11434/v1)
   *
   * @private
   */
  private initializeOllama() {
    const url = this.config.get('OLLAMA_BASE_URL') || 'http://localhost:11434/v1';
    try {
      this.clients.ollama = new OpenAI({
        baseURL: url,
        apiKey: 'ollama', // Ollama doesn't require a key, but the library requires a string
      });
    } catch (e) {
      this.logger.warn('⚠️ Failed to initialize Ollama client');
    }
  }

  /**
   * Initializes the OpenRouter client (AI Provider Aggregator)
   *
   * OpenRouter provides access to multiple AI models through a single API.
   * Requires OPENROUTER_API_KEY environment variable.
   *
   * Configuration:
   * - OPENROUTER_API_KEY: Required API key from OpenRouter
   *
   * Default Headers:
   * - HTTP-Referer: Identifies the application (for OpenRouter dashboard)
   * - X-Title: Application name
   *
   * @private
   */
  private initializeOpenRouter() {
    const key = this.config.get('OPENROUTER_API_KEY');
    if (key) {
      this.clients.openrouter = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: key,
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/seu-repo',
          'X-Title': 'Bot Twitch NestJS',
        },
      });
    }
  }

  /**
   * Initializes the official OpenAI client
   *
   * Provides access to OpenAI's GPT models (GPT-4, GPT-3.5, etc.).
   * Requires OPENAI_API_KEY environment variable.
   *
   * Configuration:
   * - OPENAI_API_KEY: Required API key from OpenAI
   *
   * @private
   */
  private initializeOpenAI() {
    const key = this.config.get('OPENAI_API_KEY');
    if (key) {
      this.clients.openai = new OpenAI({
        apiKey: key,
      });
    }
  }

  /**
   * Generates AI chat completion using the specified provider
   *
   * This is the main public method for generating AI responses. It abstracts away
   * provider-specific differences and provides a consistent interface.
   *
   * Request Parameters (hardcoded for consistency):
   * - temperature: 0.7 (balanced creativity/consistency)
   * - max_tokens: 300 (response length limit)
   *
   * @param systemPrompt - System message defining the AI's behavior/persona
   * @param userMessage - User's message/question
   * @param provider - Which AI provider to use (default: 'ollama')
   * @param modelOverride - Optional specific model override (bypasses default model selection)
   * @returns The AI's response text, or null if request fails
   * @example
   * ```typescript
   * const response = await aiService.chat(
   *   "You are a Twitch bot assistant",
   *   "How do I create a custom command?",
   *   'openrouter',
   *   'anthropic/claude-3-haiku'
   * );
   * ```
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    provider: AiProvider = 'ollama',
    modelOverride?: string,
  ): Promise<string | null> {
    const client = this.clients[provider];

    if (!client) {
      this.logger.error(
        `❌ Provider '${provider}' is not configured or available.`,
      );
      return 'Erro: Provedor de IA não disponível.';
    }

    // Automatic model selection based on provider
    const model = modelOverride || this.getDefaultModelForProvider(provider);

    try {
      const completion = await client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      return completion.choices[0]?.message?.content || null;
    } catch (error) {
      this.logger.error(`[${provider}] AI Request failed: ${error}`);
      return null;
    }
  }

  /**
   * Gets the default model for a given provider
   *
   * Each provider has a sensible default model selected for:
   * - Performance: Balance between speed and quality
   * - Cost: Prefer cost-effective models
   * - Availability: Use widely available models
   *
   * Default Models:
   * - ollama: llama3 (configurable via OLLAMA_MODEL)
   * - openrouter: anthropic/claude-3-haiku (fast, cost-effective)
   * - openai: gpt-4o-mini (OpenAI's cost-effective model)
   *
   * @param provider - The AI provider
   * @returns The default model identifier for the provider
   * @private
   */
  private getDefaultModelForProvider(provider: AiProvider): string {
    switch (provider) {
      case 'ollama':
        return this.config.get('OLLAMA_MODEL') || 'llama3';
      case 'openrouter':
        return 'anthropic/claude-3-haiku';
      case 'openai':
        return 'gpt-4o-mini';
      default:
        return 'gpt-3.5-turbo';
    }
  }
}
