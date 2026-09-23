BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE version = '002'
  ) THEN

    ALTER TABLE tasks
      ADD COLUMN priority INTEGER NOT NULL DEFAULT 2;

    INSERT INTO schema_migrations (version, name)
    VALUES ('002', 'add_task_priority');

  END IF;
END
$$;

COMMIT;