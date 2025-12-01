import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { TwitchAuthService } from './twitch-auth.service';
import { ChatClient } from '@twurple/chat';

/**
 * Injection token for the Twitch ChatClient
 *
 * This string token is used with @Inject() to inject the ChatClient instance
 * into services that need direct access to Twitch chat.
 *
 * @example
 * ```typescript
 * constructor(
 *   @Inject(TWITCH_CHAT_CLIENT) private readonly chatClient: ChatClient | null
 * ) {}
 * ```
 */
export const TWITCH_CHAT_CLIENT = 'TWITCH_CHAT_CLIENT';

/**
 * TwitchClientProvider - Factory provider for ChatClient creation
 *
 * This is a NestJS factory provider that handles the asynchronous creation and
 * initialization of the Twitch ChatClient instance. It implements the Factory Pattern
 * to solve several architectural challenges:
 *
 * Benefits of Factory Pattern:
 * 1. **Async Initialization**: Waits for TwitchAuthService to load tokens before creating client
 * 2. **Circular Dependency Prevention**: Avoids circular deps between services
 * 3. **Single Instance**: Ensures one ChatClient is shared across all consumers
 * 4. **Graceful Failure**: Returns null if authentication fails, allowing services to handle gracefully
 * 5. **Centralized Configuration**: All ChatClient configuration in one place
 *
 * Creation Flow:
 * 1. Wait for TwitchAuthService to complete token loading
 * 2. Validate tokens are available
 * 3. Retrieve auth provider and channel configuration
 * 4. Create ChatClient with auth and channel
 * 5. Connect to Twitch chat immediately
 * 6. Return client instance (or null on failure)
 *
 * Usage:
 * - Injected into TwitchChatService for message handling
 * - Injected into TwitchEventSubService for event responses
 * - Can be injected into any service that needs chat access
 *
 * @see TwitchChatService for primary consumer
 * @see TwitchEventSubService for event-driven usage
 */
export const TwitchClientProvider: Provider = {
  provide: TWITCH_CHAT_CLIENT,
  useFactory: async (
    config: ConfigService,
    authService: TwitchAuthService,
  ): Promise<ChatClient | null> => {
    const logger = new Logger('TwitchClientFactory');

    // 1. Ensure Auth is ready
    await authService.waitForInitialization();

    if (!authService.hasValidTokens()) {
      logger.warn(
        '⚠️ Chat Client not created: No valid tokens found. Please authenticate.',
      );
      return null;
    }

    const authProvider = authService.getAuthProvider();
    const channel = config.get('TWITCH_CHANNEL');

    if (!authProvider || !channel) {
      logger.error('❌ Missing AuthProvider or Channel configuration.');
      return null;
    }

    try {
      // 2. Instantiate the client
      const client = new ChatClient({
        authProvider,
        channels: [channel],
        logger: { minLevel: 'error' }, // Reduce internal library noise
      });

      // 3. Connect immediately (Optional, can be done in service)
      client.connect();
      logger.log(`✅ Chat Client connected to channel: ${channel}`);

      return client;
    } catch (error) {
      logger.error('❌ Failed to create ChatClient', error);
      return null;
    }
  },
  inject: [ConfigService, TwitchAuthService],
};
