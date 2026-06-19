import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { StorageModule } from '../storage/storage.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [PostsModule, StorageModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
