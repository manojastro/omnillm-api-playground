import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const providerProfiles = sqliteTable(
  'provider_profiles',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    providerId: text('provider_id').notNull(),
    configJson: text('config_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_provider_profiles_owner_updated').on(table.ownerId, table.updatedAt)],
);

export const requestHistory = sqliteTable(
  'request_history',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    conversationId: text('conversation_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    messagesJson: text('messages_json').notNull(),
    responseText: text('response_text').notNull(),
    statusCode: integer('status_code').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    usageJson: text('usage_json'),
    requestJson: text('request_json'),
    responseJson: text('response_json'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_request_history_owner_created').on(table.ownerId, table.createdAt),
    index('idx_request_history_owner_provider').on(table.ownerId, table.provider),
  ],
);

export const rateLimits = sqliteTable('rate_limits', {
  bucketKey: text('bucket_key').primaryKey(),
  count: integer('count').notNull().default(1),
  expiresAt: integer('expires_at').notNull(),
});

