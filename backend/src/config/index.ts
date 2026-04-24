export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  databaseUrl: process.env.DATABASE_URL || 'guarddog.db',
  sovereignStoragePath:
    process.env.SOVEREIGN_STORAGE_PATH || './storage/guarddog',
};

export type AppConfig = typeof config;
