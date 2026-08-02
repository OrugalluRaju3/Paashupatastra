import "reflect-metadata";
import path from "node:path";
import { config } from "dotenv";
import { closeDataSource, getDataSource } from "@paashupatastra/database";

config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const ds = await getDataSource();
  const rows = await ds.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT LIKE 'pg_%'
     ORDER BY tablename`,
  );
  const tables = rows.map((r) => String(r.tablename));
  console.log("Tables:", tables.join(", ") || "(none)");

  if (tables.length > 0) {
    const list = tables.map((t) => `"${t}"`).join(", ");
    await ds.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    console.log(`Cleared ${tables.length} tables.`);
  }

  for (const t of tables) {
    const [{ count }] = await ds.query(`SELECT COUNT(*)::int AS count FROM "${t}"`);
    console.log(`${t}: ${count}`);
  }

  await closeDataSource();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closeDataSource();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
