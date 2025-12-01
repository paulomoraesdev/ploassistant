import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { TwitchAuthService } from './twitch-auth.service';
import { ApiClient } from '@twurple/api';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { TwitchEventService } from './twitch-event.service';
import { TWITCH_CHAT_CLIENT } from './twitch.provider';
import { ChatClient } from '@twurple/chat';

@Injectable()
export class TwitchEventSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchEventSubService.name);

  // Usamos '!' (Definite Assignment Assertion) pois inicializamos no onModuleInit
  private apiClient!: ApiClient;
  private listener!: EventSubWsListener;

  constructor(
    private readonly config: ConfigService,
    private readonly authService: TwitchAuthService,
    private readonly businessLogic: TwitchEventService,
    // Injetamos o ChatClient globalmente para passar para a lógica de negócio
    @Inject(TWITCH_CHAT_CLIENT) private readonly chatClient: ChatClient,
  ) {}

  async onModuleInit() {
    await this.authService.waitForInitialization();

    if (!this.authService.hasValidTokens()) {
      this.logger.warn('⚠️ EventSub não iniciado: Tokens inválidos.');
      return;
    }

    const authProvider = this.authService.getAuthProvider();

    // Verificação explícita para satisfazer o TypeScript
    if (!authProvider) {
      this.logger.error('⚠️ EventSub falhou: AuthProvider nulo.');
      return;
    }

    const userId = await this.getMyUserId(authProvider);

    if (!userId) return;

    this.apiClient = new ApiClient({ authProvider });

    this.listener = new EventSubWsListener({ apiClient: this.apiClient });

    this.listener.start();
    this.logger.log('✅ EventSub (WebSocket) Conectado e ouvindo eventos.');

    this.registerEvents(userId);
  }

  onModuleDestroy() {
    if (this.listener) {
      this.listener.stop();
    }
  }

  private async getMyUserId(authProvider: any): Promise<string | null> {
    const apiClient = new ApiClient({ authProvider });
    const user = await apiClient.users.getUserByName(
      this.config.get('TWITCH_CHANNEL')!,
    );
    return user?.id || null;
  }

  private registerEvents(userId: string) {
    // --- SUBSCRIPTION ---
    this.listener.onChannelSubscription(userId, (event) => {
      this.logger.log(`🔔 EventSub: Novo Sub de ${event.userName}`);

      void this.businessLogic.onSubscription(
        event.broadcasterName,
        event.userName,
        event as any,
        this.chatClient, // Agora passamos o cliente real
      );
    });

    // --- FOLLOW ---
    this.listener.onChannelFollow(userId, userId, (event) => {
      this.logger.log(`👤 EventSub: Novo Follow de ${event.userName}`);
      // Futuro: this.businessLogic.onFollow(...)
    });

    // --- RAID ---
    this.listener.onChannelRaidTo(userId, (event) => {
      this.logger.log(
        `🚨 EventSub: Raid de ${event.raidingBroadcasterName} com ${event.viewers} viewers`,
      );

      void this.businessLogic.onRaid(
        event.raidedBroadcasterDisplayName,
        event.raidingBroadcasterName,
        { viewers: event.viewers },
        this.chatClient,
      );
    });

    // --- CHANNEL POINTS ---
    this.listener.onChannelRedemptionAdd(userId, (event) => {
      this.logger.log(
        `💎 Recompensa resgatada: ${event.rewardTitle} por ${event.userName}`,
      );
    });
  }
}