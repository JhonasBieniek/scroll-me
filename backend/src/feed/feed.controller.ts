import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import {
  mapPostsToResponse,
  PostResponse,
} from '../posts/post-response.mapper';
import { StorageService } from '../storage/storage.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface FeedResponse {
  items: PostResponse[];
  nextCursor: string | null;
}

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly storage: StorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('following')
  @HttpCode(HttpStatus.OK)
  async following(
    @Query() query: FeedQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeedResponse> {
    const page = await this.feed.following(user.id, query);
    return {
      items: await mapPostsToResponse(page.items, this.storage),
      nextCursor: page.nextCursor,
    };
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('discover')
  @HttpCode(HttpStatus.OK)
  async discover(
    @Query() query: FeedQueryDto,
    @OptionalCurrentUser() user: AuthenticatedUser | null,
  ): Promise<FeedResponse> {
    const page = await this.feed.discover(user?.id, query);
    return {
      items: await mapPostsToResponse(page.items, this.storage),
      nextCursor: page.nextCursor,
    };
  }
}
