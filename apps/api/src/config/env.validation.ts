export interface AppEnvironment {
  NODE_ENV: string;
  PORT: string;
  API_PREFIX: string;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  DASHBOARD_PUSH_INTERVAL_MS: string;
  ONLINE_VISITOR_TTL_SECONDS: string;
  ARTICLE_VIEW_FLUSH_INTERVAL_MS: string;
}

type EnvironmentVariables = Partial<AppEnvironment> &
  Record<string, string | undefined>;

function requireValue(
  environment: EnvironmentVariables,
  key: keyof EnvironmentVariables,
): string {
  const value = environment[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function validateEnvironment(environment: EnvironmentVariables) {
  const port = environment.PORT ?? '3001';
  const dashboardPushInterval =
    environment.DASHBOARD_PUSH_INTERVAL_MS ?? '5000';
  const onlineVisitorTtlSeconds =
    environment.ONLINE_VISITOR_TTL_SECONDS ?? '30';
  const articleViewFlushInterval =
    environment.ARTICLE_VIEW_FLUSH_INTERVAL_MS ?? '5000';

  if (Number.isNaN(Number(port))) {
    throw new Error('PORT must be a valid number');
  }

  if (Number.isNaN(Number(dashboardPushInterval))) {
    throw new Error('DASHBOARD_PUSH_INTERVAL_MS must be a valid number');
  }

  if (Number.isNaN(Number(onlineVisitorTtlSeconds))) {
    throw new Error('ONLINE_VISITOR_TTL_SECONDS must be a valid number');
  }

  if (Number.isNaN(Number(articleViewFlushInterval))) {
    throw new Error('ARTICLE_VIEW_FLUSH_INTERVAL_MS must be a valid number');
  }

  return {
    NODE_ENV: environment.NODE_ENV ?? 'development',
    PORT: port,
    API_PREFIX: environment.API_PREFIX ?? 'api/v1',
    CORS_ORIGIN: environment.CORS_ORIGIN ?? 'http://localhost:4321',
    DATABASE_URL: requireValue(environment, 'DATABASE_URL'),
    REDIS_URL: requireValue(environment, 'REDIS_URL'),
    JWT_SECRET: environment.JWT_SECRET ?? 'please-change-me',
    JWT_EXPIRES_IN: environment.JWT_EXPIRES_IN ?? '7d',
    DASHBOARD_PUSH_INTERVAL_MS: dashboardPushInterval,
    ONLINE_VISITOR_TTL_SECONDS: onlineVisitorTtlSeconds,
    ARTICLE_VIEW_FLUSH_INTERVAL_MS: articleViewFlushInterval,
  };
}
