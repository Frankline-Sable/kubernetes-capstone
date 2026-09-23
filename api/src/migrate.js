const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

require("dotenv").config();

const migrationsDir = path.join(__dirname, "migrations");

async function migrate() {
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "capstone_user",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "capstone_db",
  });

  await client.connect();

  try {
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    await client.query("BEGIN");

    // Only one migration runner can proceed at a time.
    await client.query("SELECT pg_advisory_xact_lock(123456)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const version = file.split("_")[0];
      const name = file
        .replace(/^\d+_/, "")
        .replace(/\.sql$/, "");

      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version]
      );

      if (existing.rowCount > 0) {
        console.log(`Skipping ${file}: already applied`);
        continue;
      }

      const sql = await fs.readFile(
        path.join(migrationsDir, file),
        "utf8"
      );

      console.log(`Applying ${file}`);

      await client.query(sql);

      await client.query(
        `INSERT INTO schema_migrations (version, name)
         VALUES ($1, $2)`,
        [version, name]
      );

      console.log(`Applied ${file}`);
    }

    await client.query("COMMIT");
    console.log("All migrations completed successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate().catch((error) => {
  console.error("Migration runner failed:", error);
  process.exitCode = 1;
});