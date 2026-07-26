import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Première connexion / reset admin : dialogue non fermable tant que le MDP n’est pas changé. */
  forced?: boolean;
};

export function ChangePasswordDialog({ open, onOpenChange, forced = false }: Props) {
  const { user, changeOwnPassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success(
        forced
          ? 'Mot de passe mis à jour. Vous pouvez utiliser l’application.'
          : 'Mot de passe mis à jour.',
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (forced && !v) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="w-[95vw] max-w-md"
        showCloseButton={!forced}
        onPointerDownOutside={forced ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={forced ? (e) => e.preventDefault() : undefined}
        onInteractOutside={forced ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {forced ? 'Changement de mot de passe obligatoire' : 'Mon mot de passe'}
          </DialogTitle>
          <DialogDescription>
            {forced ? (
              <>
                Compte <span className="font-medium text-foreground">{user?.login}</span> — pour
                votre sécurité, définissez un nouveau mot de passe avant d’utiliser l’application.
              </>
            ) : (
              <>
                Compte <span className="font-medium text-foreground">{user?.login}</span> — seul vous
                pouvez modifier votre mot de passe.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="current-pwd">
              {forced ? 'Mot de passe temporaire actuel' : 'Mot de passe actuel'}
            </Label>
            <Input
              id="current-pwd"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
            <Input
              id="new-pwd"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1"
              required
              minLength={6}
            />
          </div>
          <div>
            <Label htmlFor="confirm-pwd">Confirmer</Label>
            <Input
              id="confirm-pwd"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            {!forced ? (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
            ) : null}
            <Button type="submit" disabled={loading} className={forced ? 'w-full sm:w-auto' : undefined}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {forced ? 'Enregistrer et continuer' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
