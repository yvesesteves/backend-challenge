import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { WalletQueriesUseCase } from '../../application/use-cases/queries.use-case';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status.enum';
import { NoOpAuthGuard } from '../../infrastructure/auth/noop-auth.guard';
import { SubmitWagerTransactionDto } from '../dto/submit-wager-transaction.dto';

@Controller()
@UseGuards(NoOpAuthGuard)
export class WageringController {
  constructor(
    private readonly processWager: ProcessWagerTransactionUseCase,
    private readonly queries: WalletQueriesUseCase,
  ) {}

  @Post('wagering/transactions')
  async submit(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string | undefined,
    @Body() dto: SubmitWagerTransactionDto,
    @Res() res: Response,
  ) {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException({
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Header Idempotency-Key is required',
      });
    }

    const result = await this.processWager.execute({
      idempotencyKey: idempotencyKey.trim(),
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      playerId: dto.playerId,
      walletId: dto.walletId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      money: dto.money,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
      correlationId,
      source: 'http',
    });

    const status =
      result.status === WagerTransactionStatus.PendingReference
        ? HttpStatus.ACCEPTED
        : result.status === WagerTransactionStatus.Rejected
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : HttpStatus.OK;

    return res.status(status).json(result);
  }

  @Get('wagering/transactions/:transactionId')
  getById(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    return this.queries.getTransactionById(transactionId);
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  getByProviderAndExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return this.queries.getTransactionByProviderExternalId(providerId, externalTransactionId);
  }
}