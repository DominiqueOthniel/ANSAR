import { cn } from '@/lib/utils';

/** Logo entreprise ANSA'R sarl — fichier servi depuis `public/logo-ansar.png`. */
export const APP_LOGO_SRC = `${import.meta.env.BASE_URL}logo-ansar.png`;

type AppLogoVariant = 'login' | 'sidebar' | 'header' | 'compact' | 'hero';

/**
 * Logo horizontal (texte rouge sur fond clair). Largeur prioritaire,
 * hauteur contrainte selon le contexte UI.
 */
const variantConfig: Record<
  AppLogoVariant,
  { wrapper: string; img: string }
> = {
  login: {
    wrapper: cn(
      'inline-flex items-center justify-center rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5',
      'bg-white shadow-2xl ring-2 ring-white/40',
    ),
    img: cn(
      'block object-contain object-center select-none',
      'h-12 sm:h-14 w-auto max-w-[min(16rem,78vw)]',
    ),
  },
  sidebar: {
    wrapper: cn(
      'inline-flex items-center justify-center shrink-0 rounded-lg overflow-hidden',
      'h-10 max-w-[9.5rem] px-1.5',
      'bg-white ring-1 ring-white/25 shadow-sm',
    ),
    img: cn('h-7 w-auto max-w-full object-contain object-center select-none'),
  },
  header: {
    wrapper: cn(
      'inline-flex items-center justify-center shrink-0 rounded-lg overflow-hidden',
      'h-9 max-h-9 max-w-[7.5rem] sm:h-10 sm:max-h-10 sm:max-w-[8.5rem] px-1.5',
      'bg-white ring-1 ring-border/70 shadow-sm',
    ),
    img: cn('h-6 sm:h-7 w-auto max-w-full object-contain object-center select-none'),
  },
  compact: {
    wrapper: cn(
      'inline-flex items-center justify-center rounded-md overflow-hidden h-7 max-w-[5.5rem] px-1',
      'bg-white ring-1 ring-border/60',
    ),
    img: cn('h-4 w-auto max-w-full object-contain object-center select-none'),
  },
  hero: {
    wrapper: cn(
      'inline-flex items-center justify-center rounded-xl px-3 py-2',
      'bg-white ring-1 ring-border/50 shadow-sm',
    ),
    img: cn(
      'block object-contain object-center select-none',
      'h-10 sm:h-12 w-auto max-w-[12rem]',
    ),
  },
};

export function AppLogo({
  variant = 'sidebar',
  className,
  alt = 'ANSA\'R sarl',
}: {
  variant?: AppLogoVariant;
  className?: string;
  alt?: string;
}) {
  const { wrapper, img } = variantConfig[variant];

  return (
    <span className={cn(wrapper, className)}>
      <img
        src={APP_LOGO_SRC}
        alt={alt}
        className={img}
        loading={variant === 'login' ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        fetchPriority={variant === 'login' ? 'high' : undefined}
      />
    </span>
  );
}
