import type { UserRole } from '@/contexts/AuthContext';

export const ROLE_META: Record<
  UserRole,
  { label: string; description: string }
> = {
  gestionnaire: {
    label: 'Gestionnaire',
    description:
      'Flotte : camions, clients, chauffeurs, tiers, commandes et livraisons. Pas dépenses, facturation ni caisse.',
  },
  comptable: {
    label: 'Comptable',
    description:
      'Comptabilité : dépenses, factures et caisse. Consultation du reste (lecture seule hors ces modules).',
  },
  admin: {
    label: 'Administrateur',
    description: 'Tous les droits : flotte, trésorerie, comptabilité, utilisateurs et paramètres.',
  },
};

export const ROLE_OPTIONS = (
  ['gestionnaire', 'comptable', 'admin'] as const
).map((role) => ({
  value: role,
  label: ROLE_META[role].label,
  description: ROLE_META[role].description,
}));

export function formatRoleLabel(role: UserRole): string {
  return ROLE_META[role]?.label ?? role;
}

export function validateLoginId(login: string): string | null {
  const clean = login.trim().toLowerCase();
  if (clean.length < 3 || clean.length > 32) {
    return 'Identifiant : entre 3 et 32 caractères.';
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(clean)) {
    return 'Identifiant : lettres minuscules, chiffres, tirets ou underscores (pas d’espace).';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.trim().length < 6) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  return null;
}
