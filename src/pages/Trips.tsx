import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useApp, Trip, TripStatus, TripStop, TripStopType, TripStopStatut } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, MapPin, Route, CheckCircle, Clock, XCircle, FileText, Filter, X, Search, Download, Eye, DollarSign, Loader2, ListOrdered, ChevronUp, ChevronDown, Pencil, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { canDeleteTrip, calculateTripStats, formatTripStatusFr, getTripRemainingRecetteToInvoice, sumMontantTTCForTripInvoices } from '@/lib/sync-utils';
import CityPicker, { CAMEROON_CITIES } from '@/components/CityPicker';
import PageHeader from '@/components/PageHeader';
import { PAGE_TRAJETS_DESCRIPTION } from '@/lib/metier-activite';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import {
  buildStopsForPersist,
  stopsSummaryLine,
  newTripStop,
  initialStopsDraftFromTrip,
  labelTripStopType,
  labelTripStopStatut,
} from '@/lib/trip-stops';
import { CEMENT_MARCHANDISE_SUGGESTIONS } from '@/lib/cement-marchandise-suggestions';

const TRIP_STATUT_ORDER: Record<TripStatus, number> = {
  planifie: 0,
  en_cours: 1,
  termine: 2,
  annule: 3,
};

const TRIP_SORT_OPTIONS = [
  { value: 'date_depart_desc', label: 'Date départ (récent → ancien)' },
  { value: 'date_depart_asc', label: 'Date départ (ancien → récent)' },
  { value: 'recette_desc', label: 'Recette (plus haut → plus bas)' },
  { value: 'recette_asc', label: 'Recette (plus bas → plus haut)' },
  { value: 'itineraire_asc', label: 'Itinéraire A → Z' },
  { value: 'itineraire_desc', label: 'Itinéraire Z → A' },
  { value: 'client_asc', label: 'Client A → Z' },
  { value: 'client_desc', label: 'Client Z → A' },
  { value: 'chauffeur_asc', label: 'Chauffeur A → Z' },
  { value: 'chauffeur_desc', label: 'Chauffeur Z → A' },
  { value: 'statut_asc', label: 'Statut (planifié → annulé)' },
  { value: 'statut_desc', label: 'Statut (annulé → planifié)' },
] as const;

type GeoPoint = { lat: number; lng: number };

function getCityCoords(cityName?: string): GeoPoint | null {
  if (!cityName) return null;
  const city = CAMEROON_CITIES.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  if (!city) return null;
  return { lat: city.lat, lng: city.lng };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(R * c);
}

function getRouteKey(a: GeoPoint, b: GeoPoint): string {
  return `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
}

async function getRoadDistanceKm(a: GeoPoint, b: GeoPoint): Promise<number | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: Array<{ distance?: number }>;
    };
    const meters = json.routes?.[0]?.distance;
    if (!meters || meters <= 0) return null;
    return Math.round(meters / 1000);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function Trips() {
  const {
    trips,
    trucks,
    drivers,
    invoices,
    expenses,
    thirdParties,
    createTrip,
    updateTrip,
    deleteTrip,
    createExpense,
  } = useApp();
  const navigate = useNavigate();
  const { canManageFleet, canManageAccounting } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  /** Si défini, le formulaire du dialogue est en mode édition pour ce trajet. */
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [isOriginPickerOpen, setIsOriginPickerOpen] = useState(false);
  const [isDestinationPickerOpen, setIsDestinationPickerOpen] = useState(false);
  const [isExpensesDialogOpen, setIsExpensesDialogOpen] = useState(false);
  const [selectedTripForExpenses, setSelectedTripForExpenses] = useState<Trip | null>(null);
  const [isStopsDialogOpen, setIsStopsDialogOpen] = useState(false);
  const [stopsDialogTrip, setStopsDialogTrip] = useState<Trip | null>(null);
  const [stopsDraft, setStopsDraft] = useState<TripStop[]>([]);
  const { isSubmitting, withGuard } = useSubmitGuard();
  
  // États pour les filtres
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  const [filterDestination, setFilterDestination] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<TripStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [listSort, setListSort] = useState<string>('date_depart_desc');
  const [roadDistances, setRoadDistances] = useState<Record<string, number>>({});
  const [formRoadDistance, setFormRoadDistance] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    tracteurId: '',
    remorqueuseId: '',
    origine: '',
    destination: '',
    origineLat: undefined as number | undefined,
    origineLng: undefined as number | undefined,
    destinationLat: undefined as number | undefined,
    destinationLng: undefined as number | undefined,
    chauffeurId: '',
    dateDepart: '',
    dateArrivee: '',
    recette: 0,
    prefinancement: 0,
    client: '',
    marchandise: '',
    description: '',
    referenceAtc: '',
    destinataire: '',
    quantiteChargee: undefined as number | undefined,
    retourBordereaux: '',
    statut: 'planifie' as TripStatus,
    stops: [] as TripStop[],
  });

  const truckIdsInMission = useMemo(() => {
    const ids = new Set<string>();
    trips
      .filter(
        (t) =>
          (t.statut === 'en_cours' || t.statut === 'planifie') &&
          (!editingTripId || t.id !== editingTripId),
      )
      .forEach((trip) => {
        if (trip.tracteurId) ids.add(trip.tracteurId);
        if (trip.remorqueuseId) ids.add(trip.remorqueuseId);
      });
    return ids;
  }, [trips, editingTripId]);

  const tracteurs = trucks.filter(
    (t) => t.type === 'tracteur' && t.statut === 'actif' && !truckIdsInMission.has(t.id),
  );

  const remorqueuses = trucks.filter(
    (t) => t.type === 'remorqueuse' && t.statut === 'actif' && !truckIdsInMission.has(t.id),
  );

  const driverIdsInMission = useMemo(() => {
    const ids = new Set<string>();
    trips
      .filter(
        (t) =>
          (t.statut === 'en_cours' || t.statut === 'planifie') &&
          (!editingTripId || t.id !== editingTripId),
      )
      .forEach((trip) => {
        if (trip.chauffeurId) ids.add(trip.chauffeurId);
      });
    return ids;
  }, [trips, editingTripId]);

  const availableDrivers = drivers.filter((d) => !driverIdsInMission.has(d.id));

  const resetForm = () => {
    setFormData({
      tracteurId: '',
      remorqueuseId: '',
      origine: '',
      destination: '',
      origineLat: undefined,
      origineLng: undefined,
      destinationLat: undefined,
      destinationLng: undefined,
      chauffeurId: '',
      dateDepart: '',
      dateArrivee: '',
      recette: 0,
      prefinancement: 0,
      client: '',
      marchandise: '',
      description: '',
      referenceAtc: '',
      destinataire: '',
      quantiteChargee: undefined,
      retourBordereaux: '',
      statut: 'planifie' as TripStatus,
      stops: [],
    });
    setEditingTripId(null);
  };

  const normDate = (d: string) => (d && d.includes('T') ? d.split('T')[0] : d) || '';

  const openEditTrip = (trip: Trip) => {
    setEditingTripId(trip.id);
    setFormData({
      tracteurId: trip.tracteurId ?? '',
      remorqueuseId: trip.remorqueuseId ?? '',
      origine: trip.origine,
      destination: trip.destination,
      origineLat: trip.origineLat,
      origineLng: trip.origineLng,
      destinationLat: trip.destinationLat,
      destinationLng: trip.destinationLng,
      chauffeurId: trip.chauffeurId,
      dateDepart: normDate(trip.dateDepart),
      dateArrivee: trip.dateArrivee ? normDate(trip.dateArrivee) : '',
      recette: trip.recette,
      prefinancement: trip.prefinancement ?? 0,
      client: trip.client ?? '',
      marchandise: trip.marchandise ?? '',
      description: trip.description ?? '',
      referenceAtc: trip.referenceAtc ?? '',
      destinataire: trip.destinataire ?? '',
      quantiteChargee: trip.quantiteChargee,
      retourBordereaux: trip.retourBordereaux ?? '',
      statut: trip.statut,
      stops: initialStopsDraftFromTrip(trip),
    });
    setIsDialogOpen(true);
  };

  const duplicateTripAsDraft = (trip: Trip) => {
    setEditingTripId(null);
    const today = new Date().toISOString().split('T')[0];
    const draftStops = initialStopsDraftFromTrip(trip).map((s, i) =>
      newTripStop(i, s.type, s.lieu, {
        lat: s.lat,
        lng: s.lng,
        clientRef: s.clientRef,
        notes: s.notes,
        statut: 'prevu',
      }),
    );
    setFormData({
      tracteurId: trip.tracteurId ?? '',
      remorqueuseId: trip.remorqueuseId ?? '',
      origine: trip.origine,
      destination: trip.destination,
      origineLat: trip.origineLat,
      origineLng: trip.origineLng,
      destinationLat: trip.destinationLat,
      destinationLng: trip.destinationLng,
      chauffeurId: trip.chauffeurId,
      dateDepart: today,
      dateArrivee: '',
      recette: trip.recette,
      prefinancement: 0,
      client: trip.client ?? '',
      marchandise: trip.marchandise ?? '',
      description: trip.description ? `Copie · ${trip.description}` : '',
      referenceAtc: trip.referenceAtc ?? '',
      destinataire: trip.destinataire ?? '',
      quantiteChargee: trip.quantiteChargee,
      retourBordereaux: trip.retourBordereaux ?? '',
      statut: 'planifie',
      stops: draftStops,
    });
    setIsDialogOpen(true);
    toast.info('Modèle dupliqué : vérifiez dates, véhicule et recette avant enregistrement.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tracteurId && !formData.remorqueuseId) {
      toast.error('Veuillez sélectionner au moins un tracteur ou une remorqueuse');
      return;
    }

    if (!formData.origine || !formData.destination) {
      toast.error('Veuillez remplir l\'origine et la destination');
      return;
    }

    if (!formData.chauffeurId) {
      toast.error('Veuillez sélectionner un chauffeur');
      return;
    }

    if (!formData.dateDepart) {
      toast.error('Veuillez sélectionner la date de départ');
      return;
    }

    await withGuard(async () => {
      try {
        const stopsPayload = buildStopsForPersist(
          formData.stops,
          formData.origine,
          formData.destination,
          formData.origineLat,
          formData.origineLng,
          formData.destinationLat,
          formData.destinationLng,
        );

        if (editingTripId) {
          const sumT = sumMontantTTCForTripInvoices(editingTripId, invoices);
          if (formData.recette + 0.01 < sumT) {
            toast.error(
              `Recette minimale ${sumT.toLocaleString('fr-FR')} FCFA (déjà facturé en TTC sur ce trajet).`,
            );
            return;
          }
          await updateTrip(editingTripId, {
            origine: formData.origine,
            destination: formData.destination,
            origineLat: formData.origineLat,
            origineLng: formData.origineLng,
            destinationLat: formData.destinationLat,
            destinationLng: formData.destinationLng,
            chauffeurId: formData.chauffeurId,
            dateDepart: formData.dateDepart,
            dateArrivee: formData.dateArrivee || undefined,
            recette: formData.recette,
            prefinancement: formData.prefinancement > 0 ? formData.prefinancement : undefined,
            tracteurId: formData.tracteurId || undefined,
            remorqueuseId: formData.remorqueuseId || undefined,
            client: formData.client || undefined,
            marchandise: formData.marchandise || undefined,
            description: formData.description || undefined,
            referenceAtc: formData.referenceAtc?.trim() || undefined,
            destinataire: formData.destinataire?.trim() || undefined,
            quantiteChargee:
              formData.quantiteChargee != null && formData.quantiteChargee > 0
                ? formData.quantiteChargee
                : undefined,
            retourBordereaux: formData.retourBordereaux?.trim() || undefined,
            stops: stopsPayload,
          });
          toast.success('Trajet mis à jour');
          setIsDialogOpen(false);
          resetForm();
          return;
        }

        const createdTrip = await createTrip({
          origine: formData.origine,
          destination: formData.destination,
          origineLat: formData.origineLat,
          origineLng: formData.origineLng,
          destinationLat: formData.destinationLat,
          destinationLng: formData.destinationLng,
          chauffeurId: formData.chauffeurId,
          dateDepart: formData.dateDepart,
          dateArrivee: formData.dateArrivee || undefined,
          recette: formData.recette,
          prefinancement: formData.prefinancement > 0 ? formData.prefinancement : undefined,
          tracteurId: formData.tracteurId || undefined,
          remorqueuseId: formData.remorqueuseId || undefined,
          client: formData.client || undefined,
          marchandise: formData.marchandise || undefined,
          description: formData.description || undefined,
          referenceAtc: formData.referenceAtc?.trim() || undefined,
          destinataire: formData.destinataire?.trim() || undefined,
          quantiteChargee:
            formData.quantiteChargee != null && formData.quantiteChargee > 0
              ? formData.quantiteChargee
              : undefined,
          retourBordereaux: formData.retourBordereaux?.trim() || undefined,
          statut: 'planifie',
          stops: stopsPayload,
        });
        if (formData.prefinancement > 0) {
          try {
            await createExpense({
              camionId: formData.tracteurId || formData.remorqueuseId || undefined,
              tripId: createdTrip.id,
              chauffeurId: formData.chauffeurId || undefined,
              categorie: 'Préfinancement',
              sousCategorie: 'Trajet',
              montant: formData.prefinancement,
              date: formData.dateDepart,
              description: `Préfinancement trajet ${formData.origine} → ${formData.destination}`,
            });
          } catch (prefiErr) {
            console.error('createTrip prefinancement expense', prefiErr);
            toast.warning(
              'Trajet créé, mais la dépense de préfinancement n’a pas pu être enregistrée automatiquement.',
            );
          }
        }
        toast.success('Trajet ajouté avec succès');
        setIsDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement');
      }
    });
  };

  const getTruckLabel = (id?: string) => {
    if (!id) return '-';
    const truck = trucks.find(t => t.id === id);
    return truck ? truck.immatriculation : '-';
  };

  const getDriverLabel = (id: string) => {
    const driver = drivers.find(d => d.id === id);
    return driver ? `${driver.prenom} ${driver.nom}` : '-';
  };

  const handleUpdateStatus = async (tripId: string, newStatus: TripStatus, currentStatus: TripStatus) => {
    const statusOrder: TripStatus[] = ['planifie', 'en_cours', 'termine', 'annule'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const newIndex = statusOrder.indexOf(newStatus);

    if (newIndex < currentIndex && newStatus !== 'annule') {
      toast.error('Vous ne pouvez pas revenir à un statut antérieur');
      return;
    }

    if (currentStatus === 'planifie' && newStatus === 'termine') {
      toast.error('Vous devez d\'abord passer par "En cours"');
      return;
    }

    if (currentStatus === 'termine') {
      toast.error('Un trajet terminé ne peut pas être modifié');
      return;
    }

    if (currentStatus === 'annule' && newStatus !== 'annule') {
      toast.error('Un trajet annulé ne peut pas être modifié');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const trip = trips.find(t => t.id === tripId);
    const payload = newStatus === 'termine' ? { statut: newStatus, dateArrivee: today } : { statut: newStatus };

    try {
      await updateTrip(tripId, payload);
      toast.success(newStatus === 'annule' ? 'Trajet annulé' : newStatus === 'termine' ? 'Trajet terminé' : 'Statut mis à jour');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!canDeleteTrip(tripId, invoices)) {
      toast.error('Impossible de supprimer ce trajet : une facture y est associée. Supprimez d\'abord la facture.');
      return;
    }

    const trip = trips.find(t => t.id === tripId);
    if (trip && confirm(`Êtes-vous sûr de vouloir supprimer le trajet ${trip.origine} → ${trip.destination} ?`)) {
      try {
        await deleteTrip(tripId);
        toast.success('Trajet supprimé');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      }
    }
  };

  const openTripInvoicing = (tripId: string) => {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (trip.recette <= 0) {
      toast.error('Impossible de facturer : la recette du trajet doit être supérieure à 0 FCFA');
      return;
    }
    const reste = getTripRemainingRecetteToInvoice(trip, invoices);
    if (reste <= 0.01) {
      toast.error('La recette de ce trajet est déjà entièrement facturée (somme des TTC).');
      return;
    }
    navigate(`/factures?create=1&trajetId=${encodeURIComponent(tripId)}`);
  };

  const openStopsDialog = (trip: Trip) => {
    setStopsDialogTrip(trip);
    setStopsDraft(initialStopsDraftFromTrip(trip));
    setIsStopsDialogOpen(true);
  };

  const handleSaveStopsDraft = async () => {
    if (!stopsDialogTrip) return;
    if (stopsDraft.length === 0) {
      toast.error('Ajoutez au moins un arrêt ou annulez.');
      return;
    }
    if (stopsDraft.some((s) => !s.lieu.trim())) {
      toast.error('Chaque arrêt doit avoir un lieu renseigné.');
      return;
    }
    await withGuard(async () => {
      try {
        const ordered = stopsDraft.map((s, i) => ({ ...s, ordre: i }));
        await updateTrip(stopsDialogTrip.id, { stops: ordered });
        toast.success('Arrêts du trajet enregistrés');
        setIsStopsDialogOpen(false);
        setStopsDialogTrip(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement');
      }
    });
  };

  const moveFormStop = (index: number, delta: -1 | 1) => {
    setFormData((prev) => {
      const arr = [...prev.stops];
      const j = index + delta;
      if (j < 0 || j >= arr.length) return prev;
      const a = arr[index];
      const b = arr[j];
      arr[index] = b;
      arr[j] = a;
      return { ...prev, stops: arr.map((s, i) => ({ ...s, ordre: i })) };
    });
  };

  const removeFormStop = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      stops: prev.stops
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, ordre: i })),
    }));
  };

  const addFormStop = () => {
    setFormData((prev) => ({
      ...prev,
      stops: [...prev.stops, newTripStop(prev.stops.length, 'livraison', '')],
    }));
  };

  const syncFormStopsFromOrigineDest = () => {
    setFormData((prev) => ({
      ...prev,
      stops: [
        newTripStop(0, 'chargement', prev.origine.trim() || 'Chargement', {
          lat: prev.origineLat,
          lng: prev.origineLng,
        }),
        newTripStop(1, 'livraison', prev.destination.trim() || 'Livraison', {
          lat: prev.destinationLat,
          lng: prev.destinationLng,
        }),
      ],
    }));
  };

  const moveDraftStop = (index: number, delta: -1 | 1) => {
    setStopsDraft((prev) => {
      const arr = [...prev];
      const j = index + delta;
      if (j < 0 || j >= arr.length) return prev;
      const tmp = arr[index];
      arr[index] = arr[j];
      arr[j] = tmp;
      return arr.map((s, i) => ({ ...s, ordre: i }));
    });
  };

  const removeDraftStop = (index: number) => {
    setStopsDraft((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, ordre: i })),
    );
  };

  const addDraftStop = () => {
    setStopsDraft((prev) => [...prev, newTripStop(prev.length, 'livraison', '')]);
  };

  const getStatusBadge = (statut: TripStatus) => {
    const colors = {
      planifie: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      en_cours: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      termine: 'bg-green-500/10 text-green-700 dark:text-green-400',
      annule: 'bg-red-500/10 text-red-700 dark:text-red-400',
    };
    const labels = {
      planifie: 'Planifié',
      en_cours: 'En cours',
      termine: 'Terminé',
      annule: 'Annulé',
    };
    return (
      <Badge className={colors[statut]}>
        {labels[statut]}
      </Badge>
    );
  };

  // Extraire toutes les villes uniques depuis les trajets
  const allOrigins = useMemo(
    () => Array.from(new Set(trips.map(t => t.origine).filter(Boolean))).sort(),
    [trips],
  );
  const allDestinations = useMemo(
    () => Array.from(new Set(trips.map(t => t.destination).filter(Boolean))).sort(),
    [trips],
  );
  
  // Appliquer les filtres
  const filteredTrips = useMemo(
    () =>
      trips.filter(trip => {
        // Filtre par origine
        if (filterOrigin !== 'all' && trip.origine !== filterOrigin) return false;
        
        // Filtre par destination
        if (filterDestination !== 'all' && trip.destination !== filterDestination) return false;
        
        // Filtre par statut
        if (filterStatus !== 'all' && trip.statut !== filterStatus) return false;
        
        // Recherche générale (client, marchandise, description, itinéraire)
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          const matchesClient = trip.client?.toLowerCase().includes(search);
          const matchesMarchandise = trip.marchandise?.toLowerCase().includes(search);
          const matchesDescription = trip.description?.toLowerCase().includes(search);
          const matchesItineraire = `${trip.origine} → ${trip.destination}`.toLowerCase().includes(search);
          const matchesChauffeur = getDriverLabel(trip.chauffeurId).toLowerCase().includes(search);
          const matchesRefAtc = trip.referenceAtc?.toLowerCase().includes(search);
          const matchesDest = trip.destinataire?.toLowerCase().includes(search);
          const matchesRetourB = trip.retourBordereaux?.toLowerCase().includes(search);
          const matchesQty =
            trip.quantiteChargee != null && String(trip.quantiteChargee).includes(search);
          const matchesStops =
            trip.stops?.some((s) =>
              [s.lieu, s.clientRef, s.notes]
                .filter(Boolean)
                .some((f) => String(f).toLowerCase().includes(search)),
            ) ?? false;

          if (
            !matchesClient &&
            !matchesMarchandise &&
            !matchesDescription &&
            !matchesItineraire &&
            !matchesChauffeur &&
            !matchesRefAtc &&
            !matchesDest &&
            !matchesRetourB &&
            !matchesQty &&
            !matchesStops
          ) {
            return false;
          }
        }
        
        return true;
      }),
    [trips, filterOrigin, filterDestination, filterStatus, searchTerm],
  );

  const driverLabel = (id: string) => {
    const driver = drivers.find(d => d.id === id);
    return driver ? `${driver.prenom} ${driver.nom}` : '';
  };

  const sortedTrips = useMemo(() => {
    const list = [...filteredTrips];
    switch (listSort) {
      case 'date_depart_asc':
        return stableSort(list, (a, b) => parseDateMs(a.dateDepart) - parseDateMs(b.dateDepart));
      case 'recette_desc':
        return stableSort(list, (a, b) => b.recette - a.recette);
      case 'recette_asc':
        return stableSort(list, (a, b) => a.recette - b.recette);
      case 'itineraire_asc':
        return stableSort(list, (a, b) =>
          frCollator.compare(`${a.origine} → ${a.destination}`, `${b.origine} → ${b.destination}`),
        );
      case 'itineraire_desc':
        return stableSort(list, (a, b) =>
          frCollator.compare(`${b.origine} → ${b.destination}`, `${a.origine} → ${a.destination}`),
        );
      case 'client_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.client || '', b.client || ''));
      case 'client_desc':
        return stableSort(list, (a, b) => frCollator.compare(b.client || '', a.client || ''));
      case 'chauffeur_asc':
        return stableSort(list, (a, b) => frCollator.compare(driverLabel(a.chauffeurId), driverLabel(b.chauffeurId)));
      case 'chauffeur_desc':
        return stableSort(list, (a, b) => frCollator.compare(driverLabel(b.chauffeurId), driverLabel(a.chauffeurId)));
      case 'statut_asc':
        return stableSort(list, (a, b) => TRIP_STATUT_ORDER[a.statut] - TRIP_STATUT_ORDER[b.statut]);
      case 'statut_desc':
        return stableSort(list, (a, b) => TRIP_STATUT_ORDER[b.statut] - TRIP_STATUT_ORDER[a.statut]);
      case 'date_depart_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.dateDepart) - parseDateMs(a.dateDepart));
    }
  }, [filteredTrips, listSort, drivers]);

  const tripCoordsById = useMemo(() => {
    const map = new Map<string, { origin: GeoPoint; destination: GeoPoint }>();
    for (const t of trips) {
      const origin =
        t.origineLat != null && t.origineLng != null
          ? { lat: t.origineLat, lng: t.origineLng }
          : getCityCoords(t.origine);
      const destination =
        t.destinationLat != null && t.destinationLng != null
          ? { lat: t.destinationLat, lng: t.destinationLng }
          : getCityCoords(t.destination);
      if (origin && destination) {
        map.set(t.id, { origin, destination });
      }
    }
    return map;
  }, [trips]);

  useEffect(() => {
    const uniqueRoutes = new Map<string, { origin: GeoPoint; destination: GeoPoint }>();
    for (const t of sortedTrips) {
      const coords = tripCoordsById.get(t.id);
      if (!coords) continue;
      const key = getRouteKey(coords.origin, coords.destination);
      if (!roadDistances[key] && !uniqueRoutes.has(key)) {
        uniqueRoutes.set(key, coords);
      }
    }
    if (uniqueRoutes.size === 0) return;

    let cancelled = false;
    const load = async () => {
      const updates: Record<string, number> = {};
      for (const [key, coords] of uniqueRoutes) {
        const km = await getRoadDistanceKm(coords.origin, coords.destination);
        if (km != null) updates[key] = km;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setRoadDistances((prev) => ({ ...prev, ...updates }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sortedTrips, tripCoordsById, roadDistances]);

  useEffect(() => {
    const origin =
      formData.origineLat != null && formData.origineLng != null
        ? { lat: formData.origineLat, lng: formData.origineLng }
        : getCityCoords(formData.origine);
    const destination =
      formData.destinationLat != null && formData.destinationLng != null
        ? { lat: formData.destinationLat, lng: formData.destinationLng }
        : getCityCoords(formData.destination);

    if (!origin || !destination || formData.origine === formData.destination) {
      setFormRoadDistance(null);
      return;
    }
    const key = getRouteKey(origin, destination);
    if (roadDistances[key]) {
      setFormRoadDistance(roadDistances[key]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const km = await getRoadDistanceKm(origin, destination);
      if (!cancelled) {
        if (km != null) {
          setRoadDistances((prev) => ({ ...prev, [key]: km }));
          setFormRoadDistance(km);
        } else {
          setFormRoadDistance(haversineDistanceKm(origin, destination));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    formData.origine,
    formData.destination,
    formData.origineLat,
    formData.origineLng,
    formData.destinationLat,
    formData.destinationLng,
    roadDistances,
  ]);

  const getTripDistanceKm = (trip: Trip): number | null => {
    const coords = tripCoordsById.get(trip.id);
    if (!coords) return null;
    const key = getRouteKey(coords.origin, coords.destination);
    if (roadDistances[key]) return roadDistances[key];
    return haversineDistanceKm(coords.origin, coords.destination);
  };

  const completedTrips = trips.filter(t => t.statut === 'termine').length;
  const ongoingTrips = trips.filter(t => t.statut === 'en_cours').length;
  const plannedTrips = trips.filter(t => t.statut === 'planifie').length;
  const cancelledTrips = trips.filter(t => t.statut === 'annule').length;
  // Encaissements à partir des montants payés uniquement
  const totalRevenue = trips.filter(t => t.statut === 'termine').reduce((sum, t) => {
    const tripInvoices = invoices.filter(inv => inv.trajetId === t.id);
    const paidAmount = tripInvoices.reduce((paid, inv) => paid + (inv.montantPaye || 0), 0);
    return sum + paidAmount;
  }, 0);
  
  const filtersDescription = useMemo(() => {
    const parts: string[] = [];
    parts.push(`Origine: ${filterOrigin === 'all' ? 'Toutes' : filterOrigin}`);
    parts.push(`Destination: ${filterDestination === 'all' ? 'Toutes' : filterDestination}`);
    parts.push(
      `Statut: ${
        filterStatus === 'all'
          ? 'Tous'
          : filterStatus === 'planifie'
          ? 'Planifié'
          : filterStatus === 'en_cours'
          ? 'En cours'
          : filterStatus === 'termine'
          ? 'Terminé'
          : 'Annulé'
      }`,
    );
    if (searchTerm) {
      parts.push(`Recherche: "${searchTerm}"`);
    }
    const sortLabel = TRIP_SORT_OPTIONS.find((o) => o.value === listSort)?.label;
    if (sortLabel) parts.push(`Tri: ${sortLabel}`);
    return parts.join(' | ');
  }, [filterOrigin, filterDestination, filterStatus, searchTerm, listSort]);

  const handleExportTripsExcel = () => {
    if (sortedTrips.length === 0) {
      return;
    }

    exportToExcel({
      title: 'Trajets filtrés',
      fileName: 'trajets_filtrés.xlsx',
      sheetName: 'Trajets',
      filtersDescription,
      columns: [
        { header: 'Itinéraire', value: (t) => `${t.origine} → ${t.destination}` },
        { header: 'Arrêts', value: (t) => stopsSummaryLine(t) || '(résumé seul)' },
        { header: 'Distance (km)', value: (t) => getTripDistanceKm(t) ?? '' },
        { header: 'Client', value: (t) => t.client || '-' },
        { header: 'Réf. ATC', value: (t) => t.referenceAtc || '' },
        { header: 'Destinataire', value: (t) => t.destinataire || '' },
        { header: 'Qualité / marchandise', value: (t) => t.marchandise || '' },
        { header: 'Quantité chargée', value: (t) => (t.quantiteChargee != null ? t.quantiteChargee : '') },
        { header: 'Retour bordereaux', value: (t) => t.retourBordereaux || '' },
        { header: 'Chauffeur', value: (t) => getDriverLabel(t.chauffeurId) },
        { header: 'Statut', value: (t) => formatTripStatusFr(t.statut) },
        { header: 'Départ', value: (t) => t.dateDepart },
        { header: 'Arrivée', value: (t) => t.dateArrivee || '' },
        { header: 'Recette (FCFA)', value: (t) => t.recette },
      ],
      rows: sortedTrips,
    });
  };

  const handleExportTripsPDF = () => {
    if (sortedTrips.length === 0) {
      return;
    }

    // Calculer les totaux
    const totalRecettes = sortedTrips.reduce((sum, t) => sum + t.recette, 0);
    const trajetsTermines = sortedTrips.filter(t => t.statut === 'termine').length;
    const trajetsEnCours = sortedTrips.filter(t => t.statut === 'en_cours').length;
    const trajetsPlanifies = sortedTrips.filter(t => t.statut === 'planifie').length;
    const trajetsAnnules = sortedTrips.filter(t => t.statut === 'annule').length;

    exportToPrintablePDF({
      title: 'Liste des Trajets',
      fileName: `trajets_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription,
      // Couleurs thématiques pour les trajets (vert/teal)
      headerColor: '#0d9488',
      headerTextColor: '#ffffff',
      evenRowColor: '#f0fdfa',
      oddRowColor: '#ffffff',
      accentColor: '#0d9488',
      totals: [
        { label: 'Total Trajets', value: sortedTrips.length, style: 'neutral', icon: EMOJI.camion },
        { label: 'Terminés', value: trajetsTermines, style: 'positive', icon: '✅' },
        { label: 'En cours', value: trajetsEnCours, style: 'neutral', icon: '🔄' },
        { label: 'Planifiés', value: trajetsPlanifies, style: 'neutral', icon: EMOJI.date },
        { label: 'Annulés', value: trajetsAnnules, style: trajetsAnnules > 0 ? 'negative' : 'neutral', icon: EMOJI.annule },
        { label: 'Chiffre d’affaires', value: `+${totalRecettes.toLocaleString('fr-FR')} FCFA`, style: 'positive', icon: EMOJI.argent },
      ],
      columns: [
        { header: 'Itinéraire', value: (t) => `${EMOJI.adresse} ${t.origine} → ${t.destination}` },
        {
          header: 'Arrêts',
          value: (t) => (stopsSummaryLine(t) ? `${EMOJI.liste} ${stopsSummaryLine(t)}` : '—'),
        },
        {
          header: 'Distance',
          value: (t) => {
            const km = getTripDistanceKm(t);
            return km != null ? `${km} km` : '-';
          },
        },
        { header: 'Client', value: (t) => t.client || '-' },
        { header: 'ATC', value: (t) => t.referenceAtc || '—' },
        { header: 'Destinataire', value: (t) => t.destinataire || '—' },
        { header: 'Qualité', value: (t) => t.marchandise || '—' },
        {
          header: 'Qté',
          value: (t) =>
            t.quantiteChargee != null && t.quantiteChargee > 0
              ? String(t.quantiteChargee)
              : '—',
        },
        { header: 'Bordereaux', value: (t) => t.retourBordereaux || '—' },
        { header: 'Chauffeur', value: (t) => `${EMOJI.personne} ${getDriverLabel(t.chauffeurId)}` },
        { header: 'Statut', value: (t) => {
          const statuts: Record<string, string> = {
            'planifie': `${EMOJI.date} Planifié`,
            'en_cours': `${EMOJI.camion} En cours`,
            'termine': `${EMOJI.succes} Terminé`,
            'annule': `${EMOJI.annule} Annulé`
          };
          return statuts[t.statut] || t.statut;
        }},
        { header: 'Départ', value: (t) => new Date(t.dateDepart).toLocaleDateString('fr-FR') },
        {
          header: 'Arrivée',
          value: (t) => (t.dateArrivee ? new Date(t.dateArrivee).toLocaleDateString('fr-FR') : '-'),
        },
        { 
          header: 'Recette (FCFA)', 
          value: (t) => `+${t.recette.toLocaleString('fr-FR')}`,
          cellStyle: (t) => t.recette > 0 ? 'positive' : 'neutral'
        },
      ],
      rows: sortedTrips,
    });
  };

  // Réinitialiser les filtres
  const resetFilters = () => {
    setFilterOrigin('all');
    setFilterDestination('all');
    setFilterStatus('all');
    setSearchTerm('');
    setListSort('date_depart_desc');
  };
  
  // Vérifier si des filtres sont actifs
  const hasActiveFilters = filterOrigin !== 'all' || filterDestination !== 'all' || filterStatus !== 'all' || searchTerm !== '';

  return (
    <div className="space-y-6 p-1">
      {/* En-tête professionnel */}
      <PageHeader
        title="Gestion des Trajets"
        description={PAGE_TRAJETS_DESCRIPTION}
        icon={Route}
        gradient="from-green-500/20 via-cyan-500/10 to-transparent"
        stats={[
          {
            label: 'Terminés',
            value: completedTrips,
            icon: <CheckCircle className="h-4 w-4" />,
            color: 'text-green-600 dark:text-green-400'
          },
          {
            label: 'En cours',
            value: ongoingTrips,
            icon: <Clock className="h-4 w-4" />,
            color: 'text-blue-600 dark:text-blue-400'
          },
          {
            label: 'Planifiés',
            value: plannedTrips,
            icon: <MapPin className="h-4 w-4" />,
            color: 'text-yellow-600 dark:text-yellow-400'
          },
          {
            label: 'Annulés',
            value: cancelledTrips,
            icon: <XCircle className="h-4 w-4" />,
            color: 'text-red-600 dark:text-red-400'
          },
          {
            label: 'Encaissement',
            value: totalRevenue.toLocaleString('fr-FR', { maximumFractionDigits: 0 }),
            icon: <Route className="h-4 w-4" />,
            color: 'text-purple-600 dark:text-purple-400'
          }
        ]}
        actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="shadow-sm"
            onClick={handleExportTripsPDF}
          >
            <FileText className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button
            variant="outline"
            className="shadow-sm"
            onClick={handleExportTripsExcel}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            {canManageFleet && (
            <DialogTrigger asChild>
                <Button
                  className="shadow-md hover:shadow-lg transition-all duration-300"
                  onClick={() => resetForm()}
                >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un trajet
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingTripId ? 'Modifier le trajet' : 'Ajouter un trajet'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tracteur">
                    Tracteur (optionnel) 
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({tracteurs.length} disponible{tracteurs.length > 1 ? 's' : ''})
                    </span>
                  </Label>
                  <Select value={formData.tracteurId || 'none'} onValueChange={(value) => {
                    const tracteurId = value === 'none' ? '' : value;
                    // Trouver le chauffeur attitré au tracteur sélectionné
                    const selectedTruck = trucks.find(t => t.id === tracteurId);
                    const chauffeurAttitreId = selectedTruck?.chauffeurId || '';
                    
                    // Si le tracteur a un chauffeur attitré, le sélectionner automatiquement
                    setFormData({ 
                      ...formData, 
                      tracteurId,
                      chauffeurId: chauffeurAttitreId || formData.chauffeurId 
                    });
                    
                    if (chauffeurAttitreId) {
                      const chauffeur = drivers.find(d => d.id === chauffeurAttitreId);
                      if (chauffeur) {
                        toast.info(`Chauffeur attitré sélectionné : ${chauffeur.prenom} ${chauffeur.nom}`);
                      }
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {tracteurs.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                          Aucun tracteur disponible
                        </div>
                      ) : (
                        tracteurs.map(t => {
                          const chauffeurAttitre = t.chauffeurId ? drivers.find(d => d.id === t.chauffeurId) : null;
                          return (
                            <SelectItem key={t.id} value={t.id}>
                              {t.immatriculation} - {t.modele}
                              {chauffeurAttitre && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({EMOJI.personne} {chauffeurAttitre.prenom} {chauffeurAttitre.nom})
                                </span>
                              )}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="remorqueuse">
                    Remorqueuse (optionnel)
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({remorqueuses.length} disponible{remorqueuses.length > 1 ? 's' : ''})
                    </span>
                  </Label>
                  <Select value={formData.remorqueuseId || 'none'} onValueChange={(value) => setFormData({ ...formData, remorqueuseId: value === 'none' ? '' : value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {remorqueuses.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                          Aucune remorqueuse disponible
                        </div>
                      ) : (
                        remorqueuses.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.immatriculation} - {t.modele}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="origine">Origine *</Label>
                  <div className="flex gap-2">
                  <Input
                    id="origine"
                    value={formData.origine}
                    onChange={(e) => setFormData({ ...formData, origine: e.target.value })}
                      placeholder="Entrer ou sélectionner"
                    required
                  />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsOriginPickerOpen(true)}
                      title="Choisir sur la carte"
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="destination">Destination (résumé) *</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Ex. zone ou « À préciser » ; le détail peut aller dans les arrêts ci-dessous.
                  </p>
                  <div className="flex gap-2">
                  <Input
                    id="destination"
                    value={formData.destination}
                    onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
                    placeholder="Entrer ou sélectionner"
                    required
                  />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsDestinationPickerOpen(true)}
                      title="Choisir sur la carte"
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Arrêts (chargements / livraisons)</p>
                    <p className="text-xs text-muted-foreground">
                      Optionnel : sans ligne ici, un chargement à l’origine et une livraison à la destination du résumé sont enregistrés automatiquement.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={syncFormStopsFromOrigineDest}>
                      Reprendre origine / destination
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={addFormStop}>
                      <Plus className="h-4 w-4 mr-1" />
                      Arrêt
                    </Button>
                  </div>
                </div>
                {formData.stops.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun arrêt détaillé — utilisation du résumé seul à l’enregistrement.</p>
                ) : (
                  <div className="space-y-3">
                    {formData.stops.map((stop, index) => (
                      <div
                        key={stop.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-md border bg-background p-3"
                      >
                        <div className="md:col-span-2">
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={stop.type}
                            onValueChange={(v) =>
                              setFormData((prev) => ({
                                ...prev,
                                stops: prev.stops.map((s, i) =>
                                  i === index ? { ...s, type: v as TripStopType } : s,
                                ),
                              }))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chargement">Chargement</SelectItem>
                              <SelectItem value="livraison">Livraison</SelectItem>
                              <SelectItem value="autre">Autre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-5">
                          <Label className="text-xs">Lieu</Label>
                          <Input
                            value={stop.lieu}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                stops: prev.stops.map((s, i) =>
                                  i === index ? { ...s, lieu: e.target.value } : s,
                                ),
                              }))
                            }
                            placeholder="Ex. Dangote, Yopougon…"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Réf. client (optionnel)</Label>
                          <Input
                            value={stop.clientRef ?? ''}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                stops: prev.stops.map((s, i) =>
                                  i === index ? { ...s, clientRef: e.target.value || undefined } : s,
                                ),
                              }))
                            }
                            placeholder="Client / BL…"
                          />
                        </div>
                        <div className="md:col-span-2 flex gap-1 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={index === 0}
                            onClick={() => moveFormStop(index, -1)}
                            title="Monter"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={index >= formData.stops.length - 1}
                            onClick={() => moveFormStop(index, 1)}
                            title="Descendre"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-destructive"
                            onClick={() => removeFormStop(index)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Afficher la distance issue de la carte (itinéraire routier) */}
              {formData.origine && formData.destination && formData.origine !== formData.destination && (
                <div className="bg-muted/50 p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Distance du trajet (carte) :</span>
                    <Badge variant="outline" className="text-sm font-semibold">
                      {EMOJI.adresse} {formRoadDistance != null ? `${formRoadDistance} km` : 'Indisponible'}
                    </Badge>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="chauffeur">
                  Chauffeur *
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({availableDrivers.length} disponible{availableDrivers.length > 1 ? 's' : ''})
                  </span>
                </Label>
                <Select value={formData.chauffeurId} onValueChange={(value) => setFormData({ ...formData, chauffeurId: value })} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un chauffeur" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrivers.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        <p className="mb-2">{EMOJI.alerte} Aucun chauffeur disponible</p>
                        <p className="text-xs">
                          Tous les chauffeurs sont en mission.<br/>
                          Terminez ou annulez un trajet pour libérer un chauffeur.
                        </p>
                      </div>
                    ) : (
                      availableDrivers.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.prenom} {d.nom}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

                <div>
                <Label htmlFor="dateDepart">Date de départ *</Label>
                  <Input
                    id="dateDepart"
                    type="date"
                    value={formData.dateDepart}
                    onChange={(e) => setFormData({ ...formData, dateDepart: e.target.value })}
                    required
                  />
                </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="client">Client / structure (optionnel)</Label>
                  <Select 
                    value={formData.client || 'none'} 
                    onValueChange={(value) => setFormData({ ...formData, client: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun client</SelectItem>
                      {thirdParties
                        .filter(tp => tp.type === 'client')
                        .map(client => (
                          <SelectItem key={client.id} value={client.nom}>
                            {client.nom}
                            {client.telephone && ` - ${client.telephone}`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Compte ou donneur d’ordre côté « gros » ou habituellement facturé ; le destinataire de livraison peut
                    être différent (champ dédié ci-dessous). Fiches :{' '}
                    <Link to="/clients" className="text-primary font-medium underline-offset-2 hover:underline">
                      Clients
                    </Link>
                    .
                  </p>
                </div>

                <div>
                  <Label htmlFor="marchandise">Marchandise / qualité (optionnel)</Label>
                  <datalist id="cement-marchandise-suggestions">
                    {CEMENT_MARCHANDISE_SUGGESTIONS.map((q) => (
                      <option key={q} value={q} />
                    ))}
                  </datalist>
                  <Input
                    id="marchandise"
                    list="cement-marchandise-suggestions"
                    value={formData.marchandise}
                    onChange={(e) => setFormData({ ...formData, marchandise: e.target.value })}
                    placeholder="Ex. Cimaf 42.5R"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-primary/25 bg-muted/15 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Suivi livraison — référence commande, destinataire, quantité, retour bordereaux
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="referenceAtc">Réf. ATC / commande (optionnel)</Label>
                    <Input
                      id="referenceAtc"
                      value={formData.referenceAtc}
                      onChange={(e) => setFormData({ ...formData, referenceAtc: e.target.value })}
                      placeholder="Ex. 9002, 2071…"
                      maxLength={64}
                    />
                  </div>
                  <div>
                    <Label htmlFor="destinataire">Destinataire de livraison (optionnel)</Label>
                    <Input
                      id="destinataire"
                      value={formData.destinataire}
                      onChange={(e) => setFormData({ ...formData, destinataire: e.target.value })}
                      placeholder="Point de livraison ou client final si différent du compte ci-dessus"
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantiteChargee">Quantité chargée / livrée (optionnel)</Label>
                    <Input
                      id="quantiteChargee"
                      type="number"
                      min={0}
                      step="any"
                      value={formData.quantiteChargee ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setFormData({
                          ...formData,
                          quantiteChargee:
                            raw === '' ? undefined : Math.max(0, Number.parseFloat(raw) || 0),
                        });
                      }}
                      placeholder="Sacs, tonnes… (nombre)"
                    />
                  </div>
                  <div>
                    <Label htmlFor="retourBordereaux">Retour bordereaux (optionnel)</Label>
                    <Input
                      id="retourBordereaux"
                      value={formData.retourBordereaux}
                      onChange={(e) => setFormData({ ...formData, retourBordereaux: e.target.value })}
                      placeholder="Ex. ok, en attente…"
                      maxLength={32}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recette">Recette (FCFA) *</Label>
                  <NumberInput
                    id="recette"
                    min={0}
                    value={formData.recette}
                    onChange={(value) => setFormData({ ...formData, recette: value })}
                    required
                    placeholder="Montant de la recette"
                  />
                </div>
                <div>
                  <Label htmlFor="prefinancement">Préfinancement (FCFA) (optionnel)</Label>
                  <NumberInput
                    id="prefinancement"
                    min={0}
                    value={formData.prefinancement}
                    onChange={(value) => setFormData({ ...formData, prefinancement: value || 0 })}
                    placeholder="Montant de préfinancement"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Avance versée avant le trajet</p>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description (optionnel)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Détails supplémentaires"
                  rows={3}
                />
              </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : editingTripId ? (
                    'Enregistrer les modifications'
                  ) : (
                    'Ajouter'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        }
      />

      {/* Section de filtres */}
      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtres de recherche
            </CardTitle>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Recherche générale */}
            <div>
              <Label htmlFor="search">Recherche générale</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Rechercher par client, marchandise, description, arrêts, itinéraire ou chauffeur..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Filtre par origine */}
              <div>
                <Label htmlFor="filter-origin">Origine</Label>
                <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes les origines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les origines</SelectItem>
                    {CAMEROON_CITIES.map(city => (
                      <SelectItem key={city.name} value={city.name}>
                        {city.name}
                      </SelectItem>
                    ))}
                    {/* Ajouter les villes personnalisées qui ne sont pas dans la liste */}
                    {allOrigins.filter(origin => !CAMEROON_CITIES.find(c => c.name === origin)).map(origin => (
                      <SelectItem key={origin} value={origin}>
                        {origin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Filtre par destination */}
              <div>
                <Label htmlFor="filter-destination">Destination</Label>
                <Select value={filterDestination} onValueChange={setFilterDestination}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes les destinations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les destinations</SelectItem>
                    {CAMEROON_CITIES.map(city => (
                      <SelectItem key={city.name} value={city.name}>
                        {city.name}
                      </SelectItem>
                    ))}
                    {/* Ajouter les villes personnalisées qui ne sont pas dans la liste */}
                    {allDestinations.filter(dest => !CAMEROON_CITIES.find(c => c.name === dest)).map(dest => (
                      <SelectItem key={dest} value={dest}>
                        {dest}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Filtre par statut */}
              <div>
                <Label htmlFor="filter-status">Statut</Label>
                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as TripStatus | 'all')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les statuts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="planifie">Planifié</SelectItem>
                    <SelectItem value="en_cours">En cours</SelectItem>
                    <SelectItem value="termine">Terminé</SelectItem>
                    <SelectItem value="annule">Annulé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ListSortSelect
                id="sort-trips"
                value={listSort}
                onChange={setListSort}
                options={[...TRIP_SORT_OPTIONS]}
              />
            </div>
            
            {/* Affichage du nombre de résultats */}
            {hasActiveFilters && (
              <div className="bg-muted/50 rounded-lg px-4 py-2 border border-primary/10">
                <p className="text-sm font-medium text-primary">
                  <span className="font-bold">{sortedTrips.length}</span> trajet(s) trouvé(s) sur {trips.length}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20">
              <CardTitle className="flex items-center gap-2">
            🚚 Liste des Trajets
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Itinéraire</TableHead>
                <TableHead className="min-w-[120px]">Client</TableHead>
                <TableHead className="min-w-[130px]">Chauffeur</TableHead>
                <TableHead className="min-w-[120px]">Statut</TableHead>
                <TableHead className="min-w-[90px]">Départ</TableHead>
                <TableHead className="min-w-[90px]">Arrivée</TableHead>
                <TableHead className="text-right min-w-[90px]">Distance</TableHead>
                <TableHead className="text-right min-w-[110px]">Recette</TableHead>
                <TableHead className="text-right min-w-[120px]">Préfinancement</TableHead>
                <TableHead className="text-right min-w-[110px]">Dépenses</TableHead>
                <TableHead className="text-right min-w-[110px]">Solde</TableHead>
                <TableHead className="text-right min-w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTrips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground">
                    {trips.length === 0 
                      ? 'Aucun trajet enregistré'
                      : hasActiveFilters
                        ? 'Aucun trajet ne correspond aux filtres sélectionnés'
                        : 'Aucun trajet enregistré'
                    }
                  </TableCell>
                </TableRow>
              ) : (
                sortedTrips.map((trip) => (
                  <TableRow key={trip.id} className="hover:bg-muted/50 transition-colors duration-200">
                    <TableCell className="font-medium">
                      <div>{trip.origine} → {trip.destination}</div>
                      {stopsSummaryLine(trip) ? (
                        <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <ListOrdered className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{stopsSummaryLine(trip)}</span>
                        </div>
                      ) : null}
                      {trip.marchandise ? (
                        <div className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium text-foreground/80">Qualité :</span> {trip.marchandise}
                        </div>
                      ) : null}
                      {trip.referenceAtc ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground/80">ATC :</span> {trip.referenceAtc}
                        </div>
                      ) : null}
                      {trip.destinataire ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground/80">Destinataire :</span>{' '}
                          {trip.destinataire}
                        </div>
                      ) : null}
                      {trip.quantiteChargee != null && trip.quantiteChargee > 0 ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground/80">Qté :</span>{' '}
                          {trip.quantiteChargee.toLocaleString('fr-FR')}
                        </div>
                      ) : null}
                      {trip.retourBordereaux ? (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground/80">Bordereaux :</span>{' '}
                          {trip.retourBordereaux}
                        </div>
                      ) : null}
                      {trip.description && <div className="text-xs text-muted-foreground mt-1">{trip.description}</div>}
                    </TableCell>
                    <TableCell>{trip.client || '-'}</TableCell>
                    <TableCell>{getDriverLabel(trip.chauffeurId)}</TableCell>
                    <TableCell>{getStatusBadge(trip.statut)}</TableCell>
                    <TableCell>{new Date(trip.dateDepart).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      {trip.dateArrivee 
                        ? new Date(trip.dateArrivee).toLocaleDateString('fr-FR') 
                        : <span className="text-muted-foreground text-xs">À définir</span>
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const km = getTripDistanceKm(trip);
                        return km != null ? (
                          <span className="font-medium">{km.toLocaleString('fr-FR')} km</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-accent">
                      {(() => {
                        const stats = calculateTripStats(trip.id, expenses, trip, invoices);
                        const hint =
                          invoices?.some((inv) => inv.trajetId === trip.id) &&
                          trip.recette !== stats.recette;
                        return (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{stats.recette.toLocaleString('fr-FR')} FCFA</span>
                            {hint ? (
                              <span className="text-[10px] text-muted-foreground font-normal leading-tight">
                                Montant trajet : {trip.recette.toLocaleString('fr-FR')}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const stats = calculateTripStats(trip.id, expenses, trip, invoices);
                        return stats.prefinancement > 0 ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            {stats.prefinancement.toLocaleString('fr-FR')} FCFA
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const stats = calculateTripStats(trip.id, expenses, trip, invoices);
                        return stats.expenses > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              {stats.expenses.toLocaleString('fr-FR')} FCFA
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({stats.expensesCount} dépense{stats.expensesCount > 1 ? 's' : ''})
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const stats = calculateTripStats(trip.id, expenses, trip, invoices);
                        const soldeColor = stats.solde >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                        return (
                          <span className={`font-bold ${soldeColor}`}>
                            {stats.solde.toLocaleString('fr-FR')} FCFA
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Select 
                          value={trip.statut} 
                          onValueChange={(value) => handleUpdateStatus(trip.id, value as TripStatus, trip.statut)}
                          disabled={trip.statut === 'termine' || trip.statut === 'annule'}
                        >
                          <SelectTrigger className="w-[130px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planifie" disabled={trip.statut !== 'planifie'}>Planifié</SelectItem>
                            <SelectItem value="en_cours" disabled={trip.statut === 'termine' || trip.statut === 'annule'}>En cours</SelectItem>
                            <SelectItem value="termine" disabled={trip.statut === 'planifie' || trip.statut === 'termine' || trip.statut === 'annule'}>Terminé</SelectItem>
                            <SelectItem value="annule" disabled={trip.statut === 'termine' || trip.statut === 'annule'}>Annulé</SelectItem>
                          </SelectContent>
                        </Select>
                        {(() => {
                          const stats = calculateTripStats(trip.id, expenses, trip, invoices);
                          return stats.linkedExpensesCount > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedTripForExpenses(trip);
                                setIsExpensesDialogOpen(true);
                              }}
                              className="h-8 w-8 p-0"
                              title="Voir les dépenses de ce trajet"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          );
                        })()}
                        {canManageFleet && trip.statut !== 'annule' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditTrip(trip)}
                              className="h-8 w-8 p-0"
                              title="Modifier le trajet (itinéraire, client, recette, arrêts…)"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => duplicateTripAsDraft(trip)}
                              className="h-8 w-8 p-0"
                              title="Dupliquer vers un nouveau trajet (brouillon)"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {canManageFleet && trip.statut !== 'termine' && trip.statut !== 'annule' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openStopsDialog(trip)}
                            className="h-8 w-8 p-0"
                            title="Arrêts (chargements / livraisons)"
                          >
                            <ListOrdered className="h-4 w-4" />
                          </Button>
                        )}
                        {canManageAccounting &&
                          trip.recette > 0 &&
                          getTripRemainingRecetteToInvoice(trip, invoices) > 0.01 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openTripInvoicing(trip.id)}
                              className="h-8 w-8 p-0"
                              title="Facturer ce trajet (ou le reste) — plusieurs clients possibles"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        {canManageFleet && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteTrip(trip.id)}
                          className="h-8 w-8 p-0"
                          title="Supprimer le trajet"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        )}
                </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
            </CardContent>
          </Card>

      <Dialog
        open={isStopsDialogOpen}
        onOpenChange={(open) => {
          setIsStopsDialogOpen(open);
          if (!open) {
            setStopsDialogTrip(null);
            setStopsDraft([]);
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Arrêts du trajet</DialogTitle>
          </DialogHeader>
          {stopsDialogTrip && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {stopsDialogTrip.origine} → {stopsDialogTrip.destination} —{' '}
                <span className="font-medium text-foreground">
                  {formatTripStatusFr(stopsDialogTrip.statut)}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={addDraftStop}>
                  <Plus className="h-4 w-4 mr-1" />
                  Arrêt
                </Button>
              </div>
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {stopsDraft.map((stop, index) => (
                  <div
                    key={stop.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-md border bg-muted/15 p-3"
                  >
                    <div className="md:col-span-2">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={stop.type}
                        onValueChange={(v) =>
                          setStopsDraft((prev) =>
                            prev.map((s, i) =>
                              i === index ? { ...s, type: v as TripStopType } : s,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chargement">{labelTripStopType('chargement')}</SelectItem>
                          <SelectItem value="livraison">{labelTripStopType('livraison')}</SelectItem>
                          <SelectItem value="autre">{labelTripStopType('autre')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-4">
                      <Label className="text-xs">Lieu *</Label>
                      <Input
                        value={stop.lieu}
                        onChange={(e) =>
                          setStopsDraft((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, lieu: e.target.value } : s)),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Statut</Label>
                      <Select
                        value={stop.statut}
                        onValueChange={(v) =>
                          setStopsDraft((prev) =>
                            prev.map((s, i) =>
                              i === index ? { ...s, statut: v as TripStopStatut } : s,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="prevu">{labelTripStopStatut('prevu')}</SelectItem>
                          <SelectItem value="fait">{labelTripStopStatut('fait')}</SelectItem>
                          <SelectItem value="annule">{labelTripStopStatut('annule')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Réf. client</Label>
                      <Input
                        value={stop.clientRef ?? ''}
                        onChange={(e) =>
                          setStopsDraft((prev) =>
                            prev.map((s, i) =>
                              i === index ? { ...s, clientRef: e.target.value || undefined } : s,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-2 flex gap-1 flex-wrap justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={index === 0}
                        onClick={() => moveDraftStop(index, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={index >= stopsDraft.length - 1}
                        onClick={() => moveDraftStop(index, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => removeDraftStop(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full" onClick={() => void handleSaveStopsDraft()} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  'Enregistrer les arrêts'
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sélecteur de ville pour l'origine (nom + coordonnées pour localisation précise) */}
      <CityPicker
        open={isOriginPickerOpen}
        onClose={() => setIsOriginPickerOpen(false)}
        onSelectCity={(city, coords) => setFormData(prev => ({
          ...prev,
          origine: city,
          origineLat: coords?.lat,
          origineLng: coords?.lng,
        }))}
        title="Sélectionner la ville d'origine"
        selectedCity={formData.origine}
      />

      {/* Sélecteur de ville pour la destination (nom + coordonnées pour localisation précise) */}
      <CityPicker
        open={isDestinationPickerOpen}
        onClose={() => setIsDestinationPickerOpen(false)}
        onSelectCity={(city, coords) => setFormData(prev => ({
          ...prev,
          destination: city,
          destinationLat: coords?.lat,
          destinationLng: coords?.lng,
        }))}
        title="Sélectionner la ville de destination"
        selectedCity={formData.destination}
      />

      {/* Dialog de consultation des dépenses d'un trajet */}
      <Dialog open={isExpensesDialogOpen} onOpenChange={setIsExpensesDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dépenses du trajet</DialogTitle>
          </DialogHeader>
          {selectedTripForExpenses && (() => {
            const tripExpenses = expenses.filter(e => e.tripId === selectedTripForExpenses.id);
            const stats = calculateTripStats(selectedTripForExpenses.id, expenses, selectedTripForExpenses, invoices);
            
            return (
              <div className="space-y-4">
                {/* Informations du trajet */}
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Itinéraire:</span>
                      <p className="font-semibold">{selectedTripForExpenses.origine} → {selectedTripForExpenses.destination}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Statut:</span>
                      <p className={`font-semibold ${selectedTripForExpenses.statut === 'annule' ? 'text-red-600 dark:text-red-400' : ''}`}>
                        {formatTripStatusFr(selectedTripForExpenses.statut)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Recette:</span>
                      <p className="font-semibold text-green-600 dark:text-green-400">{stats.recette.toLocaleString('fr-FR')} FCFA</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Préfinancement:</span>
                      <p className="font-semibold text-blue-600 dark:text-blue-400">{stats.prefinancement.toLocaleString('fr-FR')} FCFA</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Solde:</span>
                      <p className={`font-bold ${stats.solde >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {stats.solde.toLocaleString('fr-FR')} FCFA
                      </p>
                    </div>
                  </div>
                </div>

                {/* Résumé des dépenses */}
                <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      <span className="font-semibold">
                        Dépenses d’exploitation (hors préfinancement) : {stats.expenses.toLocaleString('fr-FR')} FCFA
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-primary/10">
                      {stats.expensesCount} dépense{stats.expensesCount > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Le préfinancement du trajet est compté une seule fois dans le solde (ligne « Préfinancement » ou dépense du même libellé).
                  </p>
                </div>

                {/* Liste des dépenses */}
                {tripExpenses.length > 0 ? (
                  <div>
                    <h4 className="font-semibold mb-3">Détail des dépenses</h4>
                    <Table
                      className="min-w-[500px]"
                      containerClassName="max-h-none shadow-none"
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Catégorie</TableHead>
                          <TableHead>Sous-catégorie</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Montant</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tripExpenses.map((expense) => (
                          <TableRow key={expense.id}>
                            <TableCell>{new Date(expense.date).toLocaleDateString('fr-FR')}</TableCell>
                            <TableCell className="font-medium">{expense.categorie}</TableCell>
                            <TableCell>{expense.sousCategorie || '-'}</TableCell>
                            <TableCell>{expense.description}</TableCell>
                            <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">
                              {expense.montant.toLocaleString('fr-FR')} FCFA
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Aucune dépense enregistrée pour ce trajet</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
