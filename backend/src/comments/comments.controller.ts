import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { StorageService } from '../storage/storage.service';
import {
  CommentResponse,
  mapCommentToResponse,
  mapCommentsToResponse,
} from './comment-response.mapper';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';

interface CommentsListResponse {
  items: CommentResponse[];
  nextCursor: string | null;
}

@Controller()
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly storage: StorageService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('posts/:postId/comments')
  @HttpCode(HttpStatus.OK)
  async listByPost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query() query: ListCommentsQueryDto,
  ): Promise<CommentsListResponse> {
    const page = await this.comments.listByPost({
      postId,
      cursor: query.cursor,
      take: query.take,
    });
    return {
      items: await mapCommentsToResponse(page.items, this.storage),
      nextCursor: page.nextCursor,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('posts/:postId/comments')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommentResponse> {
    const comment = await this.comments.create(postId, user.id, dto.body);
    return mapCommentToResponse(comment, this.storage);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.comments.deleteOwned(id, user.id);
  }
}
