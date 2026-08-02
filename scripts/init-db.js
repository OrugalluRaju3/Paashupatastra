/**
 * Creates role + database for local Postgres.
 * Usage:
 *   $env:PGPASSWORD="your_password"; npm run db:init
 */
const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function canConnect(url) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return true;
  } catch {
    try {
      await client.end();
    } catch {
      // ignore
    }
    return false;
  }
}

async function bootstrapWithSuperuser() {
  const password = process.env.PGPASSWORD;
  if (!password) {
    throw new Error(
      'Set PGPASSWORD to your Postgres superuser password and run: npm run db:init',
    );
  }

  const admin = new Client({
    host: "localhost",
    port: 5432,
    user: process.env.PGUSER || "postgres",
    password,
    database: "postgres",
  });
  await admin.connect();

  // Refresh collation versions to avoid template mismatch warnings/errors
  try {
    await admin.query(`ALTER DATABASE postgres REFRESH COLLATION VERSION`);
  } catch {
    // ignore if not supported / not needed
  }
  try {
    await admin.query(`ALTER DATABASE template1 REFRESH COLLATION VERSION`);
  } catch {
    // ignore
  }

  await admin.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'paashupatastra') THEN
        CREATE ROLE paashupatastra LOGIN PASSWORD 'paashupatastra';
      END IF;
    END
    $$;
  `);

  const exists = await admin.query(
    `SELECT 1 FROM pg_database WHERE datname = 'paashupatastra'`,
  );
  if (exists.rowCount === 0) {
    // template0 avoids collation-version mismatch copied from template1
    await admin.query(
      `CREATE DATABASE paashupatastra OWNER paashupatastra TEMPLATE template0 ENCODING 'UTF8'`,
    );
  }

  await admin.query(`GRANT ALL PRIVILEGES ON DATABASE paashupatastra TO paashupatastra`);
  await admin.end();

  // Grant schema privileges inside the new database
  const appDb = new Client({
    host: "localhost",
    port: 5432,
    user: process.env.PGUSER || "postgres",
    password,
    database: "paashupatastra",
  });
  await appDb.connect();
  await appDb.query(`GRANT ALL ON SCHEMA public TO paashupatastra`);
  await appDb.query(`ALTER SCHEMA public OWNER TO paashupatastra`);
  await appDb.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await appDb.end();
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing in .env");

  if (await canConnect(url)) {
    console.log("DATABASE_URL connection OK.");
    return;
  }

  console.log("DATABASE_URL not ready. Bootstrapping role/database…");
  await bootstrapWithSuperuser();

  if (!(await canConnect(url))) {
    throw new Error("Bootstrap finished but DATABASE_URL still cannot connect.");
  }
  console.log("Database ready:", url.replace(/:[^:@/]+@/, ":***@"));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
