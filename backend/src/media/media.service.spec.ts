import ffmpeg from 'fluent-ffmpeg';
import {
  HLS_MANIFEST_NAME,
  MAX_VIDEO_HEIGHT,
  MediaService,
  toFfmpegPath,
} from './media.service';

interface MockCommand {
  outputOptions: jest.Mock;
  output: jest.Mock;
  on: jest.Mock;
  run: jest.Mock;
}

jest.mock('fluent-ffmpeg', () => {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  const command: MockCommand = {
    outputOptions: jest.fn(() => command),
    output: jest.fn(() => command),
    on: jest.fn((event: string, cb: (arg?: unknown) => void) => {
      handlers[event] = cb;
      return command;
    }),
    run: jest.fn(),
  };
  const factory = jest.fn(() => command);
  return {
    __esModule: true,
    default: Object.assign(factory, {
      __command: command,
      __handlers: handlers,
    }),
  };
});

type FfmpegMock = jest.Mock & {
  __command: MockCommand;
  __handlers: Record<string, (arg?: unknown) => void>;
};

const ffmpegMock = ffmpeg as unknown as FfmpegMock;

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaService();
  });

  it('configura HLS (segmentos de 4s, H.264/AAC)', async () => {
    ffmpegMock.__command.run.mockImplementation(() => {
      ffmpegMock.__handlers.end();
    });

    const result = await service.transcodeToHls('/tmp/in.mp4', '/tmp/out');

    expect(ffmpegMock).toHaveBeenCalledWith('/tmp/in.mp4');
    expect(result.manifestPath).toContain(HLS_MANIFEST_NAME);
    const calls = ffmpegMock.__command.outputOptions.mock.calls as [string[]][];
    const hlsOptions = calls[1][0];
    expect(hlsOptions).toContain('-c:v libx264');
    expect(hlsOptions).toContain('-pix_fmt yuv420p');
    expect(hlsOptions).toContain('-hls_time 4');
    expect(hlsOptions).toContain(`-vf scale=-2:min(${MAX_VIDEO_HEIGHT}\\,ih)`);
  });

  it('rejeita quando o ffmpeg emite erro', async () => {
    ffmpegMock.__command.run.mockImplementation(() => {
      ffmpegMock.__handlers.error(new Error('boom'));
    });

    await expect(
      service.transcodeToHls('/tmp/in.mp4', '/tmp/out'),
    ).rejects.toThrow('boom');
  });

  it('normaliza barras invertidas em caminhos do ffmpeg (Windows)', () => {
    expect(toFfmpegPath(String.raw`\tmp\uploads\job\hls\seg_%03d.ts`)).toBe(
      '/tmp/uploads/job/hls/seg_%03d.ts',
    );
  });
});
