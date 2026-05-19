import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { setApiActor } from '@/lib/api';
import { validateLoginId, validatePassword } from '@/lib/auth-users';

const AUTH_STORAGE_KEY = 'truck_track_auth';
const USERS_STORAGE_KEY = 'truck_track_users';

export type UserRole = 'admin' | 'gestionnaire' | 'comptable';

export interface User {
  login: string;
  role: UserRole;
}

export interface UserSummary {
  login: string;
  role: UserRole;
}

interface StoredUser {
  login: string;
  passwordHash: string;
  role: UserRole;
}

const GESTIONNAIRE_HASH = 'af960ccfc27d3ef7981c7fd8887ae7baa30f21aff0b9b15b6253e7b659545f87';
const ADMIN_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
const COMPTABLE_HASH = '9c831eae072d3a93e92ba9d940aa186447bcef2eb777b570e267fe78a000bcb6';

const DEFAULT_USERS: StoredUser[] = [
  { login: 'admin', passwordHash: ADMIN_HASH, role: 'admin' },
  { login: 'gestionnaire', passwordHash: GESTIONNAIRE_HASH, role: 'gestionnaire' },
  { login: 'comptable', passwordHash: COMPTABLE_HASH, role: 'comptable' },
];

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredUser[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_USERS];
}

function persistUsers(stored: StoredUser[]): UserSummary[] {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(stored));
  return stored
    .slice()
    .sort((a, b) => a.login.localeCompare(b.login, 'fr'))
    .map(({ login, role }) => ({ login, role }));
}

function initUsers(): void {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const existing: StoredUser[] = raw ? JSON.parse(raw) : [];
    const merged = [...existing];
    for (const def of DEFAULT_USERS) {
      if (!merged.some((u) => u.login.toLowerCase() === def.login.toLowerCase())) {
        merged.push(def);
      }
    }
    persistUsers(merged);
  } catch {
    persistUsers([...DEFAULT_USERS]);
  }
}

function assertAdmin(user: User | null): void {
  if (!user || user.role !== 'admin') {
    throw new Error('Action réservée à l’administrateur.');
  }
}

interface AuthContextType {
  user: User | null;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  users: UserSummary[];
  refreshUsers: () => void;
  createUser: (login: string, password: string, role: UserRole) => Promise<void>;
  deleteUser: (targetLogin: string) => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Réinitialisation admin (mot de passe oublié) — pas pour son propre compte. */
  adminResetUserPassword: (targetLogin: string, newPassword: string) => Promise<void>;
  canManageFleet: boolean;
  canManageAccounting: boolean;
  canManageTreasury: boolean;
  canManageCredits: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [users, setUsers] = useState<UserSummary[]>([]);

  const refreshUsers = useCallback(() => {
    initUsers();
    setUsers(persistUsers(getStoredUsers()));
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    setApiActor(user ? { login: user.login, role: user.role } : null);
  }, [user]);

  const login = async (loginInput: string, password: string): Promise<boolean> => {
    const stored = getStoredUsers();
    const key = loginInput.trim().toLowerCase();
    const found = stored.find((u) => u.login.toLowerCase() === key);
    if (!found) return false;

    const hash = await hashPassword(password);
    if (hash !== found.passwordHash) return false;

    const u: User = { login: found.login, role: found.role };
    setUser(u);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const createUser = async (loginId: string, password: string, role: UserRole): Promise<void> => {
    assertAdmin(user);
    const errLogin = validateLoginId(loginId);
    if (errLogin) throw new Error(errLogin);
    const errPwd = validatePassword(password);
    if (errPwd) throw new Error(errPwd);

    const cleanLogin = loginId.trim().toLowerCase();
    const stored = getStoredUsers();
    if (stored.some((u) => u.login.toLowerCase() === cleanLogin)) {
      throw new Error(`L’identifiant « ${cleanLogin} » existe déjà.`);
    }

    const passwordHash = await hashPassword(password);
    stored.push({ login: cleanLogin, passwordHash, role });
    setUsers(persistUsers(stored));
  };

  const deleteUser = async (targetLogin: string): Promise<void> => {
    assertAdmin(user);
    const key = targetLogin.trim().toLowerCase();
    if (!key) throw new Error('Utilisateur invalide.');
    if (user && user.login.toLowerCase() === key) {
      throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
    }

    const stored = getStoredUsers();
    const target = stored.find((u) => u.login.toLowerCase() === key);
    if (!target) throw new Error('Utilisateur introuvable.');

    if (target.role === 'admin') {
      const adminCount = stored.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        throw new Error('Impossible de supprimer le dernier administrateur.');
      }
    }

    const next = stored.filter((u) => u.login.toLowerCase() !== key);
    setUsers(persistUsers(next));
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    if (!user) throw new Error('Vous devez être connecté.');
    const errPwd = validatePassword(newPassword);
    if (errPwd) throw new Error(errPwd);

    const stored = getStoredUsers();
    const idx = stored.findIndex((u) => u.login.toLowerCase() === user.login.toLowerCase());
    if (idx < 0) throw new Error('Compte introuvable.');

    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== stored[idx].passwordHash) {
      throw new Error('Mot de passe actuel incorrect.');
    }

    stored[idx] = { ...stored[idx], passwordHash: await hashPassword(newPassword) };
    setUsers(persistUsers(stored));
  };

  const adminResetUserPassword = async (targetLogin: string, newPassword: string): Promise<void> => {
    assertAdmin(user);
    const key = targetLogin.trim().toLowerCase();
    if (!key) throw new Error('Utilisateur invalide.');
    if (user && user.login.toLowerCase() === key) {
      throw new Error('Utilisez « Mon mot de passe » pour modifier votre propre mot de passe.');
    }
    const errPwd = validatePassword(newPassword);
    if (errPwd) throw new Error(errPwd);

    const stored = getStoredUsers();
    const idx = stored.findIndex((u) => u.login.toLowerCase() === key);
    if (idx < 0) throw new Error('Utilisateur introuvable.');

    stored[idx] = { ...stored[idx], passwordHash: await hashPassword(newPassword) };
    setUsers(persistUsers(stored));
  };

  const isAdmin = user?.role === 'admin';
  const isGestionnaire = user?.role === 'gestionnaire';
  const isComptable = user?.role === 'comptable';

  const canManageFleet = !user || isAdmin || isGestionnaire;
  const canManageAccounting = !user || isAdmin || isComptable;
  const canManageTreasury = !user || isAdmin || isComptable;
  const canManageCredits = !user || isAdmin || isComptable;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        users,
        refreshUsers,
        createUser,
        deleteUser,
        changeOwnPassword,
        adminResetUserPassword,
        canManageFleet,
        canManageAccounting,
        canManageTreasury,
        canManageCredits,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
