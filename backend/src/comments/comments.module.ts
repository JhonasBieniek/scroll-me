import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { StorageModule } from '../storage/storage.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [PostsModule, StorageModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
