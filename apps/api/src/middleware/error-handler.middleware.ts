import type { NextFunction, Request, Response } from 'express';
import { apiErrorMessageKeyByCode } from '@gm/shared';

type ApiError = {
  code?: string;
  details?: unknown;
  status?: number;
  message?: string;
};

export const errorHandlerMiddleware = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  void _next;
  const code = error.code ?? 'API_INTERNAL_ERROR';
  const status = error.status ?? 500;
  const messageKey = apiErrorMessageKeyByCode[code] ?? 'error.api_internal_error';

  res.status(status).json({
    error: {
      code,
      message_key: messageKey,
      message_params: {},
      message: error.message,
      details: error.details ?? null,
      request_id: req.requestId
    }
  });
};
