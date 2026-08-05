'use strict';

const { randomUUID, createHash } = require('crypto');
const { query } = require('../db.cjs');
const { HttpError, audit } = require('../lib.cjs');

const ROLES = new Set(['admin', 'gestionnaire', 'comptable']);

/** Hashes SHA-256 des mots de passe historiques (admin / gestionnaire / comptable). */
const DEFAULT_USERS = [
  {
    login: 'admin',
    passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    role: 'admin',
  },
  {
    login: 'gestionnaire',
    passwordHash: 'af960ccfc27d3ef7981c7fd8887ae7baa30f21aff0b9b15b6253e7b659545f87',
    role: 'gestionnaire',
  },
  {
    login: 'comptable',
    passwordHash: '9c831eae072d3a93e92ba9d940aa186447bcef2eb777b570e267fe78a000bcb6',
    role: 'comptable',
  },
];

let schemaReady = false;

function hashPassword(password) {
  return createHash('sha256').update(String(password), 'utf8').digest('hex');
}

function validateLoginId(login) {
  const clean = String(login || '')
    .trim()
    .toLowerCase();
  if (clean.length < 3 || clean.length > 32) {
    return { error: 'Identifiant : entre 3 et 32 caractères.' };
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(clean)) {
    return {
      error:
        'Identifiant : lettres minuscules, chiffres, tirets ou underscores (pas d’espace).',
    };
  }
  return { login: clean };
}

function validatePassword(password) {
  if (String(password || '').trim().length < 6) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  return null;
}

function mapPublic(row) {
  if (!row) return null;
  return {
    login: row.login,
    role: row.role,
    mustChangePassword: Boolean(row.mustChangePassword),
  };
}

function assertAdmin(actor) {
  if (!actor?.login || actor.role !== 'admin') {
    throw HttpError(403, 'Action réservée à l’administrateur.');
  }
}

async function ensureSchema() {
  if (schemaReady) return;
  await query(`
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
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_app_users_login ON app_users (login)`);
  for (const u of DEFAULT_USERS) {
    await query(
      `INSERT INTO app_users (id, login, "passwordHash", role, "mustChangePassword")
       VALUES ($1,$2,$3,$4,false)
       ON CONFLICT (login) DO NOTHING`,
      [randomUUID(), u.login, u.passwordHash, u.role],
    );
  }
  schemaReady = true;
}

async function listUsers() {
  await ensureSchema();
  const { rows } = await query(
    `SELECT login, role, "mustChangePassword" FROM app_users ORDER BY login ASC`,
  );
  return rows.map(mapPublic);
}

async function findByLogin(login) {
  const { rows } = await query(`SELECT * FROM app_users WHERE login = $1`, [login]);
  return rows[0] || null;
}

async function countAdmins() {
  const { rows } = await query(
    `SELECT count(*)::int AS c FROM app_users WHERE role = 'admin'`,
  );
  return rows[0]?.c ?? 0;
}

async function login(body) {
  await ensureSchema();
  const parsed = validateLoginId(body?.login);
  if (parsed.error) throw HttpError(400, parsed.error);
  const password = body?.password;
  if (password == null || String(password) === '') {
    throw HttpError(400, 'Mot de passe requis.');
  }
  const row = await findByLogin(parsed.login);
  if (!row) throw HttpError(401, 'Identifiant ou mot de passe incorrect.');
  if (hashPassword(password) !== row.passwordHash) {
    throw HttpError(401, 'Identifiant ou mot de passe incorrect.');
  }
  return mapPublic(row);
}

async function createUser(body, actor) {
  assertAdmin(actor);
  await ensureSchema();
  const parsed = validateLoginId(body?.login);
  if (parsed.error) throw HttpError(400, parsed.error);
  const errPwd = validatePassword(body?.password);
  if (errPwd) throw HttpError(400, errPwd);
  const role = String(body?.role || '').trim();
  if (!ROLES.has(role)) throw HttpError(400, 'Rôle invalide.');

  const existing = await findByLogin(parsed.login);
  if (existing) {
    throw HttpError(409, `L’identifiant « ${parsed.login} » existe déjà.`);
  }

  const id = randomUUID();
  const passwordHash = hashPassword(body.password);
  await query(
    `INSERT INTO app_users (id, login, "passwordHash", role, "mustChangePassword")
     VALUES ($1,$2,$3,$4,true)`,
    [id, parsed.login, passwordHash, role],
  );
  const created = mapPublic({
    login: parsed.login,
    role,
    mustChangePassword: true,
  });
  await audit(
    'users',
    'CREATE',
    id,
    `Création utilisateur ${parsed.login} (${role})`,
    null,
    created,
    actor,
  );
  return created;
}

async function updateUserRole(loginParam, body, actor) {
  assertAdmin(actor);
  await ensureSchema();
  const parsed = validateLoginId(loginParam);
  if (parsed.error) throw HttpError(400, parsed.error);
  if (actor.login.toLowerCase() === parsed.login) {
    throw HttpError(400, 'Vous ne pouvez pas modifier votre propre rôle.');
  }
  const role = String(body?.role || '').trim();
  if (!ROLES.has(role)) throw HttpError(400, 'Rôle invalide.');

  const row = await findByLogin(parsed.login);
  if (!row) throw HttpError(404, 'Utilisateur introuvable.');

  if (row.role === 'admin' && role !== 'admin') {
    if ((await countAdmins()) <= 1) {
      throw HttpError(400, 'Impossible de retirer le rôle du dernier administrateur.');
    }
  }

  await query(
    `UPDATE app_users SET role = $2, "updatedAt" = NOW() WHERE login = $1`,
    [parsed.login, role],
  );
  const after = mapPublic({ ...row, role });
  await audit(
    'users',
    'UPDATE',
    row.id,
    `Rôle ${parsed.login} → ${role}`,
    mapPublic(row),
    after,
    actor,
  );
  return after;
}

async function deleteUser(loginParam, actor) {
  assertAdmin(actor);
  await ensureSchema();
  const parsed = validateLoginId(loginParam);
  if (parsed.error) throw HttpError(400, parsed.error);
  if (actor.login.toLowerCase() === parsed.login) {
    throw HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  }

  const row = await findByLogin(parsed.login);
  if (!row) throw HttpError(404, 'Utilisateur introuvable.');
  if (row.role === 'admin' && (await countAdmins()) <= 1) {
    throw HttpError(400, 'Impossible de supprimer le dernier administrateur.');
  }

  await query(`DELETE FROM app_users WHERE login = $1`, [parsed.login]);
  await audit(
    'users',
    'DELETE',
    row.id,
    `Suppression utilisateur ${parsed.login}`,
    mapPublic(row),
    null,
    actor,
  );
  return true;
}

async function changeOwnPassword(body, actor) {
  if (!actor?.login) throw HttpError(401, 'Vous devez être connecté.');
  await ensureSchema();
  const errPwd = validatePassword(body?.newPassword);
  if (errPwd) throw HttpError(400, errPwd);

  const row = await findByLogin(String(actor.login).toLowerCase());
  if (!row) throw HttpError(404, 'Compte introuvable.');

  if (hashPassword(body?.currentPassword) !== row.passwordHash) {
    throw HttpError(400, 'Mot de passe actuel incorrect.');
  }
  const newHash = hashPassword(body.newPassword);
  if (newHash === row.passwordHash) {
    throw HttpError(400, 'Le nouveau mot de passe doit être différent de l’actuel.');
  }

  await query(
    `UPDATE app_users
     SET "passwordHash" = $2, "mustChangePassword" = false, "updatedAt" = NOW()
     WHERE login = $1`,
    [row.login, newHash],
  );
  return mapPublic({ ...row, mustChangePassword: false });
}

async function adminResetPassword(loginParam, body, actor) {
  assertAdmin(actor);
  await ensureSchema();
  const parsed = validateLoginId(loginParam);
  if (parsed.error) throw HttpError(400, parsed.error);
  if (actor.login.toLowerCase() === parsed.login) {
    throw HttpError(
      400,
      'Utilisez « Mon mot de passe » pour modifier votre propre mot de passe.',
    );
  }
  const errPwd = validatePassword(body?.newPassword);
  if (errPwd) throw HttpError(400, errPwd);

  const row = await findByLogin(parsed.login);
  if (!row) throw HttpError(404, 'Utilisateur introuvable.');

  await query(
    `UPDATE app_users
     SET "passwordHash" = $2, "mustChangePassword" = true, "updatedAt" = NOW()
     WHERE login = $1`,
    [parsed.login, hashPassword(body.newPassword)],
  );
  await audit(
    'users',
    'UPDATE',
    row.id,
    `Réinitialisation mot de passe ${parsed.login}`,
    null,
    { login: parsed.login, mustChangePassword: true },
    actor,
  );
  return mapPublic({ ...row, mustChangePassword: true });
}

/** Import one-shot depuis localStorage (hashes déjà calculés côté navigateur). */
async function importLocalUsers(body, actor) {
  assertAdmin(actor);
  await ensureSchema();
  const items = Array.isArray(body?.users) ? body.users : [];
  let imported = 0;
  for (const item of items) {
    const parsed = validateLoginId(item?.login);
    if (parsed.error) continue;
    const role = String(item?.role || '').trim();
    if (!ROLES.has(role)) continue;
    const passwordHash = String(item?.passwordHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(passwordHash)) continue;
    if (await findByLogin(parsed.login)) continue;
    await query(
      `INSERT INTO app_users (id, login, "passwordHash", role, "mustChangePassword")
       VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        parsed.login,
        passwordHash,
        role,
        Boolean(item?.mustChangePassword),
      ],
    );
    imported += 1;
  }
  return { imported };
}

module.exports = {
  listUsers,
  login,
  createUser,
  updateUserRole,
  deleteUser,
  changeOwnPassword,
  adminResetPassword,
  importLocalUsers,
};
