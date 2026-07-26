import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BankAccount } from '@/lib/bank-types';
import {
  formatBankAccountLabel,
  listAnsarBankAccountsForDirectTransfer,
} from '@/lib/payment-modes';

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (compteId: string) => void;
  accounts: BankAccount[];
  /** Crédit (encaissement) ou débit (paiement). */
  intent?: 'credit' | 'debit';
  required?: boolean;
  className?: string;
};

/**
 * Choix d’un compte Ansar (Afriland, CBC, UBA, CCA) pour un virement direct.
 */
export function AnsarBankAccountSelect({
  id = 'ansar-bank-account',
  label = 'Banque *',
  value,
  onChange,
  accounts,
  intent = 'credit',
  required = true,
  className,
}: Props) {
  const { accounts: options, filteredToAnsar } =
    listAnsarBankAccountsForDirectTransfer(accounts);

  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <Label htmlFor={id}>{label}</Label>
      {options.length === 0 ? (
        <p className="text-sm text-destructive">
          Aucun compte bancaire enregistré. Ajoutez Afriland, CBC, UBA ou CCA dans Banque.
        </p>
      ) : (
        <>
          <Select value={value || undefined} onValueChange={onChange}>
            <SelectTrigger id={id}>
              <SelectValue
                placeholder={
                  intent === 'debit'
                    ? 'Choisir la banque à débiter'
                    : 'Choisir la banque (Afriland, CBC, UBA, CCA)'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {formatBankAccountLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {filteredToAnsar
              ? 'Comptes Ansar : Afriland, CBC, UBA, CCA.'
              : 'Aucun compte Afriland / CBC / UBA / CCA reconnu : tous les comptes sont listés. Vérifiez le champ « banque ».'}
            {required ? ' Choix obligatoire pour un virement direct.' : ''}
          </p>
        </>
      )}
    </div>
  );
}
