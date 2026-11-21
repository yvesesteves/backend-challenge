import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Ponto de extensão explícito para integração com IdP externo (Keycloak / Zitadel via OIDC).
 * Decisão arquitetural documentada em ARCHITECTURE.md conforme Seção 2 do desafio.
 */
@Injectable()
export class NoOpAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}