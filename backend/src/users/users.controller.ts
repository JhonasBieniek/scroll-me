import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { StorageService } from '../storage/storage.service';
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

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    const profile = await this.users.getByIdOrFail(user.id);
    return this.toProfile(profile, user.id, true, false);
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
