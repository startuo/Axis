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
  const jwtSecret = requireValue(environment, 'JWT_SECRET');
  if (
    Buffer.byteLength(jwtSecret.trim(), 'utf8') < 32 ||
    /please.change.me|change.?me|replace.?me|your.?secret|example|development.?secret/i.test(
      jwtSecret,
    )
  ) {
    throw new Error(
      'JWT_SECRET must be a non-placeholder secret of at least 32 bytes',
    );
  }
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
  if (
    !Number.isFinite(Number(onlineVisitorTtlSeconds)) ||
    Number(onlineVisitorTtlSeconds) < 10 ||
    Number(onlineVisitorTtlSeconds) > 300
  ) {
    throw new Error('ONLINE_VISITOR_TTL_SECONDS must be between 10 and 300');
  }
  if (
    !Number.isFinite(Number(dashboardPushInterval)) ||
    Number(dashboardPushInterval) < 1000
  ) {
    throw new Error('DASHBOARD_PUSH_INTERVAL_MS must be at least 1000');
  }

  return {
    NODE_ENV: environment.NODE_ENV ?? 'development',
    PORT: port,
    API_PREFIX: environment.API_PREFIX ?? 'api/v1',
    CORS_ORIGIN: environment.CORS_ORIGIN ?? 'http://localhost:4321',
    DATABASE_URL: requireValue(environment, 'DATABASE_URL'),
    REDIS_URL: requireValue(environment, 'REDIS_URL'),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: environment.JWT_EXPIRES_IN ?? '7d',
    DASHBOARD_PUSH_INTERVAL_MS: dashboardPushInterval,
    ONLINE_VISITOR_TTL_SECONDS: onlineVisitorTtlSeconds,
    ARTICLE_VIEW_FLUSH_INTERVAL_MS: articleViewFlushInterval,
  };
}
