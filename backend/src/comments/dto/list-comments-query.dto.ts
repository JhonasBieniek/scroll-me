import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_COMMENT_PAGE_SIZE = 20;
export const MAX_COMMENT_PAGE_SIZE = 50;

export class ListCommentsQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COMMENT_PAGE_SIZE)
  take?: number;
}
