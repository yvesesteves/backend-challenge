import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  DomainError,
  DuplicateWalletError,
  IdempotencyConflictError,
  InvalidInputError,
  InvalidMoneyError,
  NotFoundError,
} from '../../domain/errors/domain.error';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(exception.getResponse());
      return;
    }

    if (exception instanceof DomainError) {
      const status = this.mapDomainErrorToStatus(exception);
      res.status(status).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (this.isTransientInfraError(exception)) {
      this.logger.warn({ msg: 'Transient infrastructure failure', error: String(exception) });
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Temporary infrastructure unavailability, please retry',
      });
      return;
    }

    this.logger.error({ msg: 'Unhandled exception', error: String(exception) });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected internal error',
    });
  }

  private mapDomainErrorToStatus(error: DomainError): number {
    if (error instanceof InvalidMoneyError || error instanceof InvalidInputError) {
      return HttpStatus.BAD_REQUEST;
    }
    if (error instanceof NotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (error instanceof IdempotencyConflictError || error instanceof DuplicateWalletError) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private isTransientInfraError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: string }).code ?? '';
    return ['ECONNREFUSED', 'ETIMEDOUT', '57P01', '57P03', '08006', '40P01', '40001'].includes(code);
  }
}