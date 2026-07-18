/**
 * Google Drive OAuth 2.0 authentication.
 *
 * Uses refresh_token → access_token flow.
 * Access token is cached in-memory per Worker isolate and auto-refreshed.
 */

export interface GoogleDriveAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class GoogleDriveAuth {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(private config: GoogleDriveAuthConfig) {}

  /**
   * Get a valid access token.
   * Returns cached token if still valid, otherwise refreshes.
   */
  async getAccessToken(): Promise<string> {
    // Refresh 60 seconds before expiry to be safe
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }
    return this.refresh();
  }

  /**
   * Refresh the access token using the refresh token.
   */
  private async refresh(): Promise<string> {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Google OAuth token refresh failed: ${errText}`);
    }

    const data: any = await resp.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return this.accessToken!;
  }
}