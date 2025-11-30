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
 * This service handles the complete OAuth flow for Twitch bot authentication,
 * including token exchange, automatic refresh, and file-based persistence.
 * It provides a RefreshingAuthProvider instance to TwitchService for chat client initialization.
 */
@Injectable()
export class TwitchAuthService {
  private authProvider: RefreshingAuthProvider | null = null;
  private readonly tokensFilePath: string;
  private readonly TWITCH_SCOPES = 'chat:read chat:edit';

  constructor(private readonly config: ConfigService) {
    // Set token file path relative to project root
    this.tokensFilePath = join(__dirname, '../../../data/twitch-tokens.json');

    // Asynchronously load tokens on service initialization
    this.loadTokens()
      .then((tokenData) => {
        if (tokenData) {
          this.initializeAuthProvider(tokenData);
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
    this.initializeAuthProvider(tokenData);
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
  private initializeAuthProvider(tokenData: AccessToken): void {
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

    // Add user tokens with chat intent
    this.authProvider.addUserForToken(tokenData, ['chat']).catch((error) => {
      console.error('[TwitchAuthService] Failed to add user tokens:', error);
    });

    // Setup automatic token persistence on refresh
    this.authProvider.onRefresh((userId, newTokenData) => {
      console.log(`[TwitchAuthService] Tokens refreshed for user ${userId}`);
      return this.saveTokens(newTokenData);
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
      await mkdir(dirname(this.tokensFilePath), { recursive: true });

      // Write tokens to file
      await writeFile(
        this.tokensFilePath,
        JSON.stringify(tokenData, null, 2),
        'utf-8',
      );

      console.log('[TwitchAuthService] Tokens saved to file successfully');
    } catch (error) {
      console.error('[TwitchAuthService] Failed to save tokens:', error);
      throw error;
    }
  }
}
