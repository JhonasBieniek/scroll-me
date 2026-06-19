import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post as HttpPost,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { StorageService } from '../storage/storage.service';
import { CreatePostDto } from './dto/create-post.dto';
import { MulterExceptionFilter } from './multer-exception.filter';
import { mapPostToResponse, PostResponse } from './post-response.mapper';
import { PostsService } from './posts.service';
import { buildMulterOptions } from './upload.config';
import { UploadService } from './upload.service';

interface ManifestResponse {
  playlist: string;
  expiresIn: number;
}

interface ThumbnailResponse {
  url: string;
  expiresIn: number;
}

@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  private readonly logger = new Logger(PostsController.name);

  constructor(
    private readonly uploads: UploadService,
    private readonly posts: PostsService,
    private readonly storage: StorageService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpPost('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(FileInterceptor('video', buildMulterOptions()))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreatePostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PostResponse> {
    if (!file) {
      throw new BadRequestException(
        'Arquivo de vídeo (campo "video") obrigatório.',
      );
    }

    this.logger.log(
      `Upload recebido de ${user.id}: ${file.originalname} (${file.size} bytes)`,
    );

    const post = await this.uploads.process({
      file: {
        path: file.path,
        originalname: file.originalname,
        size: file.size,
      },
      userId: user.id,
      caption: dto.caption,
    });

    const withMeta = await this.posts.getWithMeta(post.id);
    if (!withMeta) {
      throw new NotFoundException('Post não encontrado.');
    }
    return mapPostToResponse(withMeta, this.storage);
  }

  @Get(':id/manifest')
  @HttpCode(HttpStatus.OK)
  async manifest(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManifestResponse> {
    const post = await this.posts.getOrFail(id);
    const playlist = await this.storage.getSignedHlsPlaylist(
      post.videoManifestUrl,
    );
    return { playlist, expiresIn: this.storage.presignTtlSeconds };
  }

  @Get(':id/thumbnail')
  @HttpCode(HttpStatus.OK)
  async thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ThumbnailResponse> {
    const post = await this.posts.getOrFail(id);
    if (!post.thumbnailKey) {
      throw new BadRequestException('Thumbnail indisponível.');
    }
    const url = await this.storage.getPresignedUrl(post.thumbnailKey);
    return { url, expiresIn: this.storage.presignTtlSeconds };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.posts.deleteOwned(id, user.id);
  }
}
