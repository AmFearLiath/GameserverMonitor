import { config } from '@gm/config';
import { createLogger } from '@gm/logger';
import { createApp } from './app.js';
import { randomUUID } from 'node:crypto';

const app = createApp();
const logger = createLogger('api-bootstrap');

app.listen(config.API_PORT, () => {
  logger.info('api started', { request_id: randomUUID() }, { port: config.API_PORT });
});
