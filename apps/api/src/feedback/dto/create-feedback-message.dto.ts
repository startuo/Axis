import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFeedbackMessageDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(50)
  text!: string;

  @Matches(/^#[0-9a-fA-F]{6}$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  color = '#fb78ad';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  timestamp!: number;
}
