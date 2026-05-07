import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ArticleStatus } from '@prisma/client';

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200000)
  content?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  summary?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  coverImage?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(({ value }: { value: unknown }) => normalizeOptionalString(value))
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(({ value }: { value: unknown }) => {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  })
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined,
  )
  publishedAt?: string;
}
