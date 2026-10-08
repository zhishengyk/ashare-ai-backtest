import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const datasets=sqliteTable('datasets',{id:text('id').primaryKey(),created:text('created').notNull(),payload:text('payload').notNull()});
export const runs=sqliteTable('runs',{id:text('id').primaryKey(),datasetId:text('dataset_id').notNull(),version:integer('version').notNull().default(0),created:text('created').notNull(),updated:text('updated').notNull(),payload:text('payload').notNull()});
export const fetchLogs=sqliteTable('fetch_logs',{id:text('id').primaryKey(),created:text('created').notNull(),payload:text('payload').notNull()});
export const settings=sqliteTable('settings',{id:text('id').primaryKey(),payload:text('payload').notNull()});
export const attempts=sqliteTable('model_attempts',{id:text('id').primaryKey(),runId:text('run_id').notNull(),reserved:text('reserved').notNull(),status:text('status').notNull(),payload:text('payload').notNull()});
