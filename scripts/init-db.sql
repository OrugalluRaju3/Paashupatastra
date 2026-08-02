-- Paashupatastra Postgres bootstrap
-- Run as a superuser (e.g. postgres), then services can use DATABASE_URL.

DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'paashupatastra') THEN
    CREATE ROLE paashupatastra LOGIN PASSWORD 'paashupatastra';
  END IF;
END
$$;

SELECT 'CREATE DATABASE paashupatastra OWNER paashupatastra'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'paashupatastra')\gexec

GRANT ALL PRIVILEGES ON DATABASE paashupatastra TO paashupatastra;
