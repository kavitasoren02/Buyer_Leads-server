const fs = require("fs")
const path = require("path")
const pool = require("../config/database")

async function runMigrations() {
  try {
    console.log("Starting database migrations...")

    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Get list of executed migrations
    const executedResult = await pool.query("SELECT filename FROM migrations ORDER BY id")
    const executedMigrations = executedResult.rows.map((row) => row.filename)

    // Read migration files
    const migrationsDir = path.join(__dirname, "migrations")
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()

    // Execute pending migrations
    for (const filename of migrationFiles) {
      if (!executedMigrations.includes(filename)) {
        console.log(`Executing migration: ${filename}`)

        const filePath = path.join(migrationsDir, filename)
        const sql = fs.readFileSync(filePath, "utf8")

        // Execute migration in a transaction
        const client = await pool.connect()
        try {
          await client.query("BEGIN")
          await client.query(sql)
          await client.query("INSERT INTO migrations (filename) VALUES ($1)", [filename])
          await client.query("COMMIT")
          console.log(`✓ Migration ${filename} completed successfully`)
        } catch (error) {
          await client.query("ROLLBACK")
          throw error
        } finally {
          client.release()
        }
      } else {
        console.log(`⏭ Migration ${filename} already executed`)
      }
    }

    console.log("All migrations completed successfully!")
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  } finally {
    // await pool.end()
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
}

module.exports = runMigrations
