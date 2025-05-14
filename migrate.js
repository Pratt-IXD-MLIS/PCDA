const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

const db = require("./database");

async function runMigrations() {
  console.log("Starting database migrations...");

  const pool = db.getPool();

  try {
    const migrationsDir = path.join(__dirname, "migrations");
    const files = await readdir(migrationsDir);

    const migrationFiles = files.filter((file) => file.endsWith(".sql")).sort();

    if (migrationFiles.length === 0) {
      console.log("No migration files found.");
      return;
    }

    console.log(`Found ${migrationFiles.length} migration files to process.`);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const { rows } = await client.query("SELECT name FROM migrations");
      const executedMigrations = rows.map((row) => row.name);

      for (const file of migrationFiles) {
        if (executedMigrations.includes(file)) {
          console.log(`Migration ${file} already executed, skipping...`);
          continue;
        }

        console.log(`Executing migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = await readFile(filePath, "utf8");

        await client.query(sql);

        await client.query("INSERT INTO migrations (name) VALUES ($1)", [file]);

        console.log(`Successfully executed migration: ${file}`);
      }

      await client.query("COMMIT");
      console.log("All migrations completed successfully!");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error during migration process:", error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigrations();
