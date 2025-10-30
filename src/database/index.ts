/**
 * Database connection and setup
 */

import { DataSource } from 'typeorm';
import { config } from '../config';
import { databaseLogger } from '../utils/logger';

// TypeORM Data Source configuration
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.user,
  password: config.database.password,
  database: config.database.name,
  ssl: config.database.ssl,
  logging: config.database.logging,
  synchronize: false, // Never use synchronize in production
  entities: [`${__dirname}/entities/**/*.{ts,js}`],
  migrations: [`${__dirname}/migrations/**/*.{ts,js}`],
  subscribers: [],
  extra: {
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
});

export async function initializeDatabase(): Promise<void> {
  try {
    databaseLogger.info('Connecting to PostgreSQL database...');
    await AppDataSource.initialize();
    databaseLogger.info('Database connection established successfully');

    // Run pending migrations
    const pendingMigrations = await AppDataSource.showMigrations();
    if (pendingMigrations) {
      databaseLogger.info('Running pending migrations...');
      await AppDataSource.runMigrations();
      databaseLogger.info('Migrations completed successfully');
    }
  } catch (error) {
    databaseLogger.error('Failed to initialize database:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      databaseLogger.info('Database connection closed');
    }
  } catch (error) {
    databaseLogger.error('Error closing database connection:', error);
    throw error;
  }
}

export default AppDataSource;
