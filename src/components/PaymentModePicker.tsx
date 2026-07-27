import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import type { ThirdParty } from '@/contexts/AppContext';
import {
  ANSAR_BANQUES,
  ELECTRONIC_PAYMENT_OPTIONS,
  PAYMENT_FAMILY_OPTIONS,
  PAYMENT_MODE,
  VIREMENT_KIND_OPTIONS,
  defaultModeForFamily,
  formatIndirectVersement,
  formatPaymentModeWithBanque,
  isVersementIndirect,
  normalizePaymentMode,
  parseAnsarBanque,
  parseIndirectVersement,
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
  /** Fournisseurs / entreprises pour le versement indirect. */
  entreprises?: ThirdParty[];
};

/**
 * Sélecteur en cascade :
 * famille → (électronique : MTN/Orange) ou (versement : direct/indirect).
 * Indirect : entreprise puis banque de l’entreprise.
 */
export function PaymentModePicker({
  id = 'payment-mode',
  value,
  onChange,
  allowNone = true,
  label = 'Mode de paiement',
  className,
  entreprises = [],
}: Props) {
  const canonical = normalizePaymentMode(value) || '';
  const family = paymentModeFamily(canonical);
  const indirect = parseIndirectVersement(value);
  const directBanque = parseAnsarBanque(value) || '';

  const setFamily = (next: PaymentModeFamily | 'none') => {
    if (next === 'none') {
      onChange('');
      return;
    }
    const currentFamily = paymentModeFamily(canonical);
    if (currentFamily === next && canonical) return;
    onChange(defaultModeForFamily(next));
  };

  const setVersementKind = (kind: string) => {
    if (kind === PAYMENT_MODE.VIREMENT_INDIRECT) {
      onChange(
        formatIndirectVersement(indirect?.entreprise, indirect?.banque) ||
          PAYMENT_MODE.VIREMENT_INDIRECT,
      );
      return;
    }
    onChange(
      formatPaymentModeWithBanque(PAYMENT_MODE.VIREMENT_DIRECT, directBanque) ||
        PAYMENT_MODE.VIREMENT_DIRECT,
    );
  };

  const setIndirectEntreprise = (entrepriseNom: string) => {
    onChange(
      formatIndirectVersement(entrepriseNom, indirect?.banque || '') ||
        PAYMENT_MODE.VIREMENT_INDIRECT,
    );
  };

  const setIndirectBanque = (banque: string) => {
    onChange(
      formatIndirectVersement(indirect?.entreprise || '', banque) ||
        PAYMENT_MODE.VIREMENT_INDIRECT,
    );
  };

  const setDirectBanque = (banque: string) => {
    onChange(formatPaymentModeWithBanque(PAYMENT_MODE.VIREMENT_DIRECT, banque) || '');
  };

  const selectedEntrepriseId =
    entreprises.find((e) => e.nom.trim() === (indirect?.entreprise || '').trim())?.id || '';

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
        <div className="space-y-3">
          <div>
            <Label htmlFor={`${id}-versement-kind`}>Type de versement</Label>
            <Select
              value={
                isVersementIndirect(canonical)
                  ? PAYMENT_MODE.VIREMENT_INDIRECT
                  : PAYMENT_MODE.VIREMENT_DIRECT
              }
              onValueChange={setVersementKind}
            >
              <SelectTrigger id={`${id}-versement-kind`} className="mt-1">
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
                    (isVersementIndirect(canonical)
                      ? PAYMENT_MODE.VIREMENT_INDIRECT
                      : PAYMENT_MODE.VIREMENT_DIRECT),
                )?.hint
              }
            </p>
          </div>

          {!isVersementIndirect(canonical) && (
            <div>
              <Label htmlFor={`${id}-banque-ansar`}>Banque Ansar *</Label>
              <Select
                value={directBanque || undefined}
                onValueChange={setDirectBanque}
              >
                <SelectTrigger id={`${id}-banque-ansar`} className="mt-1">
                  <SelectValue placeholder="Afriland, CBC, UBA ou CCA" />
                </SelectTrigger>
                <SelectContent>
                  {ANSAR_BANQUES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Traçabilité uniquement.</p>
            </div>
          )}

          {isVersementIndirect(canonical) && (
            <div className="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20 p-3">
              <div>
                <Label>Entreprise *</Label>
                <ThirdPartyPicker
                  className="mt-1"
                  options={entreprises}
                  value={selectedEntrepriseId}
                  onValueChange={(id) => {
                    const nom = entreprises.find((e) => e.id === id)?.nom?.trim() || '';
                    setIndirectEntreprise(nom);
                  }}
                  placeholder="Choisir l’entreprise…"
                  searchPlaceholder="Nom, téléphone…"
                  orphanLabel={
                    !selectedEntrepriseId && indirect?.entreprise
                      ? indirect.entreprise
                      : undefined
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Entreprise chez qui le versement a été fait (fiche fournisseur).
                </p>
              </div>
              <div>
                <Label htmlFor={`${id}-banque-entreprise`}>Banque de l’entreprise *</Label>
                <Select
                  value={indirect?.banque || undefined}
                  onValueChange={setIndirectBanque}
                  disabled={!indirect?.entreprise}
                >
                  <SelectTrigger id={`${id}-banque-entreprise`} className="mt-1">
                    <SelectValue
                      placeholder={
                        indirect?.entreprise
                          ? 'Banque du versement'
                          : 'Choisis d’abord l’entreprise'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {ANSAR_BANQUES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
