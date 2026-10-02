import { sql } from "@vercel/postgres";

/**
 * Database schema initialization.
 * Run this once to create all tables.
 */
export async function initializeDatabase() {
  // Users table
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100),
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ,
      email_verified BOOLEAN DEFAULT FALSE,
      verification_token VARCHAR(255),
      reset_token VARCHAR(255),
      reset_token_expires TIMESTAMPTZ
    );
  `;

  // Sessions table (for refresh tokens)
  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      user_agent TEXT,
      ip_address INET,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );
  `;

  // Answers table
  await sql`
    CREATE TABLE IF NOT EXISTS answers (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      question_id VARCHAR(255) NOT NULL,
      chapter_id VARCHAR(255) NOT NULL,
      subject_id VARCHAR(100) NOT NULL,
      skill_ids JSONB DEFAULT '[]'::jsonb,
      spec_ref VARCHAR(100),
      difficulty DOUBLE PRECISION DEFAULT 0,
      response JSONB DEFAULT '[]'::jsonb,
      correct BOOLEAN NOT NULL,
      score DOUBLE PRECISION DEFAULT 0,
      marks INTEGER DEFAULT 1,
      awarded_marks INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      timestamp BIGINT NOT NULL,
      template VARCHAR(255) DEFAULT 'unknown',
      assesses_mastery BOOLEAN DEFAULT TRUE,
      self_assessed BOOLEAN DEFAULT FALSE,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Sessions metadata table
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      mode VARCHAR(20) NOT NULL,
      subject_id VARCHAR(100) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      length INTEGER,
      question_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      accuracy DOUBLE PRECISION DEFAULT 0,
      duration_ms BIGINT DEFAULT 0,
      chapters JSONB DEFAULT '[]'::jsonb,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Skills table
  await sql`
    CREATE TABLE IF NOT EXISTS skills (
      id VARCHAR(255) PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      subject_id VARCHAR(100) NOT NULL,
      chapter_id VARCHAR(255) NOT NULL,
      theta DOUBLE PRECISION DEFAULT 0,
      alpha DOUBLE PRECISION DEFAULT 1,
      beta DOUBLE PRECISION DEFAULT 1,
      p_learned DOUBLE PRECISION DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      recent JSONB DEFAULT '[]'::jsonb,
      information DOUBLE PRECISION DEFAULT 0,
      last_seen BIGINT,
      avg_duration_ms DOUBLE PRECISION DEFAULT 0,
      difficulty_sum DOUBLE PRECISION DEFAULT 0,
      inferred_only BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Daily stats table
  await sql`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id VARCHAR(50) PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      subject_id VARCHAR(100) NOT NULL,
      attempted INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      duration_ms BIGINT DEFAULT 0,
      sessions INTEGER DEFAULT 0,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Template stats table
  await sql`
    CREATE TABLE IF NOT EXISTS template_stats (
      id VARCHAR(255) PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      template_key VARCHAR(255) NOT NULL,
      subject_id VARCHAR(100) NOT NULL,
      chapter_id VARCHAR(255) NOT NULL,
      attempts INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      score_sum DOUBLE PRECISION DEFAULT 0,
      difficulty_sum DOUBLE PRECISION DEFAULT 0,
      last_seen BIGINT DEFAULT 0,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Bookmarks table
  await sql`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      question_id VARCHAR(255) NOT NULL,
      chapter_id VARCHAR(255) NOT NULL,
      subject_id VARCHAR(100) NOT NULL,
      spec_ref VARCHAR(100),
      difficulty DOUBLE PRECISION DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      synced_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Sync queue table
  await sql`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      table_name VARCHAR(50) NOT NULL,
      operation VARCHAR(10) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      processed_at TIMESTAMPTZ
    );
  `;

  // Indexes for performance
  await sql`CREATE INDEX IF NOT EXISTS idx_answers_user_timestamp ON answers (user_id, timestamp DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_answers_chapter ON answers (chapter_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions (user_id, started_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_skills_user_chapter ON skills (user_id, chapter_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats (user_id, date DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_template_stats_user_template ON template_stats (user_id, template_key);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookmarks_user_question ON bookmarks (user_id, question_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sync_queue_user_created ON sync_queue (user_id, created_at);`;

  console.log("Database schema initialized successfully");
}

/**
 * Drop all tables (use with caution - for development only)
 */
export async function dropDatabase() {
  await sql`DROP TABLE IF EXISTS sync_queue CASCADE;`;
  await sql`DROP TABLE IF EXISTS bookmarks CASCADE;`;
  await sql`DROP TABLE IF EXISTS template_stats CASCADE;`;
  await sql`DROP TABLE IF EXISTS daily_stats CASCADE;`;
  await sql`DROP TABLE IF EXISTS skills CASCADE;`;
  await sql`DROP TABLE IF EXISTS sessions CASCADE;`;
  await sql`DROP TABLE IF EXISTS answers CASCADE;`;
  await sql`DROP TABLE IF EXISTS user_sessions CASCADE;`;
  await sql`DROP TABLE IF EXISTS users CASCADE;`;
  console.log("Database dropped");
}