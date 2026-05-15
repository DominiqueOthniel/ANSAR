import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ThirdParty } from '@/contexts/AppContext';
import { frCollator, stableSort } from '@/lib/list-sort';

export interface ThirdPartyPickerTopChoice {
  id: string;
  label: string;
  keywords?: string;
}

export interface ThirdPartyPickerProps {
  options: ThirdParty[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Lignes affichées en premier (ex. « Tous », « Sans », « Sans fiche »). */
  topChoices?: ThirdPartyPickerTopChoice[];
  /** Affiché si le texte ne correspond à aucune fiche (saisie libre conservée). */
  orphanLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-labelledby'?: string;
  /** Déclencheur compact (ex. ligne dans un formulaire dense). */
  triggerSize?: 'default' | 'sm';
}

function formatTierSubtitle(tp: ThirdParty): string {
  const bits = [tp.telephone, tp.email].filter(Boolean) as string[];
  return bits.join(' · ');
}

export function ThirdPartyPicker({
  options,
  value,
  onValueChange,
  placeholder = 'Rechercher et choisir…',
  searchPlaceholder = 'Nom, téléphone, e-mail…',
  topChoices,
  orphanLabel,
  disabled = false,
  className,
  id,
  'aria-labelledby': ariaLabelledBy,
  triggerSize = 'default',
}: ThirdPartyPickerProps) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => stableSort([...options], (a, b) => frCollator.compare(a.nom, b.nom)),
    [options],
  );

  const selectedTop = topChoices?.find((c) => c.id === value);
  const selectedTier = sorted.find((t) => t.id === value);
  const orphan = orphanLabel?.trim();

  const triggerLabel = selectedTop
    ? selectedTop.label
    : selectedTier
      ? `${selectedTier.nom}${selectedTier.telephone ? ` — ${selectedTier.telephone}` : ''}`
      : orphan || placeholder;

  const hasTop = topChoices && topChoices.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size={triggerSize === 'sm' ? 'sm' : 'default'}
          role="combobox"
          aria-expanded={open}
          aria-labelledby={ariaLabelledBy}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-left min-w-0',
            !selectedTier && !selectedTop && !orphan && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(100vw-1.5rem,28rem)]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            {hasTop && (
              <CommandGroup heading="Sélection rapide">
                {topChoices!.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.label} ${c.keywords ?? ''}`}
                    onSelect={() => {
                      onValueChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                    {c.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {hasTop && sorted.length > 0 ? <CommandSeparator /> : null}
            {sorted.length > 0 ? (
              <CommandGroup heading={hasTop ? 'Fiches Tiers' : undefined}>
                {sorted.map((tp) => {
                  const sub = formatTierSubtitle(tp);
                  return (
                    <CommandItem
                      key={tp.id}
                      value={`${tp.nom} ${tp.telephone ?? ''} ${tp.email ?? ''} ${tp.adresse ?? ''}`}
                      onSelect={() => {
                        onValueChange(tp.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn('mr-2 h-4 w-4 shrink-0', value === tp.id ? 'opacity-100' : 'opacity-0')}
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate font-medium">{tp.nom}</span>
                        {sub ? (
                          <span className="truncate text-xs text-muted-foreground">{sub}</span>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
