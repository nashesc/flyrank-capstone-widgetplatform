import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pool from './pool.js';

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'evaluator@flyrank.test';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Flyrank-Eval-2026!';

function requireSeedEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'].filter(
    (varName) => !process.env[varName]
  );
  if (!SEED_EMAIL || !SEED_PASSWORD) missing.push('SEED_EMAIL/SEED_PASSWORD');
  if (missing.length > 0) {
    console.error(`seed missing required env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function findSeedUserId(supabaseAdmin, seedEmail) {
  const { data: listedUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) throw listError;
  return listedUsers.users.find((seedUser) => seedUser.email === seedEmail)?.id ?? null;
}

async function ensureSeedAuthUser(supabaseAdmin, seedEmail, seedPassword) {
  const { data: createdUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email: seedEmail,
      password: seedPassword,
      email_confirm: true,
      user_metadata: { seeded_by: 'flyrank-capstone' },
    });
  if (!createError) return createdUser.user.id;
  const alreadyRegistered =
    createError.message?.toLowerCase().includes('already been registered') ||
    createError.message?.toLowerCase().includes('already exists');
  if (!alreadyRegistered) throw createError;
  const existingUserId = await findSeedUserId(supabaseAdmin, seedEmail);
  if (!existingUserId) {
    throw new Error(`seed user exists in Auth but could not be listed: ${seedEmail}`);
  }
  return existingUserId;
}

async function ensureSeedDemoWidget(tenantId) {
  const existingWidget = await pool.query(
    `SELECT id FROM widgets WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  if (existingWidget.rows.length > 0) return { widgetId: existingWidget.rows[0].id, created: false };
  const insertedWidget = await pool.query(
    `INSERT INTO widgets (tenant_id, type, title, description, fields, button_text, display_options)
     VALUES ($1,'signup','Seeded Newsletter','Demo widget created by seed.',
       $2,'Subscribe',$3) RETURNING id`,
    [
      tenantId,
      JSON.stringify([{ name: 'email', type: 'email', label: 'Email', required: true }]),
      JSON.stringify({}),
    ]
  );
  return { widgetId: insertedWidget.rows[0].id, created: true };
}

async function runSeed() {
  requireSeedEnv();
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const seedUserId = await ensureSeedAuthUser(supabaseAdmin, SEED_EMAIL, SEED_PASSWORD);
  const upsertedTenant = await pool.query(
    `INSERT INTO tenants (supabase_user_id, name) VALUES ($1,$2)
     ON CONFLICT (supabase_user_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [seedUserId, SEED_EMAIL]
  );
  const tenantId = upsertedTenant.rows[0].id;
  const { widgetId, created: widgetCreated } = await ensureSeedDemoWidget(tenantId);
  console.log(`seed ok email=${SEED_EMAIL} tenant_id=${tenantId} demo_widget_id=${widgetId} widget_created=${widgetCreated}`);
  await pool.end();
}

runSeed().catch(async (seedError) => {
  console.error(`seed failed: ${seedError.message}`);
  await pool.end();
  process.exit(1);
});
