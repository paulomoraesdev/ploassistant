import { Controller, Get, Res, Query } from '@nestjs/common';
import type { Response } from 'express';
import { TwitchAuthService } from './twitch-auth.service';

/**
 * TwitchController - HTTP endpoints for Twitch OAuth authentication
 *
 * Provides endpoints for initiating OAuth flow and handling OAuth callbacks.
 */
@Controller('twitch')
export class TwitchController {
  constructor(private readonly authService: TwitchAuthService) {}

  /**
   * Redirects user to Twitch OAuth authorization page
   *
   * Initiates the OAuth flow by redirecting the user to Twitch's authorization page
   * where they can grant permissions for the bot to access their Twitch account.
   *
   * @param res - Express Response object for performing the redirect
   */
  @Get('authenticate')
  authenticate(@Res() res: Response): void {
    const authUrl = this.authService.getAuthorizationUrl();
    res.redirect(authUrl);
  }

  /**
   * Handles OAuth callback from Twitch authorization
   *
   * Processes the OAuth callback after user authorization, exchanges the authorization
   * code for access tokens, and returns the authentication result.
   *
   * @param code - The authorization code from Twitch (present on success)
   * @param error - The error code from Twitch (present if user denies authorization)
   * @returns Object indicating success or failure with appropriate message
   */
  @Get('authenticate/callback')
  async authenticateCallback(
    @Query('code') code: string,
    @Query('error') error: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    // Handle user denying authorization
    if (error) {
      return {
        success: false,
        error: 'Authorization denied by user',
      };
    }

    // Handle missing authorization code
    if (!code) {
      return {
        success: false,
        error: 'No authorization code received',
      };
    }

    try {
      // Exchange code for tokens
      await this.authService.exchangeCode(code);

      return {
        success: true,
        message:
          'Authentication successful! Twitch bot is now connected. You can close this window.',
      };
    } catch (err) {
      console.error('[TwitchController] Token exchange failed:', err);

      return {
        success: false,
        error: 'Failed to exchange authorization code for tokens',
      };
    }
  }
}
