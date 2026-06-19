import { join } from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { Injectable, Logger } from '@nestjs/common';

export const HLS_MANIFEST_NAME = 'index.m3u8';
const HLS_SEGMENT_SECONDS = 4;
export const MAX_VIDEO_HEIGHT = 1080;

/** FFmpeg no Windows interpreta `\t` em caminhos como TAB — use barras `/`. */
export function toFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export interface HlsResult {
  manifestPath: string;
  thumbnailPath: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  async transcodeToHls(
    inputPath: string,
    outputDir: string,
  ): Promise<HlsResult> {
    const manifestPath = toFfmpegPath(join(outputDir, HLS_MANIFEST_NAME));
    const thumbnailPath = toFfmpegPath(join(outputDir, 'thumb.jpg'));
    const segmentPattern = toFfmpegPath(join(outputDir, 'seg_%03d.ts'));

    await this.extractThumbnail(inputPath, thumbnailPath);
    await this.runHlsTranscode(inputPath, manifestPath, segmentPattern);

    this.logger.log(`HLS + thumbnail gerados em ${outputDir}.`);
    return { manifestPath, thumbnailPath };
  }

  private extractThumbnail(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-ss 1', '-vframes 1', '-vf scale=360:-2', '-q:v 4'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          this.logger.error(`Falha no thumbnail: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  private runHlsTranscode(
    inputPath: string,
    manifestPath: string,
    segmentPattern: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-profile:v main',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          `-vf scale=-2:min(${MAX_VIDEO_HEIGHT}\\,ih)`,
          `-hls_time ${HLS_SEGMENT_SECONDS}`,
          '-hls_list_size 0',
          '-hls_playlist_type vod',
          '-hls_flags independent_segments',
          `-hls_segment_filename ${segmentPattern}`,
          '-f hls',
        ])
        .output(manifestPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => {
          this.logger.error(`Falha no ffmpeg: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }
}
