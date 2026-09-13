-- Runs last (02-grants.sql), after roles exist (00) and tables are created (01).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sql_engine_readonly;
