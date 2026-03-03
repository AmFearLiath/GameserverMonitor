export type LogContext = {
  request_id?: string;
  server_id?: string;
  job_id?: string;
  incident_id?: string;
  alert_event_id?: string;
};

type LogLevel = 'info' | 'warn' | 'error';

type LogPayload = {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context: LogContext;
  data?: Record<string, unknown>;
};

const ensureContext = (context: LogContext): void => {
  if (!context.request_id && !context.server_id && !context.job_id) {
    throw new Error('Logger context requires request_id or server_id or job_id');
  }
};

const emit = (payload: LogPayload): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export const createLogger = (component: string) => {
  const write = (level: LogLevel, message: string, context: LogContext, data?: Record<string, unknown>): void => {
    ensureContext(context);
    emit({
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      context,
      data
    });
  };

  return {
    info: (message: string, context: LogContext, data?: Record<string, unknown>): void => {
      write('info', message, context, data);
    },
    warn: (message: string, context: LogContext, data?: Record<string, unknown>): void => {
      write('warn', message, context, data);
    },
    error: (message: string, context: LogContext, data?: Record<string, unknown>): void => {
      write('error', message, context, data);
    }
  };
};
