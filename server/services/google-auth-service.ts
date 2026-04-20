import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

class GoogleAuthService {
  private client: OAuth2Client | null = null;
  private clientId: string | null = null;

  constructor() {
    this.configure();
  }

  private configure() {
    const explicitClientId = process.env.GOOGLE_AUTH_CLIENT_ID;
    const fallbackClientId = process.env.GOOGLE_CLIENT_ID; // reuse Drive client if dedicated ID not provided

    this.clientId = explicitClientId || fallbackClientId || null;

    if (!this.clientId) {
      console.warn('[GoogleAuthService] GOOGLE_AUTH_CLIENT_ID or GOOGLE_CLIENT_ID not configured. Google login is disabled.');
      this.client = null;
      return;
    }

    this.client = new OAuth2Client(this.clientId);
  }

  isConfigured(): boolean {
    return !!this.client && !!this.clientId;
  }

  async verifyIdToken(idToken: string): Promise<GoogleUserProfile> {
    if (!this.client || !this.clientId) {
      throw new Error('Google authentication is not configured');
    }

    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      throw new Error('Unable to verify Google credential');
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }
}

export const googleAuthService = new GoogleAuthService();
