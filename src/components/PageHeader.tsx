import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  gradient?: string;
  iconColor?: string;
  stats?: StatItem[];
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  icon: Icon,
  gradient = 'from-violet-500/15 via-purple-500/8 to-transparent',
  iconColor = 'from-violet-600 via-purple-600 to-indigo-700',
  stats,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06] mb-6 transition-[box-shadow,border-color] duration-300 ease-ios',
      className
    )}>
      {/* Gradient de fond */}
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-[0.55] sm:opacity-65', gradient)} />

      {/* Motif de points discret */}
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.035] bg-dot-pattern" />

      {/* Ligne décorative haute */}
      <div className={cn('absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent', iconColor.includes('violet') ? 'via-violet-500/45' : 'via-primary/45', 'to-transparent')} />

      {/* Contenu */}
      <div className="relative p-4 sm:p-6 md:p-8">
        {/* Titre + actions */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
          <div className="flex items-center gap-3 sm:gap-4">
            {Icon && (
              <div className="relative flex-shrink-0">
                <div className={cn('absolute inset-0 bg-gradient-to-br rounded-xl blur-md opacity-40', iconColor)} />
                <div className={cn('relative bg-gradient-to-br p-2.5 sm:p-3 rounded-xl shadow-md ring-1 ring-white/15', iconColor)}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-[1.65rem] font-semibold tracking-tight text-foreground leading-snug truncate">
                {title}
              </h1>
              {description && (
                <p className="text-muted-foreground text-xs sm:text-sm mt-1 sm:mt-1.5 max-w-2xl leading-relaxed line-clamp-3 sm:line-clamp-none">
                  {description}
                </p>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 w-full sm:w-auto min-w-0">
              {actions}
            </div>
          )}
        </div>

        {/* Stats */}
        {stats && stats.length > 0 && (
          <div
            className={cn(
              'grid gap-2 sm:gap-3',
              stats.length > 4
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
                : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4',
            )}
          >
            {stats.map((stat, i) => (
              <div
                key={i}
                className="group relative min-w-0 bg-background/80 dark:bg-background/35 backdrop-blur-sm border border-border/60 rounded-xl p-2.5 sm:p-4 hover:border-primary/35 hover:shadow-md transition-[box-shadow,border-color] duration-300 ease-ios"
              >
                <div className="flex items-start justify-between gap-2 mb-1 sm:mb-2">
                  <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-0 flex-1 break-words leading-snug">
                    {stat.label}
                  </p>
                  {stat.icon && (
                    <div className={cn('p-1 sm:p-1.5 rounded-lg bg-primary/10 flex-shrink-0', stat.color)}>
                      {stat.icon}
                    </div>
                  )}
                </div>
                <p
                  className={cn(
                    'text-sm sm:text-lg md:text-xl font-bold tracking-tight break-words whitespace-normal leading-snug tabular-nums',
                    stat.color || 'text-foreground',
                  )}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ligne décorative basse */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </div>
  );
}

export function StatBadge({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const variants = {
    default: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    danger:  'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  };
  return (
    <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border', variants[variant])}>
      <span className="text-xs opacity-60">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
