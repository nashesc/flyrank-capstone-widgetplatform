export async function up(pgm) {
   pgm.createTable('tenants', {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      supabase_user_id: { type: 'text', notNull: true, unique: true },
      name: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
   })

   pgm.createTable('widgets', {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      tenant_id: { type: 'uuid', notNull: true, references: '"tenants"(id)', onDelete: 'CASCADE' },
      type: { type: 'text', notNull: true },
      title: { type: 'text', notNull: true },
      description: { type: 'text' },
      fields: { type: 'jsonb', notNull: true, default: '[]' },
      button_text: { type: 'text', notNull: true, default: 'Submit' },
      display_options: { type: 'jsonb', notNull: true, default: '{}' },
      config_version: { type: 'integer', notNull: true, default: 1 },
      deleted_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
   });
   pgm.createIndex('widgets', 'tenant_id')

   pgm.createTable('submissions', {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      widget_id: { type: 'uuid', notNull: true, references: '"widgets"(id)', onDelete: 'RESTRICT' },
      tenant_id: { type: 'uuid', notNull: true, references: '"tenants"(id)', onDelete: 'CASCADE' },
      payload: { type: 'jsonb', notNull: true },
      idempotency_key: { type: 'text', notNull: true },
      ip: { type: 'text' },
      geo_country: { type: 'text' },
      geo_city: { type: 'text' },
      geo_provider_used: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
   });
   pgm.addConstraint('submissions', 'submissions_widget_idempotency_unique', 'UNIQUE (widget_id, idempotency_key)');
   pgm.createIndex('submissions', 'widget_id');
   pgm.createIndex('submissions', 'tenant_id');
   pgm.createIndex('submissions', 'created_at');

   pgm.createTable('side_effect_log', {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      submission_id: { type: 'uuid', references: '"submissions"(id)', onDelete: 'CASCADE' },
      kind: { type: 'text', notNull: true },
      status: { type: 'text', notNull: true },
      error: { type: 'text' },
      attempted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
   });
   pgm.createIndex('side_effect_log', 'submission_id');
}

export async function down(pgm) {
   pgm.dropTable('side_effect_log', { ifExists: true, cascade: true });
   pgm.dropTable('submissions', { ifExists: true, cascade: true });
   pgm.dropTable('widgets', { ifExists: true, cascade: true });
   pgm.dropTable('tenants', { ifExists: true, cascade: true });
}
