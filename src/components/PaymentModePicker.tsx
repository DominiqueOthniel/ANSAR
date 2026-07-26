import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ELECTRONIC_PAYMENT_OPTIONS,
  PAYMENT_FAMILY_OPTIONS,
  PAYMENT_MODE,
  VIREMENT_KIND_OPTIONS,
  defaultModeForFamily,
  normalizePaymentMode,
  paymentModeFamily,
  type PaymentModeFamily,
} from '@/lib/payment-modes';

type Props = {
  id?: string;
  value: string;
  onChange: (mode: string) => void;
  /** Affiche l’option « Aucun ». */
  allowNone?: boolean;
  label?: string;
  className?: string;
};

/**
 * Sélecteur en cascade :
 * famille → (électronique : MTN/Orange) ou (virement : direct/indirect).
 */
export function PaymentModePicker({
  id = 'payment-mode',
  value,
  onChange,
  allowNone = true,
  label = 'Mode de paiement',
  className,
}: Props) {
  const canonical = normalizePaymentMode(value) || '';
  const family = paymentModeFamily(canonical);

  const setFamily = (next: PaymentModeFamily | 'none') => {
    if (next === 'none') {
      onChange('');
      return;
    }
    const currentFamily = paymentModeFamily(canonical);
    if (currentFamily === next && canonical) return;
    onChange(defaultModeForFamily(next));
  };

  return (
    <div className={className ? `space-y-3 ${className}` : 'space-y-3'}>
      <div>
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={family || (allowNone ? 'none' : '')}
          onValueChange={(v) => setFamily(v as PaymentModeFamily | 'none')}
        >
          <SelectTrigger id={id} className="mt-1">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent>
            {allowNone && <SelectItem value="none">Aucun</SelectItem>}
            {PAYMENT_FAMILY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {family && (
          <p className="text-xs text-muted-foreground mt-1">
            {PAYMENT_FAMILY_OPTIONS.find((o) => o.value === family)?.hint}
          </p>
        )}
      </div>

      {family === 'electronique' && (
        <div>
          <Label htmlFor={`${id}-operator`}>Opérateur</Label>
          <Select
            value={
              canonical === PAYMENT_MODE.ORANGE || canonical === PAYMENT_MODE.MTN
                ? canonical
                : PAYMENT_MODE.MTN
            }
            onValueChange={onChange}
          >
            <SelectTrigger id={`${id}-operator`} className="mt-1">
              <SelectValue placeholder="MTN ou Orange" />
            </SelectTrigger>
            <SelectContent>
              {ELECTRONIC_PAYMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {family === 'virement' && (
        <div>
          <Label htmlFor={`${id}-virement-kind`}>Type de virement</Label>
          <Select
            value={
              canonical === PAYMENT_MODE.VIREMENT_INDIRECT
                ? PAYMENT_MODE.VIREMENT_INDIRECT
                : PAYMENT_MODE.VIREMENT_DIRECT
            }
            onValueChange={onChange}
          >
            <SelectTrigger id={`${id}-virement-kind`} className="mt-1">
              <SelectValue placeholder="Direct ou indirect" />
            </SelectTrigger>
            <SelectContent>
              {VIREMENT_KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {
              VIREMENT_KIND_OPTIONS.find(
                (o) =>
                  o.value ===
                  (canonical === PAYMENT_MODE.VIREMENT_INDIRECT
                    ? PAYMENT_MODE.VIREMENT_INDIRECT
                    : PAYMENT_MODE.VIREMENT_DIRECT),
              )?.hint
            }
          </p>
        </div>
      )}
    </div>
  );
}
