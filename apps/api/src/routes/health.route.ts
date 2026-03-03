import { Router, type Router as RouterType } from 'express';

export const healthRoute: RouterType = Router();

healthRoute.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    time: new Date().toISOString()
  });
});
