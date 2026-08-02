import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getDataSource, closeDataSource } from "./data-source";

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(__dirname, "../../../.env"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }
}

async function main() {
  loadEnv();
  process.env.TYPEORM_SYNC = process.env.TYPEORM_SYNC ?? "true";
  const ds = await getDataSource();
  console.log("TypeORM connected. synchronize=", process.env.TYPEORM_SYNC);
  console.log(
    "Entities:",
    ds.entityMetadatas.map((m) => m.tableName).join(", "),
  );
  // Force sync once explicitly
  await ds.synchronize();
  console.log("Schema synchronized.");
  await closeDataSource();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
