export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function getLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

const CURRENT_LEVEL = getLevel();

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[CURRENT_LEVEL];
}

export const log = {
  debug: (msg: string, meta?: unknown) => {
    if (!shouldLog('debug')) return;
    // eslint-disable-next-line no-console
    console.log(`[debug] ${msg}`, meta ?? '');
  },
  info: (msg: string, meta?: unknown) => {
    if (!shouldLog('info')) return;
    // eslint-disable-next-line no-console
    console.log(`[info] ${msg}`, meta ?? '');
  },
  warn: (msg: string, meta?: unknown) => {
    if (!shouldLog('warn')) return;
    // eslint-disable-next-line no-console
    console.warn(`[warn] ${msg}`, meta ?? '');
  },
  error: (msg: string, meta?: unknown) => {
    if (!shouldLog('error')) return;
    // eslint-disable-next-line no-console
    console.error(`[error] ${msg}`, meta ?? '');
  }
};
