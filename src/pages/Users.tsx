import { useMemo, useState } from 'react';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, KeyRound, Users as UsersIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ExportButtons } from '@/components/ExportButtons';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { ROLE_META, ROLE_OPTIONS, formatRoleLabel } from '@/lib/auth-users';

export default function Users() {
  const { user, users, createUser, deleteUser, adminResetUserPassword } = useAuth();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    login: '',
    password: '',
    role: 'comptable' as UserRole,
  });

  const [resetLogin, setResetLogin] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const grouped = useMemo(() => {
    const byRole: Record<UserRole, typeof users> = {
      admin: [],
      gestionnaire: [],
      comptable: [],
    };
    for (const u of users) {
      byRole[u.role].push(u);
    }
    return byRole;
  }, [users]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await withGuard(async () => {
      try {
        await createUser(form.login, form.password, form.role);
        toast.success(`Utilisateur « ${form.login.trim().toLowerCase()} » créé.`);
        setForm({ login: '', password: '', role: 'comptable' });
        setCreateOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  };

  const handleDelete = async (login: string) => {
    if (!confirm(`Supprimer l’utilisateur « ${login} » ?`)) return;
    try {
      await deleteUser(login);
      toast.success('Utilisateur supprimé.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetLogin) return;
    await withGuard(async () => {
      try {
        await adminResetUserPassword(resetLogin, resetPassword);
        toast.success(`Mot de passe réinitialisé pour ${resetLogin}.`);
        setResetLogin(null);
        setResetPassword('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Utilisateurs ANSAR',
      fileName: `utilisateurs_${new Date().toISOString().split('T')[0]}.xlsx`,
      columns: [
        { header: 'Login', value: (u) => u.login },
        { header: 'Rôle', value: (u) => formatRoleLabel(u.role) },
      ],
      rows: users,
    });
    toast.success('Export Excel généré');
  };

  const handleExportPDF = () => {
    exportToPrintablePDF({
      title: 'Utilisateurs ANSAR',
      fileName: `utilisateurs_${new Date().toISOString().split('T')[0]}.pdf`,
      headerColor: '#7c3aed',
      accentColor: '#7c3aed',
      columns: [
        { header: 'Login', value: (u) => u.login },
        { header: 'Rôle', value: (u) => formatRoleLabel(u.role) },
      ],
      rows: users,
    });
    toast.success('Export PDF — enregistrez via la fenêtre d’impression');
  };

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Utilisateurs"
        icon={UsersIcon}
        gradient="from-violet-500/15 via-purple-500/10 to-transparent"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons onExcel={handleExportExcel} onPdf={handleExportPDF} size="sm" />
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nouvel utilisateur
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nouvel utilisateur</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Identifiant de connexion</Label>
                  <Input
                    value={form.login}
                    onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
                    placeholder="ex. comptable1"
                    className="mt-1"
                    required
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lettres minuscules, chiffres, tirets (3–32 caractères).
                  </p>
                </div>
                <div>
                  <Label>Rôle</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((p) => ({ ...p, role: v as UserRole }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {ROLE_META[form.role].description}
                  </p>
                </div>
                <div>
                  <Label>Mot de passe initial</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    className="mt-1"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Créer
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {(['admin', 'gestionnaire', 'comptable'] as const).map((role) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{formatRoleLabel(role)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{grouped[role].length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                compte{grouped[role].length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Comptes enregistrés</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identifiant</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Aucun utilisateur.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.login}>
                    <TableCell className="font-medium">
                      {u.login}
                      {user?.login === u.login && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          vous
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatRoleLabel(u.role)}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {user?.login !== u.login && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            title="Réinitialiser le mot de passe"
                            onClick={() => {
                              setResetLogin(u.login);
                              setResetPassword('');
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => void handleDelete(u.login)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!resetLogin} onOpenChange={(open) => !open && setResetLogin(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Compte <span className="font-medium text-foreground">{resetLogin}</span> — l’utilisateur
              pourra se connecter avec ce mot de passe temporaire, puis le changer lui-même.
            </p>
            <div>
              <Label>Nouveau mot de passe</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="mt-1"
                required
                minLength={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResetLogin(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Réinitialiser
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}