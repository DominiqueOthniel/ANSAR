import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { TripMissionActivity } from '@/lib/trip-mission-context';
import {
  formatDeliveryActivityLine,
  formatLoadingActivityLine,
} from '@/lib/trip-mission-context';
import { ClipboardList, Package, Truck } from 'lucide-react';

type Props = {
  activity: TripMissionActivity;
  truckLabel?: string;
  compact?: boolean;
};

/**
 * Rappelle l’activité Marchandises / Clients déjà sur le camion.
 * Le trajet reste la mission flotte (P&L), pas un second bon de commande.
 */
export function TripMissionContextPanel({ activity, truckLabel, compact }: Props) {
  const empty = activity.loadingsCount === 0 && activity.deliveriesCount === 0;

  return (
    <div
      className={
        compact
          ? 'rounded-lg border border-teal-500/25 bg-teal-500/5 dark:bg-teal-950/20 p-2.5 text-xs space-y-1.5'
          : 'rounded-xl border border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/25 p-3 space-y-3'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
        <span className="font-medium text-teal-900 dark:text-teal-100">
          Activité sur {truckLabel || 'ce camion'}
        </span>
        <Badge variant="outline" className="font-normal text-[10px]">
          {activity.summaryLine}
        </Badge>
      </div>

      {!compact && (
        <p className="text-xs text-muted-foreground leading-snug">
          Les bons et livraisons restent gérés dans Chargements / Clients. Ici tu vois
          ce qui tourne déjà sur le même véhicule pour éviter le double emploi.
        </p>
      )}

      {empty ? (
        <p className="text-xs text-muted-foreground">
          Aucun bon ni livraison rattaché à ce camion pour l’instant.{' '}
          <Link to="/chargements" className="underline underline-offset-2 text-teal-700 dark:text-teal-300">
            Voir les chargements
          </Link>
        </p>
      ) : (
        <div className={compact ? 'space-y-1' : 'grid gap-2 sm:grid-cols-2'}>
          {activity.loadings.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" /> Bons
              </p>
              <ul className="space-y-0.5">
                {activity.loadings.slice(0, compact ? 2 : 5).map((l) => (
                  <li key={l.id} className="text-xs text-foreground/90 truncate">
                    {formatLoadingActivityLine(l)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activity.deliveries.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <ClipboardList className="h-3 w-3" /> Livraisons
              </p>
              <ul className="space-y-0.5">
                {activity.deliveries.slice(0, compact ? 2 : 5).map((d) => (
                  <li key={d.id} className="text-xs text-foreground/90 truncate">
                    {formatDeliveryActivityLine(d)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            to="/chargements"
            className="text-xs underline underline-offset-2 text-teal-700 dark:text-teal-300"
          >
            Chargements
          </Link>
          <Link
            to="/clients"
            className="text-xs underline underline-offset-2 text-teal-700 dark:text-teal-300"
          >
            Clients
          </Link>
          <Link
            to="/camions"
            className="text-xs underline underline-offset-2 text-teal-700 dark:text-teal-300"
          >
            Fiche camion
          </Link>
        </div>
      )}
    </div>
  );
}
