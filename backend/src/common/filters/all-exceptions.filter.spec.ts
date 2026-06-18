import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function buildHost(
  response: CapturedResponse,
  request: { method: string; url: string } = { method: 'GET', url: '/x' },
): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: CapturedResponse;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    const json = jest.fn();
    response = {
      json,
      status: jest.fn().mockReturnValue({ json }),
    };
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('mapeia ThrottlerException para 429 com mensagem genérica', () => {
    filter.catch(new ThrottlerException(), buildHost(response));

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Muitas tentativas. Tente novamente em instantes.',
      error: 'Too Many Requests',
    });
  });

  it('preserva status e mensagem de um HttpException intencional', () => {
    filter.catch(
      new BadRequestException('Campo inválido.'),
      buildHost(response),
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Campo inválido.',
      }),
    );
  });

  it('une mensagens de validação (array) em uma única string', () => {
    filter.catch(
      new BadRequestException(['email inválido', 'senha curta']),
      buildHost(response),
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'email inválido, senha curta',
      }),
    );
  });

  it('esconde o detalhe interno de erros não-HTTP em produção', () => {
    process.env.NODE_ENV = 'production';

    filter.catch(new Error('detalhe sensível do banco'), buildHost(response));

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor.',
      error: 'Internal Server Error',
    });
  });

  it('expõe a mensagem real de erros não-HTTP fora de produção', () => {
    process.env.NODE_ENV = 'development';

    filter.catch(new Error('boom dev'), buildHost(response));

    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'boom dev',
      error: 'Internal Server Error',
    });
  });

  it('registra 5xx no logger de erro (com detalhe server-side)', () => {
    const errorSpy = jest.spyOn(filter['logger'], 'error');
    process.env.NODE_ENV = 'production';

    filter.catch(new Error('stack interno'), buildHost(response));

    expect(errorSpy).toHaveBeenCalled();
  });
});
