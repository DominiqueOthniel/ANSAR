-- Comptes applicatifs SIA-ANSAR (partagés via Supabase / Netlify).
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  login VARCHAR(32) NOT NULL,
  "passwordHash" VARCHAR(128) NOT NULL,
  role VARCHAR(20) NOT NULL,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_login_unique UNIQUE (login),
  CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'gestionnaire', 'comptable'))
);

CREATE INDEX IF NOT EXISTS idx_app_users_login ON app_users (login);
