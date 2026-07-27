import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ANSAR_BANQUES } from '@/lib/payment-modes';

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (banque: string) => void;
  required?: boolean;
  className?: string;
};

/**
 * Choix d’une banque Ansar (liste fixe) pour traçabilité d’un versement direct.
 * Pas de lien avec le module Banque : aucun compte à créer.
 */
export function AnsarBankAccountSelect({
  id = 'ansar-banque',
  label = 'Banque *',
  value,
  onChange,
  required = true,
  className,
}: Props) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choisir : Afriland, CBC, UBA ou CCA" />
        </SelectTrigger>
        <SelectContent>
          {ANSAR_BANQUES.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Traçabilité uniquement{required ? ' (obligatoire pour un versement direct)' : ''}.
      </p>
    </div>
  );
}
