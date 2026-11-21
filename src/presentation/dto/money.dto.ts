import { IsNotEmpty, IsString, Length } from 'class-validator';

export class MoneyDto {
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;
}