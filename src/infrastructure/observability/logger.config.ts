import { randomUUID } from 'node:crypto';
import { Params } from 'nestjs-pino';

export const pinoLoggerConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: (req) => (req.headers['x-correlation-id'] as string) ?? randomUUID(),
    customProps: (req) => ({
      correlationId: req.id,
    }),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.money',
        'req.body.initialBalance',
        'res.body.balance',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  },
};