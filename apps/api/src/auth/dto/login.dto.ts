import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(3, 255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  account!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
