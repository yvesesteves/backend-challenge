import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum';
import { MoneyDto } from './money.dto';

export class SubmitWagerTransactionDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsUUID()
  playerId!: string;

  @IsUUID()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsEnum(WagerTransactionKind)
  kind!: WagerTransactionKind;

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  referenceExternalTransactionId?: string;
}