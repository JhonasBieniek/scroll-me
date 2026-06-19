import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_FEED_PAGE_SIZE = 10;
export const MAX_FEED_PAGE_SIZE = 50;

export class FeedQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_FEED_PAGE_SIZE)
  take?: number;
}
