-- Runs before 01-seed.sql (alphabetical order in docker-entrypoint-initdb.d).
-- Creates a role that can only ever SELECT - this is the real safety boundary,
-- the application-level guardrails are defense-in-depth on top of this.

CREATE ROLE sql_engine_readonly WITH LOGIN PASSWORD 'changeme';
GRANT CONNECT ON DATABASE demo TO sql_engine_readonly;
GRANT USAGE ON SCHEMA public TO sql_engine_readonly;
