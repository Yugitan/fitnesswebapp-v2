CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(320) UNIQUE NOT NULL,
  display_name VARCHAR(40) NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_user_sessions_expires_at ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS workouts (
  id VARCHAR(64) PRIMARY KEY,
  owner_key VARCHAR(128) NOT NULL,
  training_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_workouts_owner_date UNIQUE(owner_key, training_date)
);
CREATE INDEX IF NOT EXISTS ix_workouts_owner_key ON workouts(owner_key);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id VARCHAR(64) PRIMARY KEY,
  workout_id VARCHAR(64) NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id VARCHAR(128) NOT NULL,
  sort_order INTEGER NOT NULL,
  CONSTRAINT uq_workout_exercises_sort_order UNIQUE(workout_id, sort_order)
);
CREATE INDEX IF NOT EXISTS ix_workout_exercises_workout_id ON workout_exercises(workout_id);

CREATE TABLE IF NOT EXISTS training_sets (
  id VARCHAR(64) PRIMARY KEY,
  workout_exercise_id VARCHAR(64) NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  weight_kg DOUBLE PRECISION,
  reps INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_training_sets_set_number UNIQUE(workout_exercise_id, set_number)
);
CREATE INDEX IF NOT EXISTS ix_training_sets_workout_exercise_id ON training_sets(workout_exercise_id);

CREATE TABLE IF NOT EXISTS favorite_exercises (
  id BIGSERIAL PRIMARY KEY,
  owner_key VARCHAR(128) NOT NULL,
  exercise_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_favorite_exercises_owner_exercise UNIQUE(owner_key, exercise_id)
);
CREATE INDEX IF NOT EXISTS ix_favorite_exercises_owner_key ON favorite_exercises(owner_key);

CREATE TABLE IF NOT EXISTS user_training_templates (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  exercise_ids JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_user_training_templates_name UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS ix_user_training_templates_user_id ON user_training_templates(user_id);
