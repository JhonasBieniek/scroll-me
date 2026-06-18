import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
    jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('conecta ao PostgreSQL no onModuleInit', async () => {
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('desconecta no onModuleDestroy', async () => {
    const disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('propaga falha de conexão no boot', async () => {
    jest.spyOn(service, '$connect').mockRejectedValue(new Error('db down'));

    await expect(service.onModuleInit()).rejects.toThrow('db down');
  });
});
