import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { setApiActor, usersApi } from '@/lib/api';
import { validateLoginId, validatePassword } from '@/lib/auth-users';

const AUTH_STORAGE_KEY = 'truck_track_auth';
/** Ancien stockage navigateur : migré une fois vers Supabase puis vidé. */
const USERS_STORAGE_KEY = 'truck_track_users';
const LOCAL_USERS_MIGRATED_KEY = 'truck_track_users_migrated_v1';

export type UserRole = 'admin' | 'gestionnaire' | 'comptable';

export interface User {
  login: string;
  role: UserRole;
  /** True après création / reset admin : obliger le changement avant usage. */
  mustChangePassword?: boolean;
}

export interface UserSummary {
  login: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

interface StoredUser {
  login: string;
  passwordHash: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readSession(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as User;
    if (!session?.login || !session?.role) return null;
    return {
      login: session.login,
      role: session.role,
      mustChangePassword: Boolean(session.mustChangePassword),
    };
  } catch {
    return null;
  }
}

function writeSession(u: User | null): void {
  if (!u) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
}

function readLegacyLocalUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
  refreshUsers: () => Promise<void>;
  /** False tant que la première liste utilisateurs n’a pas été récupérée. */
  usersReady: boolean;
  createUser: (login: string, password: string, role: UserRole) => Promise<void>;
  updateUserRole: (targetLogin: string, role: UserRole) => Promise<void>;
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
  const [user, setUser] = useState<User | null>(() => readSession());
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersReady, setUsersReady] = useState(false);
  const migratedRef = useRef(false);

  const refreshUsers = useCallback(async () => {
    try {
      const list = await usersApi.list();
      setUsers(
        list
          .slice()
          .sort((a, b) => a.login.localeCompare(b.login, 'fr'))
          .map((u) => ({
            login: u.login,
            role: u.role,
            mustChangePassword: Boolean(u.mustChangePassword),
          })),
      );
    } finally {
      setUsersReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshUsers().catch((err) => {
      console.error('refreshUsers', err);
    });
  }, [refreshUsers]);

  useEffect(() => {
    setApiActor(user ? { login: user.login, role: user.role } : null);
  }, [user]);

  /** Une fois admin connecté : remonte les comptes créés uniquement en localStorage. */
  useEffect(() => {
    if (!user || user.role !== 'admin' || migratedRef.current) return;
    if (localStorage.getItem(LOCAL_USERS_MIGRATED_KEY) === '1') {
      migratedRef.current = true;
      return;
    }
    const legacy = readLegacyLocalUsers().filter(
      (u) =>
        u.login &&
        u.passwordHash &&
        ['admin', 'gestionnaire', 'comptable'].includes(u.role),
    );
    if (legacy.length === 0) {
      localStorage.setItem(LOCAL_USERS_MIGRATED_KEY, '1');
      migratedRef.current = true;
      return;
    }
    migratedRef.current = true;
    void (async () => {
      try {
        setApiActor({ login: user.login, role: user.role });
        await usersApi.importLocal(
          legacy.map((u) => ({
            login: u.login,
            passwordHash: u.passwordHash,
            role: u.role,
            mustChangePassword: Boolean(u.mustChangePassword),
          })),
        );
        localStorage.removeItem(USERS_STORAGE_KEY);
        localStorage.setItem(LOCAL_USERS_MIGRATED_KEY, '1');
        await refreshUsers();
      } catch (err) {
        migratedRef.current = false;
        console.error('importLocal users', err);
      }
    })();
  }, [user, refreshUsers]);

  /** Resynchronise le flag mustChangePassword depuis le serveur. */
  useEffect(() => {
    if (!user) return;
    const remote = users.find((u) => u.login.toLowerCase() === user.login.toLowerCase());
    if (!remote) return;
    const must = Boolean(remote.mustChangePassword);
    if (must === Boolean(user.mustChangePassword) && remote.role === user.role) return;
    const next: User = {
      login: remote.login,
      role: remote.role,
      mustChangePassword: must,
    };
    setUser(next);
    writeSession(next);
  }, [user, users]);

  const login = async (loginInput: string, password: string): Promise<boolean> => {
    try {
      const found = await usersApi.login(loginInput, password);
      const u: User = {
        login: found.login,
        role: found.role,
        mustChangePassword: Boolean(found.mustChangePassword),
      };
      setUser(u);
      writeSession(u);
      setApiActor({ login: u.login, role: u.role });
      await refreshUsers().catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    writeSession(null);
    setApiActor(null);
  };

  const createUser = async (loginId: string, password: string, role: UserRole): Promise<void> => {
    assertAdmin(user);
    const errLogin = validateLoginId(loginId);
    if (errLogin) throw new Error(errLogin);
    const errPwd = validatePassword(password);
    if (errPwd) throw new Error(errPwd);
    await usersApi.create({ login: loginId, password, role });
    await refreshUsers();
  };

  const updateUserRole = async (targetLogin: string, role: UserRole): Promise<void> => {
    assertAdmin(user);
    await usersApi.updateRole(targetLogin, role);
    await refreshUsers();
  };

  const deleteUser = async (targetLogin: string): Promise<void> => {
    assertAdmin(user);
    await usersApi.delete(targetLogin);
    await refreshUsers();
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    if (!user) throw new Error('Vous devez être connecté.');
    const errPwd = validatePassword(newPassword);
    if (errPwd) throw new Error(errPwd);
    const updated = await usersApi.changeOwnPassword(currentPassword, newPassword);
    const next: User = {
      login: updated.login,
      role: updated.role,
      mustChangePassword: false,
    };
    setUser(next);
    writeSession(next);
    await refreshUsers();
  };

  const adminResetUserPassword = async (targetLogin: string, newPassword: string): Promise<void> => {
    assertAdmin(user);
    const errPwd = validatePassword(newPassword);
    if (errPwd) throw new Error(errPwd);
    await usersApi.adminResetPassword(targetLogin, newPassword);
    await refreshUsers();
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
        usersReady,
        refreshUsers,
        createUser,
        updateUserRole,
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
