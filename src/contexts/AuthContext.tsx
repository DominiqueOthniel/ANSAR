import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setApiActor } from '@/lib/api';

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

// Hash SHA-256 des mots de passe
const GESTIONNAIRE_HASH = 'af960ccfc27d3ef7981c7fd8887ae7baa30f21aff0b9b15b6253e7b659545f87';
const ADMIN_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
const COMPTABLE_HASH = '9c831eae072d3a93e92ba9d940aa186447bcef2eb777b570e267fe78a000bcb6';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Utilisateurs par défaut (admin: admin123, gestionnaire: gestion123, comptable: comptable123)
  return [
    { login: 'admin', passwordHash: ADMIN_HASH, role: 'admin' as const },
    { login: 'gestionnaire', passwordHash: GESTIONNAIRE_HASH, role: 'gestionnaire' as const },
    { login: 'comptable', passwordHash: COMPTABLE_HASH, role: 'comptable' as const },
  ];
}

function initUsers() {
  const defaultUsers = [
    { login: 'admin', passwordHash: ADMIN_HASH, role: 'admin' as const },
    { login: 'gestionnaire', passwordHash: GESTIONNAIRE_HASH, role: 'gestionnaire' as const },
    { login: 'comptable', passwordHash: COMPTABLE_HASH, role: 'comptable' as const },
  ];
  // Initialise seulement les comptes manquants, sans écraser les mots de passe existants.
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const existing: StoredUser[] = raw ? JSON.parse(raw) : [];
    const merged = defaultUsers.map((def) => {
      const found = existing.find(u => u.login === def.login);
      return found
        ? { ...found, role: def.role }
        : def;
    });
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(defaultUsers));
  }
}

interface AuthContextType {
  user: User | null;
  login: (login: string, password: string) => Promise<boolean>;
  logout: () => void;
  users: UserSummary[];
  changeUserPassword: (targetLogin: string, newPassword: string) => Promise<void>;
  /** Flotte : camions, trajets, chauffeurs, tiers (pas les dépenses — comptable) */
  canManageFleet: boolean;
  /** Comptabilité : dépenses, factures, comptes bancaires */
  canManageAccounting: boolean;
  /** Trésorerie : caisse */
  canManageTreasury: boolean;
  /** Crédits / emprunts */
  canManageCredits: boolean;
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

  useEffect(() => {
    initUsers();
    setUsers(getStoredUsers().map(({ login, role }) => ({ login, role })));
  }, []);

  useEffect(() => {
    setApiActor(user ? { login: user.login, role: user.role } : null);
  }, [user]);

  const login = async (loginInput: string, password: string): Promise<boolean> => {
    const users = getStoredUsers();
    const stored = users.find(u => u.login.toLowerCase() === loginInput.toLowerCase());
    if (!stored) return false;

    const hash = await hashPassword(password);
    if (hash !== stored.passwordHash) return false;

    const u: User = { login: stored.login, role: stored.role };
    setUser(u);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const changeUserPassword = async (targetLogin: string, newPassword: string): Promise<void> => {
    if (!user || user.role !== 'admin') {
      throw new Error('Action réservée à l’administrateur.');
    }
    const normalizedLogin = targetLogin.trim().toLowerCase();
    if (!normalizedLogin) throw new Error('Utilisateur invalide.');
    if (newPassword.trim().length < 6) {
      throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
    }
    const stored = getStoredUsers();
    const idx = stored.findIndex((u) => u.login.toLowerCase() === normalizedLogin);
    if (idx < 0) throw new Error('Utilisateur introuvable.');

    const passwordHash = await hashPassword(newPassword);
    stored[idx] = { ...stored[idx], passwordHash };
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(stored));
    setUsers(stored.map(({ login, role }) => ({ login, role })));
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
        changeUserPassword,
        canManageFleet,
        canManageAccounting,
        canManageTreasury,
        canManageCredits,
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

/** Liste des utilisateurs disponibles pour la sélection à la connexion */
export const LOGIN_USER_OPTIONS = [
  {
    login: 'gestionnaire',
    label: 'Gestionnaire',
    description:
      'Flotte : camions, trajets, envoi colis, chauffeurs, tiers. GPS. Pas dépenses, facturation, comptes bancaires, caisse ni crédits.',
  },
  {
    login: 'comptable',
    label: 'Comptable',
    description:
      'Comptabilité : dépenses, factures, comptes bancaires, caisse et crédits. Consultation du reste de l’application (lecture seule hors ces modules).',
  },
  {
    login: 'admin',
    label: 'Administrateur',
    description: 'Tous les droits : flotte, trésorerie, comptabilité et paramètres.',
  },
] as const;
