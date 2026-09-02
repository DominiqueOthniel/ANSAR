import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownUp } from 'lucide-react';

export type ListSortOption = { value: string; label: string };

type ListSortSelectProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ListSortOption[];
  className?: string;
  /** Sans libellé au-dessus : aligné avec recherche / filtres sur une même ligne. */
  compact?: boolean;
};

export function ListSortSelect({
  id = 'list-sort',
  label = 'Tri',
  value,
  onChange,
  options,
  className,
  compact = false,
}: ListSortSelectProps) {
  if (compact) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={`h-10 ${className ?? 'w-full sm:min-w-[200px] sm:w-auto'}`}>
          <span className="flex items-center gap-1.5 truncate">
            <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <SelectValue placeholder="Tri" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 min-w-[180px] sm:min-w-[220px] ${className ?? ''}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground flex items-center gap-1">
        <ArrowDownUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue placeholder="Tri" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
