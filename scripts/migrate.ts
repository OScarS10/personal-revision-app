import { initializeDatabase } from "../src/lib/db/schema";

async function migrate() {
  console.log("Running database migration...");
  try {
    await initializeDatabase();
    console.log("Migration complete.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
