import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { WalletQueriesUseCase } from '../../application/use-cases/queries.use-case';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case';
import { NoOpAuthGuard } from '../../infrastructure/auth/noop-auth.guard';
import { CreateWalletDto } from '../dto/create-wallet.dto';

@Controller('wallets')
@UseGuards(NoOpAuthGuard)
export class WalletsController {
  constructor(
    private readonly createWallet: CreateWalletUseCase,
    private readonly queries: WalletQueriesUseCase,
    private readonly reconcileWallet: ReconcileWalletUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWalletDto) {
    return this.createWallet.execute(dto);
  }

  @Get(':walletId')
  getById(@Param('walletId', ParseUUIDPipe) walletId: string) {
    return this.queries.getWallet(walletId);
  }

  @Get(':walletId/ledger')
  getLedger(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 50;
    return this.queries.getLedger(walletId, cursor, Number.isNaN(parsedLimit) ? 50 : parsedLimit);
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  reconcile(@Param('walletId', ParseUUIDPipe) walletId: string) {
    return this.reconcileWallet.execute(walletId);
  }
}