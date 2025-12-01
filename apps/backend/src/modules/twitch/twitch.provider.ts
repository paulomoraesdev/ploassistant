import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { TwitchAuthService } from './twitch-auth.service';
import { ChatClient } from '@twurple/chat';

/**
 * Injection Token for the Twitch Chat Client.
 * Use this string (or constant) to inject the client into services.
 */
export const TWITCH_CHAT_CLIENT = 'TWITCH_CHAT_CLIENT';

/**
 * TwitchClientProvider
 *
 * This factory provider handles the asynchronous creation of the ChatClient.
 * It waits for authentication to be ready and configures the client properly.
 * This allows the ChatClient instance to be injected directly into any service
 * (ChatService, EventSubService, etc.) without circular dependencies.
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
