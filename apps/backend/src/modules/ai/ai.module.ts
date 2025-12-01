import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { AiService } from './ai.service';

/**
 * AiModule - Global AI service module for multi-provider chat completions
 *
 * This module provides application-wide access to AI chat completion services
 * through a unified interface that supports multiple providers (Ollama, OpenRouter, OpenAI).
 *
 * Module Features:
 * - **Global Scope**: Marked with @Global() decorator for application-wide availability
 * - **Provider Abstraction**: Single AiService interface for multiple AI providers
 * - **Zero Configuration**: Automatically initializes available providers on startup
 * - **Dependency Injection**: AiService injectable in any module without explicit import
 *
 * Provider Support:
 * - **Ollama**: Local LLM runtime (no API key required)
 * - **OpenRouter**: AI provider aggregator (requires OPENROUTER_API_KEY)
 * - **OpenAI**: Official OpenAI API (requires OPENAI_API_KEY)
 *
 * Configuration Requirements:
 * - ConfigModule must be available (automatically imported)
 * - Environment variables for desired providers (see AiService documentation)
 *
 * Usage in Other Modules:
 * Since this module is global, you can inject AiService anywhere without importing AiModule:
 *
 * @example
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { AiService } from '../ai/ai.service';
 *
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly aiService: AiService) {}
 *
 *   async generateResponse(userMessage: string): Promise<string | null> {
 *     return this.aiService.chat(
 *       "You are a helpful assistant",
 *       userMessage,
 *       'ollama'  // or 'openrouter' or 'openai'
 *     );
 *   }
 * }
 * ```
 *
 * @see AiService for detailed provider configuration and usage examples
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
