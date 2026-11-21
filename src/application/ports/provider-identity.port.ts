export interface AuthenticatedProvider {
  providerId: string;
  subject: string;
  scopes: string[];
}

export interface ProviderIdentityPort {
  resolveFromHeader(authorizationHeader?: string): Promise<AuthenticatedProvider | null>;
}

export const PROVIDER_IDENTITY_PORT = Symbol('PROVIDER_IDENTITY_PORT');