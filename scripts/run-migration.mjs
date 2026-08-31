/**
 * Run Supabase migration via Supabase client (exec_sql RPC) or PostgreSQL.
 * Uses the migration file in supabase/migrations/
 * 
 * Run: node scripts/run-migration.mjs
 * 
 * Prerequisites - use ONE of:
 * 1. SUPABASE_SERVICE_ROLE_KEY - Uses exec_sql RPC if available (no DB password needed)
 * 2. DATABASE_URL - Direct PostgreSQL connection (from Supabase Dashboard > Settings > Database)
 * 3. SUPABASE_DB_PASSWORD - Database password + NEXT_PUBLIC_SUPABASE_URL
 */

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env.local');
    const altPath = path.join(__dirname, '..', '.env');
    const p = fs.existsSync(envPath) ? envPath : fs.existsSync(altPath) ? altPath : null;
    if (!p) return {};
    return Object.fromEntries(
        fs.readFileSync(p, 'utf-8').split('\n')
            .filter(l => /^[A-Z_]+=/.test(l.trim()))
            .map(l => {
                const eq = l.indexOf('=');
                return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
            })
    );
}

const env = { ...process.env, ...loadEnv() };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = SUPABASE_URL?.match(/([a-zA-Z0-9]{20,})\.supabase\.co/)?.[1];

// Connection options
let connectionString = env.DATABASE_URL;
let directConnection = null;
if (!connectionString && env.SUPABASE_DB_PASSWORD && PROJECT_REF) {
    const pw = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
    connectionString = `postgresql://postgres.${PROJECT_REF}:${pw}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
    directConnection = `postgresql://postgres:${pw}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
}

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260209000000_complete_schema.sql');

if (!fs.existsSync(migrationPath)) {
    console.error('ERROR: Migration file not found:', migrationPath);
    process.exit(1);
}

async function runViaSupabaseRpc() {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) throw error;
    return data;
}

async function tryConnect(connStr, label) {
    console.log(`\nTrying ${label}...`);
    const client = new pg.Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });
    try {
        await client.connect();
        console.log(`Connected via ${label}!`);
        return client;
    } catch (err) {
        console.log(`${label} failed: ${err.message}`);
        return null;
    }
}

async function main() {
    const projectRef = PROJECT_REF || connectionString?.match(/postgres\.([a-zA-Z0-9]+)|db\.([a-zA-Z0-9]+)\.supabase/)?.[1] || 'project';
    console.log('=== Supabase Migration ===');
    console.log(`Project: ${projectRef}`);
    console.log(`Migration: 20260209000000_complete_schema.sql\n`);

    // Try exec_sql RPC first if we have service key (no DB password needed)
    if (SUPABASE_URL && SERVICE_KEY && !connectionString) {
        console.log('Trying Supabase exec_sql RPC...');
        try {
            await runViaSupabaseRpc();
            console.log('\nMigration completed successfully via exec_sql RPC!');
            return;
        } catch (err) {
            if (err.message?.includes('exec_sql') || err.message?.includes('does not exist')) {
                console.log('exec_sql RPC not available, need DATABASE_URL or SUPABASE_DB_PASSWORD.');
            } else {
                console.error('RPC failed:', err.message);
            }
        }
    }

    // Try PostgreSQL connection
    let client = connectionString ? await tryConnect(connectionString, 'Connection') : null;
    if (!client && directConnection) {
        client = await tryConnect(directConnection, 'Direct connection (port 5432)');
    }

    if (!client) {
        console.error('\nERROR: Could not connect. Add to .env.local:');
        console.error('  DATABASE_URL or SUPABASE_DB_PASSWORD (from Supabase > Settings > Database)');
        console.error('\nOr run manually in SQL Editor:');
        console.error(`https://supabase.com/dashboard/project/${projectRef}/sql/new`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');
    try {
        console.log('Executing migration...');
        await client.query(sql);
        console.log('\nMigration completed successfully!');
    } catch (err) {
        console.error('\nMigration failed:', err.message);
        if (err.message?.includes('already exists')) {
            console.error('\nThe schema may already exist.');
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
