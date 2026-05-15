import * as React from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value = 0, onChange, min, max, onFocus, onBlur, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(value.toString());
    const [isFocused, setIsFocused] = React.useState(false);

    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(value.toString());
      }
    }, [value, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Si la valeur est 0, effacer le champ
      if (value === 0) {
        setDisplayValue('');
      } else {
        setDisplayValue(value.toString());
      }
      // Sélectionner tout le texte
      e.target.select();
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      const numValue = parseFloat(displayValue) || 0;
      
      // Appliquer les limites min/max
      let finalValue = numValue;
      if (min !== undefined && finalValue < min) finalValue = min;
      if (max !== undefined && finalValue > max) finalValue = max;
      
      setDisplayValue(finalValue.toString());
      onChange?.(finalValue);
      onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      // Permettre les nombres, le point décimal et le moins (pour les négatifs)
      if (newValue === '' || newValue === '-' || /^-?\d*\.?\d*$/.test(newValue)) {
        setDisplayValue(newValue);

        const numValue = parseFloat(newValue);
        if (!isNaN(numValue)) {
          let v = numValue;
          if (min !== undefined && v < min) v = min;
          if (max !== undefined && v > max) v = max;
          if (v !== numValue) {
            setDisplayValue(v.toString());
          }
          onChange?.(v);
        } else if (newValue === '') {
          onChange?.(0);
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



