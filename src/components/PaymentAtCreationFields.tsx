import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PaymentAtCreationMode } from '@/lib/payment-at-creation';

type Props = {
  label?: string;
  montant: number;
  mode: PaymentAtCreationMode;
  onModeChange: (mode: PaymentAtCreationMode) => void;
  montantAvance?: number;
  onMontantAvanceChange: (value: number | undefined) => void;
  datePaiement: string;
  onDatePaiementChange: (value: string) => void;
  variant?: 'client' | 'fournisseur';
};

export function PaymentAtCreationFields({
  label = 'Règlement facture',
  montant,
  mode,
  onModeChange,
  montantAvance,
  onMontantAvanceChange,
  datePaiement,
  onDatePaiementChange,
  variant = 'client',
}: Props) {
  const total = Math.max(0, Math.round(montant));
  const disabled = total <= 0;

  const reste =
    mode === 'avance' && montantAvance != null
      ? Math.max(0, total - Math.round(montantAvance))
      : mode === 'soldee'
        ? 0
        : total;

  const hint =
    variant === 'client'
      ? 'Évite d’aller modifier la facture pour les encaissements.'
      : 'Évite d’aller modifier la facture fournisseur pour les paiements.';

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-3">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Select value={mode} onValueChange={(v) => onModeChange(v as PaymentAtCreationMode)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en_attente">En attente de paiement</SelectItem>
          <SelectItem value="soldee">Déjà soldée (payée intégralement)</SelectItem>
          <SelectItem value="avance">Acompte / avance partielle</SelectItem>
        </SelectContent>
      </Select>
      {mode === 'avance' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">
              {variant === 'client' ? 'Montant encaissé (FCFA)' : 'Montant payé (FCFA)'}
            </Label>
            <NumberInput
              min={0}
              max={total}
              value={montantAvance}
              onChange={onMontantAvanceChange}
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Reste à payer</Label>
            <p className="text-sm font-medium mt-2 tabular-nums">
              {reste.toLocaleString('fr-FR')} FCFA
            </p>
          </div>
        </div>
      )}
      {(mode === 'soldee' || (mode === 'avance' && (montantAvance ?? 0) > 0)) && (
        <div>
          <Label className="text-xs">Date du paiement</Label>
          <Input
            type="date"
            value={datePaiement}
            onChange={(e) => onDatePaiementChange(e.target.value)}
            className="mt-1"
          />
        </div>
      )}
    </div>
  );
}
