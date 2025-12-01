import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import {
  exchangeCode,
  RefreshingAuthProvider,
  AccessToken,
} from '@twurple/auth';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * TwitchAuthService - Manages Twitch OAuth authentication and token persistence
 *
 * This service handles the complete OAuth 2.0 flow for Twitch bot authentication,
 * including authorization URL generation, token exchange, automatic token refresh,
 * and file-based token persistence.
 *
 * Key Features:
 * - OAuth 2.0 authorization URL generation with required scopes
 * - Authorization code exchange for access/refresh tokens
 * - Automatic token refresh via RefreshingAuthProvider
 * - File-based token storage (data/twitch-tokens.json)
 * - Async initialization pattern with waitForInitialization()
 * - Provides RefreshingAuthProvider to other services
 *
 * OAuth Scopes Requested:
 * - chat:read - Read messages from chat
 * - chat:edit - Send messages to chat
 * - channel:read:subscriptions - Access subscription events
 * - moderator:read:followers - Read follower information
 * - channel:read:redemptions - Read channel point redemptions
 * - channel:manage:redemptions - Manage channel point redemptions
 *
 * Token Storage:
 * Tokens are stored in data/twitch-tokens.json with the following structure:
 * {
 *   accessToken: string,
 *   refreshToken: string,
 *   expiresIn: number,
 *   obtainmentTimestamp: number,
 *   scope: string[]
 * }
 *
 * @see TwitchClientProvider for ChatClient creation using this service
 * @see TwitchEventSubService for EventSub initialization using this service
 */
@Injectable()
export class TwitchAuthService {
  /** RefreshingAuthProvider instance for automatic token refresh */
  private authProvider: RefreshingAuthProvider | null = null;

  /** File path where tokens are persisted */
  private readonly tokensFilePath: string;

  /**
   * OAuth scopes requested from Twitch
   * These permissions define what the bot can access and do
   */
  private readonly TWITCH_SCOPES = [
    'chat:read',
    'chat:edit',
    'channel:read:subscriptions',
    'moderator:read:followers',
    'channel:read:redemptions',
    'channel:manage:redemptions',
  ].join(' ');

  /** Promise that resolves when token loading and initialization is complete */
  private initializationPromise: Promise<void>;

  /**
   * Creates an instance of TwitchAuthService
   *
   * Automatically begins asynchronous token loading from file system.
   * Other services should call waitForInitialization() before using this service.
   *
   * @param config - Configuration service for accessing environment variables
   */
  constructor(private readonly config: ConfigService) {
    this.tokensFilePath = join(process.cwd(), 'data/twitch-tokens.json');

    // Asynchronously load tokens on service initialization
    this.initializationPromise = this.loadTokens()
      .then(async (tokenData) => {
        if (tokenData) {
          await this.initializeAuthProvider(tokenData);
        }
      })
      .catch((error) => {
        console.error(
          '[TwitchAuthService] Error during initialization:',
          error,
        );
      });
  }

  /**
   * Waits for the service to complete initialization (token loading)
   *
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInitialization(): Promise<void> {
    return this.initializationPromise;
  }

  /**
   * Generates Twitch OAuth authorization URL with required scopes
   *
   * @returns The complete Twitch OAuth authorization URL
   * @throws Error if required configuration is missing
   */
  getAuthorizationUrl(): string {
    const clientId: string | null = this.config.get('TWITCH_CLIENT_ID');
    const redirectUri: string | null = this.config.get('TWITCH_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new Error(
        'Twitch Client ID or Redirect URI is not configured. ' +
          'Please ensure TWITCH_CLIENT_ID and TWITCH_REDIRECT_URI are set in your environment.',
      );
    }

    return `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(this.TWITCH_SCOPES)}`;
  }

  /**
   * Exchanges OAuth authorization code for access tokens
   *
   * Exchanges the authorization code received from Twitch OAuth callback for access and refresh tokens.
   * Initializes the RefreshingAuthProvider and sets up automatic token persistence on refresh.
   *
   * @param code - The authorization code from Twitch OAuth callback
   * @throws Error if token exchange fails or configuration is missing
   */
  async exchangeCode(code: string): Promise<void> {
    const clientId = this.config.get('TWITCH_CLIENT_ID');
    const clientSecret = this.config.get('TWITCH_CLIENT_SECRET');
    const redirectUri = this.config.get('TWITCH_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Twitch configuration incomplete. ' +
          'Please ensure TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_REDIRECT_URI are set.',
      );
    }

    // Exchange code for tokens using twurple
    const tokenData = await exchangeCode(
      clientId,
      clientSecret,
      code,
      redirectUri,
    );

    // Persist tokens to file system
    await this.saveTokens(tokenData);

    // Initialize auth provider with new tokens
    await this.initializeAuthProvider(tokenData);

    console.log('[TwitchAuthService] Authentication successful');
  }

  /**
   * Returns the RefreshingAuthProvider instance for use by TwitchService
   *
   * @returns The RefreshingAuthProvider instance, or null if not authenticated
   */
  getAuthProvider(): RefreshingAuthProvider | null {
    return this.authProvider;
  }

  /**
   * Checks if valid tokens are available
   *
   * @returns True if auth provider is initialized with tokens, false otherwise
   */
  hasValidTokens(): boolean {
    return this.authProvider !== null;
  }

  /**
   * Initializes RefreshingAuthProvider with token data
   *
   * Creates a new RefreshingAuthProvider instance and sets up automatic
   * token refresh with file persistence.
   *
   * @param tokenData - The access token data to initialize with
   */
  private async initializeAuthProvider(tokenData: AccessToken): Promise<void> {
    const clientId = this.config.get('TWITCH_CLIENT_ID');
    const clientSecret = this.config.get('TWITCH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error(
        '[TwitchAuthService] Cannot initialize auth provider: missing client credentials',
      );
      return;
    }

    // Create RefreshingAuthProvider
    this.authProvider = new RefreshingAuthProvider({
      clientId,
      clientSecret,
    });

    // Add user tokens - this is all we need for chat
    await this.authProvider.addUserForToken(tokenData, ['chat']);

    // Setup automatic token persistence on refresh
    this.authProvider.onRefresh((userId, newTokenData) => {
      console.log(`[TwitchAuthService] Tokens refreshed for user ${userId}`);
      this.saveTokens(newTokenData).catch((error) =>
        console.error(
          '[TwitchAuthService] Failed to save refreshed tokens:',
          error,
        ),
      );
    });
  }

  /**
   * Loads tokens from file system
   *
   * @returns The access token data if file exists and is valid, null otherwise
   */
  private async loadTokens(): Promise<AccessToken | null> {
    try {
      const fileContent = await readFile(this.tokensFilePath, 'utf-8');
      const tokenData = JSON.parse(fileContent) as AccessToken;
      console.log('[TwitchAuthService] Tokens loaded from file successfully');
      return tokenData;
    } catch (error) {
      // File doesn't exist or is invalid - this is expected on first run
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('[TwitchAuthService] No existing tokens found');
      } else {
        console.warn('[TwitchAuthService] Failed to load tokens:', error);
      }
      return null;
    }
  }

  /**
   * Saves tokens to file system
   *
   * Persists token data to file with automatic directory creation.
   *
   * @param tokenData - The access token data to save
   */
  private async saveTokens(tokenData: AccessToken): Promise<void> {
    try {
      // Ensure directory exists
      const dirPath = dirname(this.tokensFilePath);
      await mkdir(dirPath, { recursive: true });

      // Write tokens to file
      await writeFile(
        this.tokensFilePath,
        JSON.stringify(tokenData, null, 2),
        'utf-8',
      );

      console.log('[TwitchAuthService] Tokens saved successfully');
    } catch (error) {
      console.error('[TwitchAuthService] Failed to save tokens:', error);
      throw error;
    }
  }
}
