import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { UploadService } from './upload.service';

@Module({
  imports: [MediaModule, StorageModule],
  controllers: [PostsController],
  providers: [PostsService, UploadService],
  exports: [PostsService],
})
export class PostsModule {}
