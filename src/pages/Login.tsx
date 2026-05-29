import { useState, useEffect, useMemo } from 'react';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Shield, Eye, EyeOff, Lock } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { BRAND_NAME } from '@/lib/brand';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_META, formatRoleLabel } from '@/lib/auth-users';
import { toast } from 'sonner';

export default function Login() {
  const { user, login: doLogin, users } = useAuth();
  const [selectedUser, setSelectedUser] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { isSubmitting: loading, withGuard } = useSubmitGuard();
  const navigate = useNavigate();

  const loginOptions = useMemo(
    () =>
      users.map((u) => ({
        login: u.login,
        roleLabel: formatRoleLabel(u.role),
        description: ROLE_META[u.role].description,
      })),
    [users],
  );

  useEffect(() => {
    if (users.length === 0) return;
    if (!selectedUser || !users.some((u) => u.login === selectedUser)) {
      setSelectedUser(users[0].login);
    }
  }, [users, selectedUser]);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !password) {
      toast.error('Veuillez sélectionner un utilisateur et entrer le mot de passe');
      return;
    }
    await withGuard(async () => {
      try {
        const ok = await doLogin(selectedUser, password);
        if (ok) {
          toast.success('Connexion réussie');
          navigate('/', { replace: true });
        } else {
          toast.error('Identifiants incorrects');
        }
      } catch {
        toast.error('Erreur de connexion');
      }
    });
  };

  const selectedOption = loginOptions.find((o) => o.login === selectedUser);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0f1117]">

      {/* Fond animé — orbes de couleur */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/20 blur-[120px] animate-float" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[100px] login-orb-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-[80px]" />
        {/* Grille subtile */}
        <div className="absolute inset-0 opacity-[0.04] bg-dot-pattern" />
      </div>

      {/* Carte de connexion */}
      <div className="relative w-full max-w-md mx-4 animate-ios-pop motion-reduce:animate-none">

        {/* Halo derrière la carte */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-indigo-500/30 rounded-3xl blur-2xl scale-105 opacity-70" />

        <div className="relative bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl">

          {/* Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            {/* Logo marque (squircle aligné sur le halo) */}
            <div className="relative mb-5 flex justify-center items-center">
              <div
                className="absolute w-[7.5rem] h-[7.5rem] sm:w-36 sm:h-36 rounded-[22%] bg-gradient-to-br from-violet-500/50 to-indigo-500/35 blur-2xl scale-[1.12] animate-pulse-glow"
                aria-hidden
              />
              <AppLogo variant="login" className="relative z-[1]" />
            </div>

            <h1 className="text-3xl font-bold text-white mb-1">
              <span className="bg-gradient-to-r from-violet-300 via-white to-indigo-300 bg-clip-text text-transparent">{BRAND_NAME}</span>
            </h1>
            <p className="text-white/50 text-sm">Gestion de flotte · Cameroun</p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Sélecteur utilisateur */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Utilisateur</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser} disabled={loading}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl hover:bg-white/8 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all">
                  <SelectValue placeholder="Choisir un utilisateur" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d2e] border-white/10">
                  {loginOptions.map((opt) => (
                    <SelectItem
                      key={opt.login}
                      value={opt.login}
                      textValue={opt.login}
                      className="text-white/80 focus:bg-violet-500/20 focus:text-white"
                    >
                      {opt.login} — {opt.roleLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rôle sélectionné : rappel des responsabilités */}
            {selectedOption && (
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-violet-400 flex-shrink-0" />
                  <span className="text-violet-200 text-sm font-semibold">
                    {selectedOption.login} · {selectedOption.roleLabel}
                  </span>
                </div>
                <p className="text-violet-200/80 text-xs leading-relaxed pl-6 border-l-2 border-violet-500/30 ml-1">
                  {selectedOption.description}
                </p>
              </div>
            )}

            {/* Mot de passe */}
            <div className="space-y-2">
              <Label className="text-white/70 text-sm font-medium">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 h-12 pl-10 pr-10 rounded-xl focus:border-violet-500/60 focus:ring-violet-500/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Bouton connexion */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 mt-2"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connexion...</>
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-white/25 text-xs mt-6">
            {BRAND_NAME} © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
