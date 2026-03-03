import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@gm/config';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware.js';
import { healthRoute } from './routes/health.route.js';
import { serversRoute } from './routes/servers.route.js';
import { authRoute } from './routes/auth.route.js';
import { domainRoute } from './routes/domain.route.js';
import { createLogger } from '@gm/logger';

const logger = createLogger('api');

export const createApp = (): Express => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts:
        config.NODE_ENV === 'production'
          ? {
              maxAge: 31536000,
              includeSubDomains: true,
              preload: true
            }
          : false
    })
  );
  app.use(
    cors({
      origin: config.WEB_BASE_URL,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(requestIdMiddleware);

  app.use('/api/v1', healthRoute);
  app.use('/api/v1', authRoute);
  app.use('/api/v1', serversRoute);
  app.use('/api/v1', domainRoute);

  app.use((req, _res, next) => {
    logger.info('request processed', { request_id: req.requestId }, { method: req.method, path: req.path });
    next();
  });

  app.use(errorHandlerMiddleware);
  return app;
};
