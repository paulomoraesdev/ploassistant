import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import OpenAI from 'openai';

// Define os tipos de provedores suportados
export type AiProvider = 'ollama' | 'openrouter' | 'openai';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  // Dicionário para armazenar as múltiplas instâncias de clientes
  private clients: Partial<Record<AiProvider, OpenAI>> = {};

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.initializeOllama();
    this.initializeOpenRouter();
    this.initializeOpenAI();

    this.logger.log(
      `🤖 AI Service initialized with providers: ${Object.keys(this.clients).join(', ')}`
    );
  }

  /**
   * Inicializa o cliente para Ollama (Local)
   */
  private initializeOllama() {
    const url = this.config.get('OLLAMA_BASE_URL') || 'http://localhost:11434/v1';
    try {
      this.clients.ollama = new OpenAI({
        baseURL: url,
        apiKey: 'ollama', // Ollama não exige key, mas a lib pede uma string
      });
    } catch (e) {
      this.logger.warn('⚠️ Failed to initialize Ollama client');
    }
  }

  /**
   * Inicializa o cliente para OpenRouter (Aggregator)
   */
  private initializeOpenRouter() {
    const key = this.config.get('OPENROUTER_API_KEY'); // Adicione esta key no seu .env
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
   * Inicializa o cliente oficial da OpenAI
   */
  private initializeOpenAI() {
    const key = this.config.get('OPENAI_API_KEY'); // Adicione esta key no seu .env
    if (key) {
      this.clients.openai = new OpenAI({
        apiKey: key,
      });
    }
  }

  /**
   * Método flexível para gerar respostas de chat usando o provedor escolhido.
   *
   * @param systemPrompt - Persona do bot.
   * @param userMessage - Mensagem do usuário.
   * @param provider - Qual IA usar: 'ollama' (padrão), 'openrouter' ou 'openai'.
   * @param modelOverride - (Opcional) Forçar um modelo específico.
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

    // Seleção automática de modelo baseada no provedor
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
   * Helper para definir defaults de cada provedor
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
