import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'node:path';
import { safeRmUnderRoot } from '../common/safe-path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { FeedQueryDto } from '../feed/dto/feed-query.dto';
import {
  mapPostsToResponse,
  PostResponse,
} from '../posts/post-response.mapper';
import { PostsService } from '../posts/posts.service';
import { resolveUploadTmpDir } from '../posts/upload.config';
import { StorageService } from '../storage/storage.service';
import { buildAvatarMulterOptions } from './avatar.config';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

export interface ProfileResponse {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  counts: { posts: number; followers: number; following: number };
  isMe: boolean;
  isFollowing: boolean;
}

interface UserPostsResponse {
  items: PostResponse[];
  nextCursor: string | null;
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly posts: PostsService,
    private readonly storage: StorageService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    const profile = await this.users.getByIdOrFail(user.id);
    return this.toProfile(profile, user.id, true, false);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const updated = await this.users.updateProfile(user.id, {
      displayName: dto.displayName,
      bio: dto.bio,
      username: dto.username,
    });
    return this.toProfile(updated, user.id, true, false);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', buildAvatarMulterOptions()))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProfileResponse> {
    if (!file) {
      throw new BadRequestException('Imagem (campo "avatar") obrigatória.');
    }

    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `avatars/${user.id}${ext}`;

    try {
      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
      await this.storage.uploadFile(file.path, key, contentType);

      const profile = await this.users.getByIdOrFail(user.id);
      if (profile.avatarKey && profile.avatarKey !== key) {
        await this.storage
          .deleteObject(profile.avatarKey)
          .catch(() => undefined);
      }
      const updated = await this.users.updateProfile(user.id, {
        avatarKey: key,
      });
      return this.toProfile(updated, user.id, true, false);
    } finally {
      const tmpRoot = resolveUploadTmpDir(process.env.UPLOAD_TMP_DIR);
      await safeRmUnderRoot(tmpRoot, file.filename, { force: true });
    }
  }

  @Get(':username')
  async getProfile(
    @Param('username') username: string,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<ProfileResponse> {
    const profile = await this.users.getByUsernameOrFail(username);
    const isMe = profile.id === viewer.id;
    const isFollowing = isMe
      ? false
      : await this.users.isFollowing(viewer.id, profile.id);
    return this.toProfile(profile, viewer.id, isMe, isFollowing);
  }

  @Get(':username/posts')
  async userPosts(
    @Param('username') username: string,
    @Query() query: FeedQueryDto,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<UserPostsResponse> {
    const profile = await this.users.getByUsernameOrFail(username);
    const page = await this.posts.list(
      {
        cursor: query.cursor,
        take: query.take,
        userId: profile.id,
      },
      viewer.id,
    );
    return {
      items: await mapPostsToResponse(page.items, this.storage),
      nextCursor: page.nextCursor,
    };
  }

  @Post(':username/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(
    @Param('username') username: string,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<void> {
    const target = await this.users.getByUsernameOrFail(username);
    await this.users.follow(viewer.id, target.id);
  }

  @Delete(':username/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollow(
    @Param('username') username: string,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<void> {
    const target = await this.users.getByUsernameOrFail(username);
    await this.users.unfollow(viewer.id, target.id);
  }

  private async toProfile(
    user: {
      id: string;
      username: string;
      displayName: string;
      bio: string | null;
      avatarKey: string | null;
    },
    viewerId: string,
    isMe: boolean,
    isFollowing: boolean,
  ): Promise<ProfileResponse> {
    void viewerId;
    const counts = await this.users.getCounts(user.id);
    const avatarUrl = user.avatarKey
      ? await this.storage.getPresignedUrl(user.avatarKey)
      : null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl,
      counts,
      isMe,
      isFollowing,
    };
  }
}
