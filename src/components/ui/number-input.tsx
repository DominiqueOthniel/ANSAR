import * as React from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: number;
  onChange?: (value: number | undefined) => void;
  min?: number;
  max?: number;
  /** Si true, champ vide → undefined (sinon → 0). */
  allowEmpty?: boolean;
}

function formatDisplayValue(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  return String(value);
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, min, max, allowEmpty = false, onFocus, onBlur, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatDisplayValue(value));
    const [isFocused, setIsFocused] = React.useState(false);

    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(formatDisplayValue(value));
      }
    }, [value, isFocused]);

    const commitValue = (raw: string): number | undefined => {
      if (raw === '' || raw === '-') {
        return allowEmpty ? undefined : 0;
      }
      const numValue = parseFloat(raw);
      if (Number.isNaN(numValue)) {
        return allowEmpty ? undefined : 0;
      }
      let finalValue = numValue;
      if (min !== undefined && finalValue < min) finalValue = min;
      if (max !== undefined && finalValue > max) finalValue = max;
      return finalValue;
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      if (value == null || value === 0) {
        setDisplayValue(value === 0 ? '0' : '');
      } else {
        setDisplayValue(String(value));
      }
      e.target.select();
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      const finalValue = commitValue(displayValue);
      setDisplayValue(formatDisplayValue(finalValue ?? (allowEmpty ? undefined : 0)));
      onChange?.(finalValue);
      onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (newValue === '' || newValue === '-' || /^-?\d*\.?\d*$/.test(newValue)) {
        setDisplayValue(newValue);

        if (newValue === '' || newValue === '-') {
          if (allowEmpty) onChange?.(undefined);
          return;
        }

        const numValue = parseFloat(newValue);
        if (!Number.isNaN(numValue)) {
          let v = numValue;
          if (min !== undefined && v < min) v = min;
          if (max !== undefined && v > max) v = max;
          if (v !== numValue) {
            setDisplayValue(String(v));
          }
          onChange?.(v);
        }
      }
    };

    return (
      <Input
        type="text"
        inputMode="numeric"
        ref={ref}
        className={cn(className)}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);

NumberInput.displayName = "NumberInput";

export { NumberInput };



