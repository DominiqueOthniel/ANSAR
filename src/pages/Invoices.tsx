import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useApp, Invoice, InvoiceStatus, Trip } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Plus, CheckCircle2, Clock, Eye, FileText, Download, Mail, Trash2, DollarSign, AlertCircle, Filter, X, Landmark, Loader2, Package, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  getAvailableTripsForInvoicing,
  getAvailableParcelExpeditionsForInvoicing,
  getTripRemainingRecetteToInvoice,
  sumMontantTTCForTripInvoices,
  sumParcelExpeditionLotsCa,
  generateInvoiceNumber as genInvoiceNum,
  formatTripStatusFr,
} from '@/lib/sync-utils';
import PageHeader from '@/components/PageHeader';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { PAGE_FACTURES_DESCRIPTION } from '@/lib/metier-activite';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import {
  appendPrelevementFromExpenseInvoicePayment,
  appendVirementFromInvoicePayment,
  assertBankDebitAllowed,
  calculateAccountBalance,
  getBankAccounts,
  getBankTransactions,
} from '@/lib/bank-local';
import { appendEntreeFromInvoicePayment, isPaiementVersBanque } from '@/lib/caisse-local';
import { COMPANY_NAME, COMPANY_TAGLINE } from '@/lib/invoice-branding';
import { buildSingleInvoicePdfInnerHtml } from '@/lib/invoice-single-pdf-html';
import { openPdfPrintWindow } from '@/lib/pdf-print';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getInvoiceClientDefaultsFromTrip } from '@/lib/trip-client-participants';
import {
  mergeTripInvoicePaymentSlices,
  tripHasMultipleInvoicePayers,
  sumInvoicePaymentSlices,
} from '@/lib/invoice-payment-slices';
import {
  buildClientInvoiceDisplay,
  clientInvoiceNotesPreview,
  clientInvoiceTypeLabel,
  getClientInvoiceKind,
} from '@/lib/invoice-client-display';

const INVOICE_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date création (récent → ancien)' },
  { value: 'date_asc', label: 'Date création (ancien → récent)' },
  { value: 'numero_asc', label: 'N° facture A → Z' },
  { value: 'numero_desc', label: 'N° facture Z → A' },
  { value: 'montant_desc', label: 'Montant TTC (plus haut → plus bas)' },
  { value: 'montant_asc', label: 'Montant TTC (plus bas → plus haut)' },
  { value: 'reste_desc', label: 'Reste à payer (plus haut → plus bas)' },
  { value: 'reste_asc', label: 'Reste à payer (plus bas → plus haut)' },
  { value: 'tiers_asc', label: 'Client / fournisseur A → Z' },
  { value: 'statut_attente_first', label: 'Statut : en attente puis payée' },
] as const;

export default function Invoices() {
  const {
    invoices,
    trips,
    trucks,
    drivers,
    expenses,
    thirdParties,
    parcelExpeditions,
    clientOrders,
    clientDeliveries,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    isLoading,
  } = useApp();
  const { canManageAccounting } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExpenseInvoiceDialogOpen, setIsExpenseInvoiceDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  /** Participant trajet (ligne client) ayant versé l’encaissement en cours — si ≥ 2 clients sur le trajet. */
  const [paymentPayerParticipantId, setPaymentPayerParticipantId] = useState('');
  /** Compte qui reçoit le virement (dialog paiement) */
  const [paymentCompteBanqueId, setPaymentCompteBanqueId] = useState<string>('');
  const [selectedTripId, setSelectedTripId] = useState('');
  /** Facture liée à une expédition (exclusif avec trajet). */
  const [invoiceMissionKind, setInvoiceMissionKind] = useState<'trip' | 'parcel'>('trip');
  const [selectedParcelExpeditionId, setSelectedParcelExpeditionId] = useState('');
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [modePaiement, setModePaiement] = useState('');
  const [notes, setNotes] = useState('');
  const [tva, setTva] = useState<number>(0);
  const [tps, setTps] = useState<number>(0);
  const [remise, setRemise] = useState<number>(0); // Remise en pourcentage
  const [expenseTva, setExpenseTva] = useState<number>(0);
  const [expenseTps, setExpenseTps] = useState<number>(0);
  const [expenseRemise, setExpenseRemise] = useState<number>(0);
  /** Montant HT de la facture en cours (trajet) — plusieurs factures possibles, plafond = reste TTC. */
  const [tripInvoiceMontantHt, setTripInvoiceMontantHt] = useState(0);
  const [invoiceTripClientTierId, setInvoiceTripClientTierId] = useState('');
  const [invoiceTripClientLibelle, setInvoiceTripClientLibelle] = useState('');
  const lastTripIdForInvoiceBaseRef = useRef('');

  const { isSubmitting: isCreatingTripInvoice, withGuard: withTripInvoiceGuard } = useSubmitGuard();
  const { isSubmitting: isCreatingExpenseInvoice, withGuard: withExpenseInvoiceGuard } = useSubmitGuard();
  const { isSubmitting: isConfirmingPayment, withGuard: withPaymentGuard } = useSubmitGuard();

  const tierClientsFiches = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'client'),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  // Pré-ouverture du dialog de création (ex. depuis Expéditions ou Trajets).
  useEffect(() => {
    if (isLoading) return;
    const shouldOpen = searchParams.get('create') === '1';
    if (!shouldOpen) return;

    const parcelExpeditionId = searchParams.get('parcelExpeditionId')?.trim() || '';
    const trajetId = searchParams.get('trajetId')?.trim() || '';

    if (parcelExpeditionId) {
      const exists = parcelExpeditions.some((e) => e.id === parcelExpeditionId);
      if (!exists) {
        toast.error("L'expédition demandée est introuvable. Actualisez la liste puis réessayez.");
        setSearchParams({}, { replace: true });
        return;
      }
      setInvoiceMissionKind('parcel');
      setSelectedTripId('');
      setSelectedParcelExpeditionId(parcelExpeditionId);
      setIsDialogOpen(true);
      setSearchParams({}, { replace: true });
      return;
    }

    if (trajetId) {
      const exists = trips.some((t) => t.id === trajetId);
      if (!exists) {
        toast.error('Le trajet demandé est introuvable. Actualisez la liste puis réessayez.');
        setSearchParams({}, { replace: true });
        return;
      }
      setInvoiceMissionKind('trip');
      setSelectedParcelExpeditionId('');
      setSelectedTripId(trajetId);
      setIsDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [isLoading, searchParams, setSearchParams, parcelExpeditions, trips]);

  useEffect(() => {
    if (!isDialogOpen || invoiceMissionKind !== 'trip' || !selectedTripId) {
      if (!isDialogOpen) lastTripIdForInvoiceBaseRef.current = '';
      return;
    }
    const trip = trips.find((t) => t.id === selectedTripId);
    if (!trip) return;
    if (lastTripIdForInvoiceBaseRef.current !== selectedTripId) {
      lastTripIdForInvoiceBaseRef.current = selectedTripId;
      setTripInvoiceMontantHt(getTripRemainingRecetteToInvoice(trip, invoices));
      const { clientTierId, factureClientLibelle } = getInvoiceClientDefaultsFromTrip(trip);
      setInvoiceTripClientTierId(clientTierId);
      setInvoiceTripClientLibelle(factureClientLibelle);
    }
  }, [isDialogOpen, invoiceMissionKind, selectedTripId, trips, invoices]);

  // États pour les filtres
  const [filters, setFilters] = useState({
    searchTerm: '', // Nom du client ou numéro de facture
    type: '', // Type de facture: 'expense' ou 'trip'
    tripId: '',
    driverId: '',
    status: '',
    /** Solde encaissement : impayés, jamais payées, partiel, soldées (basé sur montants) */
    paiementSolde: '' as '' | 'impaye' | 'jamais_payee' | 'partiel' | 'soldee',
    dateFrom: '',
    dateTo: '',
  });
  const [listSort, setListSort] = useState<string>('date_desc');

  // Utiliser la fonction centralisée pour obtenir les trajets disponibles
  const availableTrips = getAvailableTripsForInvoicing(trips, invoices);
  const availableParcelExpeditions = useMemo(
    () => getAvailableParcelExpeditionsForInvoicing(parcelExpeditions, invoices),
    [parcelExpeditions, invoices],
  );

  // Obtenir les dépenses disponibles pour facturation (sans facture existante)
  const availableExpenses = useMemo(() => {
    const invoicedExpenseIds = new Set(invoices.map(inv => inv.expenseId).filter((id): id is string => !!id));
    return expenses.filter(expense => !invoicedExpenseIds.has(expense.id));
  }, [expenses, invoices]);

  const generateInvoiceNumber = () => {
    return genInvoiceNum(invoices);
  };

  // Calculer le prochain numéro de facture qui sera généré
  const nextInvoiceNumber = useMemo(() => {
    return genInvoiceNum(invoices);
  }, [invoices]);

  const handleCreateInvoice = async () => {
    let montantHTInitial = 0;
    if (invoiceMissionKind === 'trip') {
      if (!selectedTripId) {
        toast.error('Veuillez sélectionner un trajet');
        return;
      }
      const trip = trips.find((t) => t.id === selectedTripId);
      if (!trip) return;
      montantHTInitial = tripInvoiceMontantHt;
      if (montantHTInitial <= 0) {
        toast.error('Le montant HT à facturer doit être supérieur à 0 FCFA');
        return;
      }
      const remainingTtc = getTripRemainingRecetteToInvoice(trip, invoices);
      const montantRemisePre = montantHTInitial * (remise / 100);
      const montantHTApresRemisePre = montantHTInitial - montantRemisePre;
      const montantTVAPre = montantHTApresRemisePre * (tva / 100);
      const montantTPSPre = montantHTApresRemisePre * (tps / 100);
      const montantTTCPre = montantHTApresRemisePre + montantTVAPre + montantTPSPre;
      if (montantTTCPre > remainingTtc + 0.01) {
        toast.error(
          `Le montant TTC (${montantTTCPre.toLocaleString('fr-FR')} FCFA) dépasse le reste facturable sur ce trajet (${remainingTtc.toLocaleString('fr-FR')} FCFA). Réduisez le montant HT ou les taxes.`,
        );
        return;
      }
    } else {
      if (!selectedParcelExpeditionId) {
        toast.error('Veuillez sélectionner une expédition');
        return;
      }
      const ex = parcelExpeditions.find((e) => e.id === selectedParcelExpeditionId);
      if (!ex) return;
      montantHTInitial = sumParcelExpeditionLotsCa(ex);
      if (montantHTInitial <= 0) {
        toast.error('Le CA des lignes colis doit être supérieur à 0');
        return;
      }
    }

    const montantRemise = montantHTInitial * (remise / 100);
    const montantHTApresRemise = montantHTInitial - montantRemise;
    const montantTVA = montantHTApresRemise * (tva / 100);
    const montantTPS = montantHTApresRemise * (tps / 100);
    const montantTTC = montantHTApresRemise + montantTVA + montantTPS;

    await withTripInvoiceGuard(async () => {
      try {
        const trip =
          invoiceMissionKind === 'trip' ? trips.find((t) => t.id === selectedTripId) : undefined;
        const tierNom =
          invoiceMissionKind === 'trip' &&
          invoiceTripClientTierId &&
          thirdParties.find((tp) => tp.id === invoiceTripClientTierId && tp.type === 'client')?.nom;
        const resolvedLibelle =
          invoiceMissionKind === 'trip'
            ? (invoiceTripClientLibelle || '').trim() || tierNom || trip?.client || undefined
            : undefined;

        await createInvoice({
          numero: generateInvoiceNumber(),
          trajetId: invoiceMissionKind === 'trip' ? selectedTripId : undefined,
          parcelExpeditionId:
            invoiceMissionKind === 'parcel' ? selectedParcelExpeditionId : undefined,
          statut: 'en_attente',
          montantHT: montantHTInitial,
          remise: remise > 0 ? remise : undefined,
          montantHTApresRemise: remise > 0 ? montantHTApresRemise : undefined,
          tva: tva > 0 ? montantTVA : undefined,
          tps: tps > 0 ? montantTPS : undefined,
          montantTTC,
          montantPaye: 0,
          dateCreation: new Date().toISOString().split('T')[0],
          modePaiement: modePaiement || undefined,
          notes: notes || undefined,
          clientTierId: invoiceMissionKind === 'trip' ? invoiceTripClientTierId || undefined : undefined,
          factureClientLibelle: resolvedLibelle,
        });
        toast.success('Facture créée avec succès');
        setIsDialogOpen(false);
        setSelectedTripId('');
        setSelectedParcelExpeditionId('');
        setInvoiceMissionKind('trip');
        setModePaiement('');
        setNotes('');
        setTva(0);
        setTps(0);
        setRemise(0);
        setTripInvoiceMontantHt(0);
        setInvoiceTripClientTierId('');
        setInvoiceTripClientLibelle('');
        lastTripIdForInvoiceBaseRef.current = '';
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
      }
    });
  };

  const handleCreateExpenseInvoice = async () => {
    if (!selectedExpenseId) {
      toast.error('Veuillez sélectionner une dépense');
      return;
    }

    const expense = expenses.find(e => e.id === selectedExpenseId);
    if (!expense) return;

    const montantHTInitial = expense.montant;
    const montantRemise = montantHTInitial * (expenseRemise / 100);
    const montantHTApresRemise = montantHTInitial - montantRemise;
    const montantTVA = montantHTApresRemise * (expenseTva / 100);
    const montantTPS = montantHTApresRemise * (expenseTps / 100);
    const montantTTC = montantHTApresRemise + montantTVA + montantTPS;

    const year = new Date().getFullYear();
    const invoiceCount = invoices.filter(inv => inv.numero.startsWith(`FAC-EXP-${year}`)).length + 1;
    const numero = `FAC-EXP-${year}-${String(invoiceCount).padStart(3, '0')}`;

    await withExpenseInvoiceGuard(async () => {
      try {
        await createInvoice({
          numero,
          expenseId: selectedExpenseId,
          statut: 'en_attente',
          montantHT: montantHTInitial,
          remise: expenseRemise > 0 ? expenseRemise : undefined,
          montantHTApresRemise: expenseRemise > 0 ? montantHTApresRemise : undefined,
          tva: expenseTva > 0 ? montantTVA : undefined,
          tps: expenseTps > 0 ? montantTPS : undefined,
          montantTTC,
          montantPaye: 0,
          dateCreation: new Date().toISOString().split('T')[0],
          modePaiement: modePaiement || undefined,
          notes: notes || undefined,
        });
        toast.success('Facture de dépense créée avec succès');
        setIsExpenseInvoiceDialogOpen(false);
        setSelectedExpenseId('');
        setModePaiement('');
        setNotes('');
        setExpenseTva(0);
        setExpenseTps(0);
        setExpenseRemise(0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
      }
    });
  };

  const handleMarkPaid = (id: string) => {
    const invoice = invoices.find(inv => inv.id === id);
    if (!invoice) return;
    
    setSelectedInvoice(invoice);
    setPaymentAmount(0); // Montant du nouveau paiement à ajouter (pré-rempli à 0)
    setPaymentPayerParticipantId('');
    const trip = invoice.trajetId ? trips.find((t) => t.id === invoice.trajetId) : undefined;
    if (trip) {
      const parts = (trip.clientParticipants ?? []).filter((p) => p.libelle.trim());
      if (parts.length > 0) {
        const payeurId = trip.payeurParticipantId;
        const def = payeurId ? parts.find((p) => p.id === payeurId) : parts[0];
        if (def) setPaymentPayerParticipantId(def.id);
      }
    }
    const accs = getBankAccounts();
    setPaymentCompteBanqueId(accs[0]?.id ?? '');
    setIsPaymentDialogOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedInvoice) return;

    const dejaPaye = Number(selectedInvoice.montantPaye ?? 0);
    const ttc = Number(selectedInvoice.montantTTC);
    const resteAPayer = Math.max(0, ttc - dejaPaye);
    const tol = 0.01;

    if (paymentAmount < 0) {
      toast.error('Le montant payé ne peut pas être négatif');
      return;
    }

    if (paymentAmount > resteAPayer + tol) {
      toast.error(
        `Montant refusé : le reste à payer est de ${resteAPayer.toLocaleString('fr-FR')} FCFA (TTC ${ttc.toLocaleString('fr-FR')} − déjà payé ${dejaPaye.toLocaleString('fr-FR')}).`,
      );
      return;
    }

    const mode = selectedInvoice.modePaiement;
    if (paymentAmount > 0 && isPaiementVersBanque(mode)) {
      const accs = getBankAccounts();
      if (accs.length === 0) {
        toast.error('Créez au moins un compte bancaire pour enregistrer un virement.');
        return;
      }
      if (!paymentCompteBanqueId) {
        toast.error('Sélectionnez le compte bancaire qui reçoit le virement.');
        return;
      }
    }

    const tripForPay = selectedInvoice.trajetId
      ? trips.find((t) => t.id === selectedInvoice.trajetId)
      : undefined;
    if (paymentAmount > 0 && tripHasMultipleInvoicePayers(tripForPay) && !paymentPayerParticipantId.trim()) {
      toast.error('Sélectionnez le client qui a effectué ce paiement.');
      return;
    }

    let payeurDescription = '';
    let paiementsEncaissementsPayload:
      | { montant: number; clientTierId?: string; payeurLibelle?: string }[]
      | undefined = undefined;
    if (paymentAmount > 0) {
      const merged = mergeTripInvoicePaymentSlices({
        invoice: selectedInvoice,
        trip: tripForPay,
        additionalAmount: paymentAmount,
        payerParticipantId: paymentPayerParticipantId.trim() || undefined,
        thirdParties: thirdParties.map((tp) => ({ id: tp.id, nom: tp.nom })),
      });
      payeurDescription = merged.payerDescription;
      paiementsEncaissementsPayload =
        merged.paiementsEncaissements.length > 0 ? merged.paiementsEncaissements : undefined;
    }

    const nouveauTotalPaye = dejaPaye + paymentAmount;
    const datePaiementJour = new Date().toISOString().split('T')[0];
    const isExpenseInvoice = Boolean(selectedInvoice.expenseId);

    await withPaymentGuard(async () => {
      try {
        if (
          paymentAmount > 0 &&
          isPaiementVersBanque(mode) &&
          paymentCompteBanqueId &&
          isExpenseInvoice
        ) {
          const debitCheck = assertBankDebitAllowed(paymentCompteBanqueId, paymentAmount);
          if (debitCheck.ok === false) {
            toast.error(debitCheck.message, { duration: 8000 });
            return;
          }
        }

        await updateInvoice(selectedInvoice.id, {
          montantPaye: nouveauTotalPaye,
          statut: nouveauTotalPaye >= selectedInvoice.montantTTC ? 'payee' : 'en_attente',
          datePaiement: nouveauTotalPaye > 0 ? (selectedInvoice.datePaiement || datePaiementJour) : undefined,
          modePaiement: selectedInvoice.modePaiement || undefined,
          ...(paiementsEncaissementsPayload
            ? { paiementsEncaissements: paiementsEncaissementsPayload }
            : {}),
        });

        if (paymentAmount > 0 && isPaiementVersBanque(mode) && paymentCompteBanqueId) {
          try {
            const nomCompte = getBankAccounts().find((a) => a.id === paymentCompteBanqueId)?.nom ?? 'Compte';
            const factureSoldée = nouveauTotalPaye >= selectedInvoice.montantTTC;

            if (isExpenseInvoice) {
              await appendPrelevementFromExpenseInvoicePayment({
                compteId: paymentCompteBanqueId,
                montant: paymentAmount,
                date: datePaiementJour,
                factureNumero: selectedInvoice.numero,
                factureId: selectedInvoice.id,
              });
              toast.success(
                factureSoldée
                  ? `Facture fournisseur soldée — ${paymentAmount.toLocaleString('fr-FR')} FCFA prélevés sur « ${nomCompte} »`
                  : `Prélèvement ${paymentAmount.toLocaleString('fr-FR')} FCFA sur « ${nomCompte} » — reste ${(selectedInvoice.montantTTC - nouveauTotalPaye).toLocaleString('fr-FR')} FCFA sur la facture`,
              );
            } else {
              await appendVirementFromInvoicePayment({
                compteId: paymentCompteBanqueId,
                montant: paymentAmount,
                date: datePaiementJour,
                factureNumero: selectedInvoice.numero,
                factureId: selectedInvoice.id,
                description:
                  payeurDescription && !isExpenseInvoice
                    ? `Encaissement facture ${selectedInvoice.numero} — payeur : ${payeurDescription}`
                    : undefined,
              });
              toast.success(
                factureSoldée
                  ? `Facture soldée — ${paymentAmount.toLocaleString('fr-FR')} FCFA crédités sur « ${nomCompte} »`
                  : `Virement ${paymentAmount.toLocaleString('fr-FR')} FCFA sur « ${nomCompte} » (reste ${(selectedInvoice.montantTTC - nouveauTotalPaye).toLocaleString('fr-FR')} FCFA)`,
              );
            }
          } catch {
            toast.error(
              'Facture mise à jour, mais l’écriture banque a échoué. Vérifiez la caisse ou réessayez.',
            );
          }
        } else if (paymentAmount > 0 && !isPaiementVersBanque(mode)) {
          try {
            await appendEntreeFromInvoicePayment({
              montant: paymentAmount,
              date: datePaiementJour,
              factureNumero: selectedInvoice.numero,
              factureId: selectedInvoice.id,
              modeLibelle: mode,
              payeurNote: payeurDescription || undefined,
            });
            const factureSoldée = nouveauTotalPaye >= selectedInvoice.montantTTC;
            toast.success(
              factureSoldée
                ? `Facture soldée — ${paymentAmount.toLocaleString('fr-FR')} FCFA enregistrés en caisse`
                : `Encaissement caisse ${paymentAmount.toLocaleString('fr-FR')} FCFA — reste ${(selectedInvoice.montantTTC - nouveauTotalPaye).toLocaleString('fr-FR')} FCFA sur la facture`,
            );
          } catch {
            toast.error(
              'Facture mise à jour, mais l’écriture caisse a échoué. Vérifie la page Caisse ou réessaie.',
            );
          }
        } else if (nouveauTotalPaye >= selectedInvoice.montantTTC) {
          toast.success('Facture marquée comme payée complètement');
        } else if (paymentAmount > 0) {
          toast.success(`Paiement enregistré: +${paymentAmount.toLocaleString('fr-FR')} FCFA (Total: ${nouveauTotalPaye.toLocaleString('fr-FR')} / ${selectedInvoice.montantTTC.toLocaleString('fr-FR')} FCFA)`);
        }

        setIsPaymentDialogOpen(false);
        setSelectedInvoice(null);
        setPaymentAmount(0);
        setPaymentPayerParticipantId('');
        setPaymentCompteBanqueId('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors du paiement');
      }
    });
  };

  const handleDeleteInvoice = async (id: string) => {
    const invoice = invoices.find(inv => inv.id === id);
    if (invoice && confirm(`Êtes-vous sûr de vouloir supprimer la facture ${invoice.numero} ?`)) {
      try {
        await deleteInvoice(id);
        toast.success('Facture supprimée');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      }
    }
  };

  /** Solde banque avant le virement (dialog paiement). */
  const soldeComptePourVirement =
    paymentCompteBanqueId && isPaymentDialogOpen
      ? calculateAccountBalance(
          paymentCompteBanqueId,
          getBankAccounts(),
          getBankTransactions(),
        )
      : null;

  /** Facture dépense + virement : le compte est débité — bloquer si solde insuffisant. */
  const paiementBanqueDepenseInsuffisant =
    Boolean(
      isPaymentDialogOpen &&
        selectedInvoice?.expenseId &&
        paymentAmount > 0 &&
        isPaiementVersBanque(selectedInvoice.modePaiement) &&
        soldeComptePourVirement !== null &&
        soldeComptePourVirement < paymentAmount,
    );

  const getTripLabel = (tripId?: string) => {
    if (!tripId) return 'N/A';
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return 'N/A';
    return `${trip.origine} → ${trip.destination}`;
  };

  const getTrip = (tripId?: string): Trip | undefined => {
    if (!tripId) return undefined;
    return trips.find(t => t.id === tripId);
  };

  const getParcelExpedition = (id?: string) => {
    if (!id) return undefined;
    return parcelExpeditions.find((e) => e.id === id);
  };

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.prenom} ${driver.nom}` : 'N/A';
  };

  const getTruckLabel = (truckId: string) => {
    const truck = trucks.find(t => t.id === truckId);
    return truck ? truck.immatriculation : 'N/A';
  };

  // Fonction pour obtenir une dépense
  const getExpense = (expenseId?: string) => {
    if (!expenseId) return undefined;
    return expenses.find(e => e.id === expenseId);
  };

  // Fonction pour filtrer les factures
  const filteredInvoices = useMemo(
    () =>
      invoices.filter(invoice => {
        const trip = getTrip(invoice.trajetId);
        const parcelEx = getParcelExpedition(invoice.parcelExpeditionId);
        const expense = getExpense(invoice.expenseId);

        // Filtre par type de facture
        if (filters.type) {
          if (filters.type === 'expense' && !invoice.expenseId) return false;
          if (filters.type === 'trip' && !invoice.trajetId) return false;
          if (filters.type === 'parcel' && !invoice.parcelExpeditionId) return false;
        }

        // Filtre par recherche (nom client, numéro de facture, description de dépense)
        if (filters.searchTerm) {
          const searchLower = filters.searchTerm.toLowerCase();
          const matchesClient = trip?.client?.toLowerCase().includes(searchLower);
          const matchesNumber = invoice.numero.toLowerCase().includes(searchLower);
          const matchesExpense = expense?.description?.toLowerCase().includes(searchLower) || 
                                 expense?.categorie?.toLowerCase().includes(searchLower);
          const parcelHay = parcelEx
            ? [
                parcelEx.reference,
                parcelEx.destination,
                parcelEx.origine,
                ...(parcelEx.lots || []).map((l) => `${l.clients} ${l.unite}`),
              ]
                .join(' ')
                .toLowerCase()
            : '';
          const matchesParcel = parcelHay.includes(searchLower);
          if (!matchesClient && !matchesNumber && !matchesExpense && !matchesParcel) return false;
        }

        // Filtre par trajet (seulement pour les factures de trajets)
        if (filters.tripId) {
          if (invoice.trajetId !== filters.tripId) return false;
        }

        // Filtre par chauffeur (pour trajets, dépenses et expéditions)
        if (filters.driverId) {
          const driverMatch =
            trip?.chauffeurId === filters.driverId ||
            expense?.chauffeurId === filters.driverId ||
            parcelEx?.chauffeurId === filters.driverId;
          if (!driverMatch) return false;
        }

        // Filtre par statut
        if (filters.status && invoice.statut !== filters.status) {
          return false;
        }

        // Filtre impayés / solde (montants réels, indépendant du libellé de statut)
        if (filters.paiementSolde) {
          const paye = invoice.montantPaye ?? 0;
          const ttc = invoice.montantTTC;
          const reste = ttc - paye;
          const tol = 0.01;
          if (filters.paiementSolde === 'impaye' && reste <= tol) return false;
          if (filters.paiementSolde === 'jamais_payee' && paye > tol) return false;
          if (filters.paiementSolde === 'partiel' && (paye <= tol || reste <= tol)) return false;
          if (filters.paiementSolde === 'soldee' && reste > tol) return false;
        }

        // Filtre par date de création (du)
        if (filters.dateFrom && invoice.dateCreation < filters.dateFrom) {
          return false;
        }

        // Filtre par date de création (au)
        if (filters.dateTo && invoice.dateCreation > filters.dateTo) {
          return false;
        }

        return true;
      }),
    [invoices, filters, trips, expenses, parcelExpeditions],
  );

  const sortedInvoices = useMemo(() => {
    const tiersLabel = (inv: Invoice) => {
      if (inv.expenseId) {
        const expense = expenses.find((e) => e.id === inv.expenseId);
        const supplier = expense?.fournisseurId
          ? thirdParties.find((tp) => tp.id === expense.fournisseurId)
          : null;
        return supplier?.nom || '';
      }
      if (inv.parcelExpeditionId) {
        const ex = parcelExpeditions.find((e) => e.id === inv.parcelExpeditionId);
        const clients = ex?.lots?.map((l) => l.clients).filter(Boolean).join(', ');
        return clients || ex?.reference || '';
      }
      const trip = trips.find((t) => t.id === inv.trajetId);
      if (inv.trajetId && trip) {
        const tier = inv.clientTierId
          ? thirdParties.find((tp) => tp.id === inv.clientTierId)
          : null;
        return inv.factureClientLibelle || tier?.nom || trip.client || '';
      }
      return '';
    };
    const reste = (inv: Invoice) => Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0));
    const list = [...filteredInvoices];
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.dateCreation) - parseDateMs(b.dateCreation));
      case 'numero_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.numero, b.numero));
      case 'numero_desc':
        return stableSort(list, (a, b) => frCollator.compare(b.numero, a.numero));
      case 'montant_desc':
        return stableSort(list, (a, b) => b.montantTTC - a.montantTTC);
      case 'montant_asc':
        return stableSort(list, (a, b) => a.montantTTC - b.montantTTC);
      case 'reste_desc':
        return stableSort(list, (a, b) => reste(b) - reste(a));
      case 'reste_asc':
        return stableSort(list, (a, b) => reste(a) - reste(b));
      case 'tiers_asc':
        return stableSort(list, (a, b) => frCollator.compare(tiersLabel(a), tiersLabel(b)));
      case 'statut_attente_first':
        return stableSort(
          list,
          (a, b) =>
            (a.statut === 'en_attente' ? 0 : 1) - (b.statut === 'en_attente' ? 0 : 1) ||
            parseDateMs(b.dateCreation) - parseDateMs(a.dateCreation),
        );
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.dateCreation) - parseDateMs(a.dateCreation));
    }
  }, [filteredInvoices, listSort, trips, expenses, thirdParties, parcelExpeditions]);

  // Fonction pour réinitialiser les filtres
  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      type: '',
      tripId: '',
      driverId: '',
      status: '',
      paiementSolde: '',
      dateFrom: '',
      dateTo: '',
    });
    setListSort('date_desc');
  };

  // Vérifier si des filtres sont actifs
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => value !== '');

  const filtersDescription = useMemo(() => {
    const parts: string[] = [];
    if (filters.searchTerm) parts.push(`Recherche: "${filters.searchTerm}"`);
    if (filters.type) {
      const typeLabels: Record<string, string> = {
        expense: 'Dépense',
        trip: 'Trajet',
        parcel: 'Expédition',
      };
      parts.push(`Type: ${typeLabels[filters.type] ?? filters.type}`);
    }
    if (filters.tripId) parts.push(`Trajet filtré`);
    if (filters.driverId) parts.push(`Chauffeur filtré`);
    if (filters.status) {
      parts.push(
        `Statut: ${filters.status === 'en_attente' ? 'En attente' : 'Payée'}`,
      );
    }
    if (filters.paiementSolde) {
      const soldeLabels = {
        impaye: 'Impayés (reste à payer)',
        jamais_payee: 'Jamais payées',
        partiel: 'Partiellement payées',
        soldee: 'Soldées',
      } as const;
      parts.push(soldeLabels[filters.paiementSolde]);
    }
    if (filters.dateFrom) {
      parts.push(`Date du: ${new Date(filters.dateFrom).toLocaleDateString('fr-FR')}`);
    }
    if (filters.dateTo) {
      parts.push(`Date au: ${new Date(filters.dateTo).toLocaleDateString('fr-FR')}`);
    }
    const sortLabel = INVOICE_SORT_OPTIONS.find((o) => o.value === listSort)?.label;
    if (sortLabel) parts.push(`Tri: ${sortLabel}`);
    return parts.join(' | ');
  }, [filters, listSort]);

  const handleExportInvoicesExcel = () => {
    if (sortedInvoices.length === 0) {
      toast.info('Aucune facture à exporter avec les filtres actuels.');
      return;
    }

    exportToExcel({
      title: 'Factures filtrées',
      fileName: `factures_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: 'Factures',
      filtersDescription,
      columns: [
        { header: 'Numéro', value: (inv) => inv.numero },
        {
          header: 'Type',
          value: (inv) =>
            inv.expenseId ? 'Dépense' : inv.parcelExpeditionId ? 'Expédition' : 'Trajet',
        },
        {
          header: 'Statut mission',
          value: (inv) => {
            if (inv.expenseId) return '—';
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex ? formatTripStatusFr(ex.statut) : '—';
            }
            const trip = getTrip(inv.trajetId);
            return trip ? formatTripStatusFr(trip.statut) : '—';
          },
        },
        {
          header: 'Détails',
          value: (inv) => {
            if (inv.expenseId) {
              const expense = getExpense(inv.expenseId);
              return expense ? expense.description : '';
            }
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex ? `${ex.origine} → ${ex.destination} · ${ex.reference}` : '';
            }
            return getTripLabel(inv.trajetId);
          },
        },
        {
          header: 'Client/Fournisseur',
          value: (inv) => {
            if (inv.expenseId) {
              const expense = getExpense(inv.expenseId);
              const supplier = expense?.fournisseurId ? thirdParties.find(tp => tp.id === expense.fournisseurId) : null;
              return supplier?.nom || '';
            }
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex?.lots?.map((l) => l.clients).filter(Boolean).join(' · ') || '';
            }
            const trip = getTrip(inv.trajetId);
            return trip?.client || '';
          },
        },
        {
          header: 'Catégorie / marchandise',
          value: (inv) => {
            if (inv.expenseId) {
              const expense = getExpense(inv.expenseId);
              return expense ? `${expense.categorie}${expense.sousCategorie ? ' - ' + expense.sousCategorie : ''}` : '';
            }
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex ? `${ex.lots.length} ligne(s) colis` : '';
            }
            const trip = getTrip(inv.trajetId);
            return trip?.marchandise || '';
          },
        },
        {
          header: 'Date création',
          value: (inv) => inv.dateCreation,
        },
        {
          header: 'Montant TTC',
          value: (inv) => inv.montantTTC,
        },
        {
          header: 'Déjà payé',
          value: (inv) => inv.montantPaye ?? 0,
        },
        {
          header: 'Reste à payer',
          value: (inv) => Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0)),
        },
        {
          header: 'Statut',
          value: (inv) => inv.statut,
        },
      ],
      rows: sortedInvoices,
    });
  };

  const handleExportInvoicesPDF = () => {
    if (filteredInvoices.length === 0) return;

    const tol = 0.01;
    const montantDejaPaye = (inv: Invoice) => inv.montantPaye ?? 0;
    const resteAPayer = (inv: Invoice) => Math.max(0, inv.montantTTC - montantDejaPaye(inv));

    // Calculer les totaux (montants réels : TTC, encaissé, reste — y compris paiements partiels)
    const facturesTrajets = filteredInvoices.filter(inv => !inv.expenseId && !inv.parcelExpeditionId);
    const facturesColis = filteredInvoices.filter(inv => !!inv.parcelExpeditionId);
    const facturesDepenses = filteredInvoices.filter(inv => inv.expenseId);
    const totalTrajets = facturesTrajets.reduce((sum, inv) => sum + inv.montantTTC, 0);
    const totalColis = facturesColis.reduce((sum, inv) => sum + inv.montantTTC, 0);
    const totalDepenses = facturesDepenses.reduce((sum, inv) => sum + inv.montantTTC, 0);
    const totalTTC = filteredInvoices.reduce((sum, inv) => sum + inv.montantTTC, 0);
    const totalDejaPaye = filteredInvoices.reduce((sum, inv) => sum + montantDejaPaye(inv), 0);
    const totalResteAPayer = filteredInvoices.reduce((sum, inv) => sum + resteAPayer(inv), 0);
    const facturesSoldees = filteredInvoices.filter(inv => resteAPayer(inv) <= tol).length;
    const facturesAvecReste = filteredInvoices.filter(inv => resteAPayer(inv) > tol).length;

    exportToPrintablePDF({
      title: 'Relevé des factures',
      fileName: `factures_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription,
      branding: {
        companyName: COMPANY_NAME,
        tagline: COMPANY_TAGLINE,
        documentLabel: 'Synthèse comptable — export filtré',
      },
      hideDefaultStatBox: true,
      headerColor: '#1d4ed8',
      headerTextColor: '#ffffff',
      evenRowColor: '#f8fafc',
      oddRowColor: '#ffffff',
      accentColor: '#2563eb',
      totals: [
        { label: 'Total Factures', value: filteredInvoices.length, style: 'neutral', icon: '📄' },
        { label: 'Montant total (TTC)', value: `${totalTTC.toLocaleString('fr-FR')} FCFA`, style: 'neutral', icon: '📊' },
        { label: 'Total déjà payé', value: `${totalDejaPaye.toLocaleString('fr-FR')} FCFA`, style: 'positive', icon: '✅' },
        { label: 'Total reste à payer', value: `${totalResteAPayer.toLocaleString('fr-FR')} FCFA`, style: totalResteAPayer > tol ? 'negative' : 'positive', icon: '⏳' },
        { label: 'Soldées / avec reste', value: `${facturesSoldees} / ${facturesAvecReste}`, style: 'neutral', icon: '📋' },
        { label: 'Chiffre d’affaires (trajets)', value: `+${totalTrajets.toLocaleString('fr-FR')} FCFA`, style: 'positive', icon: EMOJI.camion },
        { label: 'Chiffre d’affaires (expéditions)', value: `+${totalColis.toLocaleString('fr-FR')} FCFA`, style: 'positive', icon: '📦' },
        { label: 'Dépenses', value: `-${totalDepenses.toLocaleString('fr-FR')} FCFA`, style: 'negative', icon: '💸' },
      ],
      columns: [
        { header: 'N° facture', value: (inv) => inv.numero },
        {
          header: 'Date',
          value: (inv) => new Date(inv.dateCreation).toLocaleDateString('fr-FR'),
        },
        {
          header: 'Client / fournisseur',
          value: (inv) => {
            if (inv.expenseId) {
              const expense = getExpense(inv.expenseId);
              const supplier = expense?.fournisseurId ? thirdParties.find(tp => tp.id === expense.fournisseurId) : null;
              return supplier?.nom || '—';
            }
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              if (!ex) return '—';
              const clients = [...new Set(ex.lots.map((l) => l.clients?.trim()).filter(Boolean) as string[])];
              return clients.join(', ') || '—';
            }
            const trip = getTrip(inv.trajetId);
            return trip?.client || '—';
          },
        },
        {
          header: 'Type',
          value: (inv) => (inv.expenseId ? 'Dépense' : inv.parcelExpeditionId ? 'Expédition' : 'Trajet'),
        },
        {
          header: 'Statut mission',
          value: (inv) => {
            if (inv.expenseId) return '—';
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex ? formatTripStatusFr(ex.statut) : '—';
            }
            const trip = getTrip(inv.trajetId);
            return trip ? formatTripStatusFr(trip.statut) : '—';
          },
        },
        {
          header: 'Détails',
          value: (inv) => {
            if (inv.expenseId) {
              const expense = getExpense(inv.expenseId);
              return expense ? expense.description : '';
            }
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex ? `${ex.reference} · ${ex.origine} → ${ex.destination}` : '';
            }
            return getTripLabel(inv.trajetId);
          },
        },
        {
          header: 'Marchandise / catégorie',
          value: (inv) => {
            if (inv.expenseId) {
              const expense = getExpense(inv.expenseId);
              return expense ? `${expense.categorie}${expense.sousCategorie ? ' · ' + expense.sousCategorie : ''}` : '';
            }
            if (inv.parcelExpeditionId) {
              const ex = getParcelExpedition(inv.parcelExpeditionId);
              return ex ? `${ex.lots.length} ligne(s) colis` : '—';
            }
            const trip = getTrip(inv.trajetId);
            return trip?.marchandise || '—';
          },
        },
        {
          header: 'Montant TTC',
          value: (inv) => {
            // Si c'est une dépense, afficher en négatif, sinon en positif (trajet = recette)
            const isExpense = !!inv.expenseId;
            return isExpense ? `-${inv.montantTTC.toLocaleString('fr-FR')} FCFA` : `+${inv.montantTTC.toLocaleString('fr-FR')} FCFA`;
          },
          cellStyle: (inv) => inv.expenseId ? 'negative' : 'positive'
        },
        {
          header: 'Déjà payé',
          value: (inv) => {
            const paye = inv.montantPaye ?? 0;
            const isExpense = !!inv.expenseId;
            return isExpense ? `-${paye.toLocaleString('fr-FR')} FCFA` : `+${paye.toLocaleString('fr-FR')} FCFA`;
          },
          cellStyle: () => 'neutral' as const,
        },
        {
          header: 'Reste à payer',
          value: (inv) => {
            const reste = Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0));
            const isExpense = !!inv.expenseId;
            return isExpense ? `-${reste.toLocaleString('fr-FR')} FCFA` : `+${reste.toLocaleString('fr-FR')} FCFA`;
          },
          cellStyle: (inv) => {
            const reste = Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0));
            if (reste <= 0.01) return 'positive';
            return inv.expenseId ? 'negative' : 'negative';
          },
        },
        {
          header: 'Statut',
          value: (inv) => {
            const r = Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0));
            if (r <= 0.01) return 'Soldée';
            if ((inv.montantPaye ?? 0) > 0) return 'Partiellement payée';
            return 'En attente';
          },
          cellStyle: (inv) => {
            const r = Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0));
            if (r <= 0.01) return 'positive';
            return 'negative';
          },
        },
      ],
      rows: sortedInvoices,
    });
  };

  // Calcul des statistiques (basées sur les factures filtrées)
  const totalFactures = filteredInvoices.length;
  const facturesPayees = filteredInvoices.filter(inv => inv.statut === 'payee').length;
  const facturesEnAttente = filteredInvoices.filter(inv => inv.statut === 'en_attente').length;
  const montantTotal = filteredInvoices.reduce((sum, inv) => sum + inv.montantHT, 0);
  // Calculer le montant en attente en tenant compte des paiements partiels
  const montantEnAttente = filteredInvoices.reduce((sum, inv) => {
    const montantPaye = inv.montantPaye || 0;
    const montantRestant = inv.montantTTC - montantPaye;
    return sum + Math.max(0, montantRestant); // S'assurer que le montant restant n'est pas négatif
  }, 0);

  const handleDownloadPDF = async () => {
    if (!selectedInvoice) return;

    const dejaPaye = selectedInvoice.montantPaye ?? 0;
    const resteAPayer = Math.max(0, selectedInvoice.montantTTC - dejaPaye);

    try {
      const trip = getTrip(selectedInvoice.trajetId);
      const expense = getExpense(selectedInvoice.expenseId);
      const parcelEx = getParcelExpedition(selectedInvoice.parcelExpeditionId);
      const driver = trip?.chauffeurId
        ? drivers.find((d) => d.id === trip.chauffeurId)
        : parcelEx?.chauffeurId
          ? drivers.find((d) => d.id === parcelEx.chauffeurId)
          : expense?.chauffeurId
            ? drivers.find((d) => d.id === expense.chauffeurId)
            : null;
      const expenseSupplier = expense?.fournisseurId
        ? thirdParties.find((tp) => tp.id === expense.fournisseurId)
        : null;

      const clientTier = selectedInvoice.clientTierId
        ? thirdParties.find((tp) => tp.id === selectedInvoice.clientTierId)
        : null;

      openPdfPrintWindow({
        title: `Facture ${selectedInvoice.numero}`,
        variant: 'invoice',
        accentColor: '#2563eb',
        bodyHtml: buildSingleInvoicePdfInnerHtml({
          invoice: selectedInvoice,
          dejaPaye,
          resteAPayer,
          trip,
          expense,
          parcelExpedition: parcelEx ?? null,
          driver: driver ?? null,
          fournisseurNom: expenseSupplier?.nom ?? null,
          clientLabel: clientTier?.nom ?? selectedInvoice.factureClientLibelle ?? undefined,
          getTruckLabel,
        }),
      });
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      toast.error('Erreur lors de la génération du PDF');
    }
  };

  return (
    <div className="space-y-6 p-1">
      {/* En-tête professionnel */}
      <PageHeader
        title="Gestion des Factures"
        description={PAGE_FACTURES_DESCRIPTION}
        icon={FileText}
        gradient="from-indigo-500/20 via-blue-500/10 to-transparent"
        stats={[
          {
            label: 'Total',
            value: totalFactures,
            icon: <FileText className="h-4 w-4" />,
            color: 'text-blue-600 dark:text-blue-400'
          },
          {
            label: 'Payées',
            value: facturesPayees,
            icon: <CheckCircle2 className="h-4 w-4" />,
            color: 'text-green-600 dark:text-green-400'
          },
          {
            label: 'En attente',
            value: facturesEnAttente,
            icon: <Clock className="h-4 w-4" />,
            color: 'text-yellow-600 dark:text-yellow-400'
          },
          {
            label: 'Montant Total',
            value: montantTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 }),
            icon: <DollarSign className="h-4 w-4" />,
            color: 'text-purple-600 dark:text-purple-400'
          }
        ]}
        actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="shadow-sm"
            disabled={sortedInvoices.length === 0}
            onClick={handleExportInvoicesExcel}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Button
            variant="outline"
            className="shadow-sm"
            disabled={sortedInvoices.length === 0}
            onClick={handleExportInvoicesPDF}
          >
            <FileText className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            {canManageAccounting && (
            <DialogTrigger asChild>
              <Button className="shadow-md hover:shadow-lg transition-all duration-300">
                <Plus className="mr-2 h-4 w-4" />
                Facture Trajet
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="w-[96vw] max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer une facture professionnelle</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                {/* Afficher le numéro de facture qui sera généré */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Numéro de facture qui sera attribué :</Label>
                      <p className="text-2xl font-bold text-primary mt-1 font-mono">{nextInvoiceNumber}</p>
                    </div>
                    <div className="p-3 bg-primary/20 rounded-lg">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <Label>Type de mission</Label>
                  <RadioGroup
                    value={invoiceMissionKind}
                    onValueChange={(v) => {
                      setInvoiceMissionKind(v as 'trip' | 'parcel');
                      setSelectedTripId('');
                      setSelectedParcelExpeditionId('');
                    }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  >
                    <div className="flex items-center space-x-2 rounded-md border border-border bg-background px-3 py-2">
                      <RadioGroupItem value="trip" id="inv-kind-trip" />
                      <Label htmlFor="inv-kind-trip" className="font-normal cursor-pointer">
                        Trajet
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 rounded-md border border-border bg-background px-3 py-2">
                      <RadioGroupItem value="parcel" id="inv-kind-parcel" />
                      <Label htmlFor="inv-kind-parcel" className="font-normal cursor-pointer">
                        Expédition
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {invoiceMissionKind === 'trip' && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <Label htmlFor="trip">Sélectionner un trajet *</Label>
                  <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                    <SelectTrigger className="min-w-0">
                      <SelectValue
                        className="min-w-0 flex-1 truncate text-left"
                        placeholder="Sélectionner un trajet"
                      >
                        {selectedTripId && (() => {
                          const selectedTrip = getTrip(selectedTripId);
                          if (!selectedTrip) return selectedTripId;
                          const shortId = selectedTripId.slice(-6);
                          return `[ID: ${shortId}] ${selectedTrip.origine} → ${selectedTrip.destination}`;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableTrips.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <p className="mb-2">{EMOJI.alerte} Aucun trajet disponible pour facturation</p>
                          <p className="text-xs">
                            Pour créer une facture, le trajet doit avoir une recette &gt; 0 FCFA et un{' '}
                            <strong>reste à facturer</strong> (la somme des TTC des factures du trajet ne doit pas
                            dépasser la recette).
                          </p>
                        </div>
                      ) : (
                        availableTrips.map(trip => {
                          const statusLabels = {
                            planifie: 'Planifié',
                            en_cours: 'En cours',
                            termine: 'Terminé',
                            annule: 'Annulé'
                          };
                          const tripDetails = getTrip(trip.id);
                          const driver = tripDetails ? drivers.find(d => d.id === tripDetails.chauffeurId) : null;
                          // Extraire les 6 derniers caractères de l'ID pour un affichage plus court
                          const shortId = trip.id.slice(-6);
                          const dateDepart = tripDetails ? new Date(tripDetails.dateDepart).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                          const resteFact = getTripRemainingRecetteToInvoice(trip, invoices);
                          const dejaTtc = sumMontantTTCForTripInvoices(trip.id, invoices);

                          return (
                            <SelectItem key={trip.id} value={trip.id} className="py-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">ID: {shortId}</span>
                                  <span className="font-semibold">{trip.origine} → {trip.destination}</span>
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                  {dateDepart && <span>{EMOJI.date} {dateDepart}</span>}
                                  {driver && <span>{EMOJI.personne} {driver.prenom} {driver.nom}</span>}
                                  {tripDetails?.client && <span>🏢 {tripDetails.client}</span>}
                                  <span className="font-semibold text-primary">Recette {trip.recette.toLocaleString('fr-FR')} FCFA</span>
                                  {dejaTtc > 0.01 && (
                                    <span className="text-orange-600 dark:text-orange-400">
                                      Déjà fact. {dejaTtc.toLocaleString('fr-FR')} · Reste {resteFact.toLocaleString('fr-FR')}
                                    </span>
                                  )}
                                  <span>({statusLabels[trip.statut]})</span>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                )}

                {invoiceMissionKind === 'parcel' && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                  <Label htmlFor="parcel-ex">Sélectionner une expédition *</Label>
                  <Select value={selectedParcelExpeditionId} onValueChange={setSelectedParcelExpeditionId}>
                    <SelectTrigger
                      id="parcel-ex"
                      className="h-auto min-h-10 items-start gap-2 py-2 text-left [&>span]:line-clamp-none [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:items-start"
                    >
                      <SelectValue placeholder="Réf. · destination · CA">
                        {selectedParcelExpeditionId &&
                          (() => {
                            const ex = parcelExpeditions.find((e) => e.id === selectedParcelExpeditionId);
                            if (!ex) return selectedParcelExpeditionId;
                            const ca = sumParcelExpeditionLotsCa(ex);
                            const shortId = ex.id.slice(-6);
                            return (
                              <div className="flex min-w-0 flex-1 flex-col gap-1 pr-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                                    {ex.reference}
                                  </span>
                                  <span className="min-w-0 truncate font-semibold">
                                    {ex.origine} → {ex.destination}
                                  </span>
                                </div>
                                <span className="truncate text-xs text-muted-foreground">
                                  {new Date(ex.dateDepart).toLocaleDateString('fr-FR')} · CA lignes{' '}
                                  {ca.toLocaleString('fr-FR')} FCFA · ID …{shortId}
                                </span>
                              </div>
                            );
                          })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableParcelExpeditions.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <p className="mb-2">{EMOJI.alerte} Aucune expédition disponible</p>
                          <p className="text-xs">
                            CA lignes &gt; 0, pas annulé, sans facture déjà créée.
                          </p>
                        </div>
                      ) : (
                        availableParcelExpeditions.map((ex) => {
                          const ca = sumParcelExpeditionLotsCa(ex);
                          const shortId = ex.id.slice(-6);
                          return (
                            <SelectItem key={ex.id} value={ex.id} className="py-2">
                              <div className="flex flex-col gap-1">
                                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded w-fit">
                                  {ex.reference}
                                </span>
                                <span className="font-semibold">
                                  {ex.origine} → {ex.destination}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(ex.dateDepart).toLocaleDateString('fr-FR')} · CA lignes{' '}
                                  {ca.toLocaleString('fr-FR')} FCFA · ID …{shortId}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                )}

                {/* Afficher TOUTES les détails du trajet sélectionné */}
                {invoiceMissionKind === 'trip' && selectedTripId && (() => {
                  const selectedTrip = getTrip(selectedTripId);
                  if (!selectedTrip) return null;
                  const driver = drivers.find(d => d.id === selectedTrip.chauffeurId);
                  const tracteur = selectedTrip.tracteurId ? trucks.find(t => t.id === selectedTrip.tracteurId) : null;
                  const remorqueuse = selectedTrip.remorqueuseId ? trucks.find(t => t.id === selectedTrip.remorqueuseId) : null;
                  
                  const getStatusLabel = (statut: string) => {
                    const labels: Record<string, string> = {
                      planifie: 'Planifié',
                      en_cours: 'En cours',
                      termine: 'Terminé',
                      annule: 'Annulé'
                    };
                    return labels[statut] || statut;
                  };

                  const getStatusColor = (statut: string) => {
                    const colors: Record<string, string> = {
                      planifie: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
                      en_cours: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
                      termine: 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400',
                      annule: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                    };
                    return colors[statut] || '';
                  };

                  return (
                    <div className="bg-gradient-to-br from-muted/50 to-muted/30 border-2 border-primary/20 rounded-lg p-5 space-y-4 shadow-md">
                      {/* En-tête avec ID */}
                      <div className="flex items-center justify-between pb-3 border-b border-border">
                        <Label className="text-base font-bold">{EMOJI.liste} Informations complètes du trajet</Label>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(selectedTrip.statut)}>
                            {getStatusLabel(selectedTrip.statut)}
                          </Badge>
                          <span className="font-mono text-xs bg-primary/20 text-primary px-3 py-1.5 rounded font-bold border border-primary/30">
                            ID: {selectedTripId}
                          </span>
                        </div>
                      </div>

                      {/* Informations principales */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Itinéraire */}
                        <div className="md:col-span-2 bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Itinéraire</span>
                          </div>
                          <p className="text-lg font-bold text-primary">
                            {selectedTrip.origine} → {selectedTrip.destination}
                          </p>
                        </div>

                        {/* Dates */}
                        <div className="space-y-2">
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground">{EMOJI.date} Date de départ</span>
                            <p className="text-sm font-medium mt-1">{new Date(selectedTrip.dateDepart).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                          </div>
                          {selectedTrip.dateArrivee && (
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">{EMOJI.date} Date d'arrivée</span>
                              <p className="text-sm font-medium mt-1">{new Date(selectedTrip.dateArrivee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>
                          )}
                          {!selectedTrip.dateArrivee && (
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">{EMOJI.date} Date d'arrivée</span>
                              <p className="text-sm text-muted-foreground italic mt-1">À définir</p>
                            </div>
                          )}
                        </div>

                        {/* Chauffeur */}
                        {driver && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">{EMOJI.personne} Chauffeur</span>
                              <p className="text-sm font-medium mt-1">{driver.prenom} {driver.nom}</p>
                              {driver.telephone && (
                                <p className="text-xs text-muted-foreground mt-1">{EMOJI.telephone} {driver.telephone}</p>
                              )}
                              {driver.cni && (
                                <p className="text-xs text-muted-foreground">🪪 CNI: {driver.cni}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tracteur */}
                        {tracteur && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">{EMOJI.camion} Tracteur</span>
                              <p className="text-sm font-medium mt-1">{tracteur.immatriculation}</p>
                              <p className="text-xs text-muted-foreground mt-1">Modèle: {tracteur.modele}</p>
                            </div>
                          </div>
                        )}

                        {/* Remorqueuse */}
                        {remorqueuse && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">🚚 Remorqueuse</span>
                              <p className="text-sm font-medium mt-1">{remorqueuse.immatriculation}</p>
                              <p className="text-xs text-muted-foreground mt-1">Modèle: {remorqueuse.modele}</p>
                            </div>
                          </div>
                        )}

                        {/* Client */}
                        {selectedTrip.client && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">🏢 Client</span>
                              <p className="text-sm font-medium mt-1">{selectedTrip.client}</p>
                            </div>
                          </div>
                        )}

                        {/* Marchandise */}
                        {selectedTrip.marchandise && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">📦 Marchandise</span>
                              <p className="text-sm font-medium mt-1">{selectedTrip.marchandise}</p>
                            </div>
                          </div>
                        )}

                        {selectedTrip.referenceAtc && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">Réf. ATC</span>
                              <p className="text-sm font-medium mt-1 font-mono">{selectedTrip.referenceAtc}</p>
                            </div>
                          </div>
                        )}
                        {selectedTrip.destinataire && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">Destinataire livraison</span>
                              <p className="text-sm font-medium mt-1">{selectedTrip.destinataire}</p>
                            </div>
                          </div>
                        )}
                        {selectedTrip.quantiteChargee != null && selectedTrip.quantiteChargee > 0 && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">Quantité</span>
                              <p className="text-sm font-medium mt-1">
                                {selectedTrip.quantiteChargee.toLocaleString('fr-FR')}
                              </p>
                            </div>
                          </div>
                        )}
                        {selectedTrip.retourBordereaux && (
                          <div className="space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">Retour bordereaux</span>
                              <p className="text-sm font-medium mt-1">{selectedTrip.retourBordereaux}</p>
                            </div>
                          </div>
                        )}

                        {/* Recette */}
                        <div className="md:col-span-2 bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border-2 border-green-200 dark:border-green-800">
                          <span className="text-xs font-semibold text-green-700 dark:text-green-400">{EMOJI.argent} Recette</span>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
                            {selectedTrip.recette.toLocaleString('fr-FR')} FCFA
                          </p>
                        </div>

                        {/* Description */}
                        {selectedTrip.description && (
                          <div className="md:col-span-2 space-y-2">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground">📝 Description</span>
                              <p className="text-sm mt-1 bg-background/50 p-2 rounded border border-border">
                                {selectedTrip.description}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {invoiceMissionKind === 'parcel' && selectedParcelExpeditionId && (() => {
                  const ex = getParcelExpedition(selectedParcelExpeditionId);
                  if (!ex) return null;
                  const driver = drivers.find((d) => d.id === ex.chauffeurId);
                  const ca = sumParcelExpeditionLotsCa(ex);
                  return (
                    <div className="bg-gradient-to-br from-sky-500/10 to-cyan-500/5 border-2 border-sky-500/25 rounded-lg p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-base font-bold flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Détail expédition (base HT facture = CA lignes)
                        </Label>
                        <Badge variant="outline">
                          {formatTripStatusFr(ex.statut)}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {ex.origine} → {ex.destination}
                      </p>
                      <p className="text-sm text-muted-foreground font-mono">{ex.reference}</p>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Départ</span>
                          <p className="font-medium">{new Date(ex.dateDepart).toLocaleDateString('fr-FR')}</p>
                        </div>
                        {ex.dateArrivee && (
                          <div>
                            <span className="text-muted-foreground">Arrivée</span>
                            <p className="font-medium">{new Date(ex.dateArrivee).toLocaleDateString('fr-FR')}</p>
                          </div>
                        )}
                        {driver && (
                          <div>
                            <span className="text-muted-foreground">Chauffeur</span>
                            <p className="font-medium">{driver.prenom} {driver.nom}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">CA lignes</span>
                          <p className="font-bold text-primary">{ca.toLocaleString('fr-FR')} FCFA</p>
                        </div>
                      </div>
                      {ex.description && (
                        <p className="text-xs text-muted-foreground border-t pt-2">{ex.description}</p>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <Label htmlFor="modePaiement">Mode de paiement (optionnel)</Label>
                  <Select value={modePaiement || 'none'} onValueChange={(value) => setModePaiement(value === 'none' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      <SelectItem value="Espèces">Espèces</SelectItem>
                      <SelectItem value="Virement bancaire">Virement bancaire</SelectItem>
                      <SelectItem value="Chèque">Chèque</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Section Remise, TVA et TPS */}
                {(invoiceMissionKind === 'trip' ? selectedTripId : selectedParcelExpeditionId) && (() => {
                  const montantHTInitial =
                    invoiceMissionKind === 'trip'
                      ? (() => {
                          const tr = getTrip(selectedTripId);
                          if (!tr) return 0;
                          const rem = getTripRemainingRecetteToInvoice(tr, invoices);
                          return tripInvoiceMontantHt > 0 ? tripInvoiceMontantHt : rem;
                        })()
                      : (() => {
                          const ex = getParcelExpedition(selectedParcelExpeditionId);
                          return ex ? sumParcelExpeditionLotsCa(ex) : 0;
                        })();
                  if (montantHTInitial <= 0) return null;
                  const montantRemise = montantHTInitial * (remise / 100);
                  const montantHTApresRemise = montantHTInitial - montantRemise;
                  const montantTVA = montantHTApresRemise * (tva / 100);
                  const montantTPS = montantHTApresRemise * (tps / 100);
                  const montantTTC = montantHTApresRemise + montantTVA + montantTPS;

                  return (
                    <div className="space-y-4 border-t pt-4">
                      {invoiceMissionKind === 'trip' && selectedTripId && (() => {
                        const st = getTrip(selectedTripId);
                        if (!st) return null;
                        const remTtc = getTripRemainingRecetteToInvoice(st, invoices);
                        const deja = sumMontantTTCForTripInvoices(st.id, invoices);
                        return (
                          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                            <p className="text-sm font-semibold">Plusieurs structures facturées sur une mission</p>
                            <p className="text-xs text-muted-foreground">
                              Une même rotation peut servir plusieurs comptes : chaque facture a son montant et son client ;
                              la somme des TTC ne peut pas dépasser la recette du trajet.
                            </p>
                            <div className="grid gap-2 text-xs sm:grid-cols-3 text-muted-foreground">
                              <span>
                                Recette trajet :{' '}
                                <b className="text-foreground">{st.recette.toLocaleString('fr-FR')} FCFA</b>
                              </span>
                              <span>
                                Déjà facturé (TTC) :{' '}
                                <b className="text-foreground">{deja.toLocaleString('fr-FR')} FCFA</b>
                              </span>
                              <span>
                                Reste à facturer :{' '}
                                <b className="text-primary">{remTtc.toLocaleString('fr-FR')} FCFA</b>
                              </span>
                            </div>
                            <div>
                              <Label htmlFor="trip-inv-ht">Montant HT pour cette facture *</Label>
                              <NumberInput
                                id="trip-inv-ht"
                                className="mt-1"
                                value={tripInvoiceMontantHt}
                                onChange={(v) => setTripInvoiceMontantHt(v || 0)}
                                min={0}
                                max={remTtc > 0 ? remTtc : undefined}
                              />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label>Fiche client (optionnel)</Label>
                              <ThirdPartyPicker
                                className="mt-1"
                                options={tierClientsFiches}
                                value={invoiceTripClientTierId}
                                onValueChange={(id) => setInvoiceTripClientTierId(id)}
                                placeholder="Rechercher une fiche client…"
                                searchPlaceholder="Nom, téléphone…"
                                topChoices={[
                                  {
                                    id: '',
                                    label: 'Sans fiche (libellé ci-contre)',
                                    keywords: 'sans fiche libre',
                                  },
                                ]}
                              />
                            </div>
                              <div>
                                <Label htmlFor="trip-inv-lib">Libellé client sur la facture</Label>
                                <Input
                                  id="trip-inv-lib"
                                  className="mt-1"
                                  placeholder="Ex. filiale, groupement…"
                                  value={invoiceTripClientLibelle}
                                  onChange={(e) => setInvoiceTripClientLibelle(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Remise */}
                      <div>
                        <Label className="text-base font-semibold mb-3 block">Remise (optionnel)</Label>
                        <div>
                          <Label htmlFor="remise">Remise (%)</Label>
                          <NumberInput
                            id="remise"
                            value={remise}
                            onChange={(value) => setRemise(value || 0)}
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="0"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Ex: 10 pour 10% de remise</p>
                        </div>
                      </div>

                      {/* TVA et TPS */}
                      <div>
                        <Label className="text-base font-semibold mb-3 block">Taux et taxes</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="tva">TVA (%)</Label>
                            <NumberInput
                              id="tva"
                              value={tva}
                              onChange={(value) => setTva(value || 0)}
                              min={0}
                              max={100}
                              step={0.1}
                              placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Ex: 19.25 pour 19.25%</p>
                          </div>
                          <div>
                            <Label htmlFor="tps">TPS (%)</Label>
                            <NumberInput
                              id="tps"
                              value={tps}
                              onChange={(value) => setTps(value || 0)}
                              min={0}
                              max={100}
                              step={0.1}
                              placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Ex: 5 pour 5%</p>
                          </div>
                        </div>
                      </div>

                      {/* Aperçu du calcul */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
                        <Label className="text-sm font-semibold">Aperçu du calcul :</Label>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Montant HT initial :</span>
                            <span className="font-medium">{montantHTInitial.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          {remise > 0 && (
                            <>
                              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                <span>Remise ({remise}%) :</span>
                                <span className="font-medium">-{montantRemise.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-border">
                                <span className="text-muted-foreground">Montant HT après remise :</span>
                                <span className="font-semibold">{montantHTApresRemise.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                              </div>
                            </>
                          )}
                          {tva > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">TVA ({tva}%) :</span>
                              <span className="font-medium">{montantTVA.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                            </div>
                          )}
                          {tps > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">TPS ({tps}%) :</span>
                              <span className="font-medium">{montantTPS.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-2 border-t border-border font-bold text-lg">
                            <span>Montant TTC :</span>
                            <span className="text-primary">{montantTTC.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <Label htmlFor="notes">Notes (optionnel)</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Remarques ou commentaires"
                  />
                </div>

                <Button onClick={handleCreateInvoice} className="w-full" disabled={isCreatingTripInvoice}>
                  {isCreatingTripInvoice ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</>
                  ) : (
                    'Créer la facture'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isExpenseInvoiceDialogOpen} onOpenChange={setIsExpenseInvoiceDialogOpen}>
            {canManageAccounting && (
            <DialogTrigger asChild>
              <Button variant="outline" className="shadow-md hover:shadow-lg transition-all duration-300">
                <Plus className="mr-2 h-4 w-4" />
                Facture Dépense
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer une facture de dépense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Afficher le numéro de facture qui sera généré */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Numéro de facture qui sera attribué :</Label>
                      <p className="text-2xl font-bold text-primary mt-1 font-mono">
                        {(() => {
                          const year = new Date().getFullYear();
                          const invoiceCount = invoices.filter(inv => inv.numero.startsWith(`FAC-EXP-${year}`)).length + 1;
                          return `FAC-EXP-${year}-${String(invoiceCount).padStart(3, '0')}`;
                        })()}
                      </p>
                    </div>
                    <div className="p-3 bg-primary/20 rounded-lg">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="expense">Sélectionner une dépense *</Label>
                  <Select value={selectedExpenseId} onValueChange={setSelectedExpenseId}>
                    <SelectTrigger
                      className="h-auto min-h-10 items-start gap-2 py-2 text-left [&>span]:line-clamp-none [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:items-start"
                    >
                      <SelectValue placeholder="Sélectionner une dépense">
                        {selectedExpenseId &&
                          (() => {
                            const expense = expenses.find((e) => e.id === selectedExpenseId);
                            if (!expense) return selectedExpenseId;
                            const truck = trucks.find((t) => t.id === expense.camionId);
                            const supplier = expense.fournisseurId
                              ? thirdParties.find((tp) => tp.id === expense.fournisseurId)
                              : null;
                            return (
                              <div className="flex min-w-0 flex-1 flex-col gap-1 pr-1">
                                <div className="min-w-0 truncate font-semibold">
                                  {expense.categorie}
                                  {expense.sousCategorie ? (
                                    <span className="font-normal text-muted-foreground">
                                      {' '}
                                      — {expense.sousCategorie}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="truncate text-xs text-muted-foreground">
                                  {truck ? `${EMOJI.camion} ${truck.immatriculation} · ` : ''}
                                  {supplier ? `${supplier.nom} · ` : ''}
                                  <span className="font-semibold text-primary">
                                    {expense.montant.toLocaleString('fr-FR')} FCFA
                                  </span>
                                  {' · '}
                                  {new Date(expense.date).toLocaleDateString('fr-FR')}
                                </span>
                              </div>
                            );
                          })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableExpenses.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <p className="mb-2">{EMOJI.alerte} Aucune dépense disponible pour facturation</p>
                          <p className="text-xs">
                            Toutes les dépenses ont déjà une facture associée
                          </p>
                        </div>
                      ) : (
                        availableExpenses.map(expense => {
                          const truck = trucks.find(t => t.id === expense.camionId);
                          const supplier = expense.fournisseurId ? thirdParties.find(tp => tp.id === expense.fournisseurId) : null;
                          return (
                            <SelectItem key={expense.id} value={expense.id}>
                              <div className="flex flex-col gap-1 py-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{expense.categorie}</span>
                                  {expense.sousCategorie && <span className="text-xs text-muted-foreground">- {expense.sousCategorie}</span>}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                  {truck && <span>{EMOJI.camion} {truck.immatriculation}</span>}
                                  {supplier && <span>🏢 {supplier.nom}</span>}
                                  <span className="font-semibold text-primary">{expense.montant.toLocaleString('fr-FR')} FCFA</span>
                                  <span>{EMOJI.date} {new Date(expense.date).toLocaleDateString('fr-FR')}</span>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Afficher les détails de la dépense sélectionnée */}
                {selectedExpenseId && (() => {
                  const selectedExpense = expenses.find(e => e.id === selectedExpenseId);
                  if (!selectedExpense) return null;
                  const truck = trucks.find(t => t.id === selectedExpense.camionId);
                  const driver = selectedExpense.chauffeurId ? drivers.find(d => d.id === selectedExpense.chauffeurId) : null;
                  const supplier = selectedExpense.fournisseurId ? thirdParties.find(tp => tp.id === selectedExpense.fournisseurId) : null;
                  const trip = selectedExpense.tripId ? trips.find(t => t.id === selectedExpense.tripId) : null;

                  return (
                    <div className="bg-gradient-to-br from-muted/50 to-muted/30 border-2 border-primary/20 rounded-lg p-5 space-y-4 shadow-md">
                      <div className="flex items-center justify-between pb-3 border-b border-border">
                        <Label className="text-base font-bold">{EMOJI.liste} Informations de la dépense</Label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 bg-primary/5 rounded-lg p-3 border border-primary/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Description</span>
                          </div>
                          <p className="text-lg font-bold text-primary">{selectedExpense.description}</p>
                        </div>

                        <div>
                          <span className="text-xs font-semibold text-muted-foreground">📦 Catégorie</span>
                          <p className="text-sm font-medium mt-1">{selectedExpense.categorie}</p>
                          {selectedExpense.sousCategorie && (
                            <p className="text-xs text-muted-foreground">Sous-catégorie: {selectedExpense.sousCategorie}</p>
                          )}
                        </div>

                        <div>
                          <span className="text-xs font-semibold text-muted-foreground">{EMOJI.argent} Montant</span>
                          <p className="text-sm font-medium mt-1">{selectedExpense.montant.toLocaleString('fr-FR')} FCFA</p>
                        </div>

                        {truck && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground">{EMOJI.camion} Camion</span>
                            <p className="text-sm font-medium mt-1">{truck.immatriculation}</p>
                            <p className="text-xs text-muted-foreground">Modèle: {truck.modele}</p>
                          </div>
                        )}

                        {driver && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground">{EMOJI.personne} Chauffeur</span>
                            <p className="text-sm font-medium mt-1">{driver.prenom} {driver.nom}</p>
                          </div>
                        )}

                        {supplier && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground">🏢 Fournisseur</span>
                            <p className="text-sm font-medium mt-1">{supplier.nom}</p>
                          </div>
                        )}

                        {trip && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground">🚚 Trajet lié</span>
                            <p className="text-sm font-medium mt-1">{trip.origine} → {trip.destination}</p>
                          </div>
                        )}

                        <div>
                          <span className="text-xs font-semibold text-muted-foreground">{EMOJI.date} Date</span>
                          <p className="text-sm font-medium mt-1">{new Date(selectedExpense.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <Label htmlFor="modePaiementExpense">Mode de paiement (optionnel)</Label>
                  <Select value={modePaiement || 'none'} onValueChange={(value) => setModePaiement(value === 'none' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      <SelectItem value="Espèces">Espèces</SelectItem>
                      <SelectItem value="Virement bancaire">Virement bancaire</SelectItem>
                      <SelectItem value="Chèque">Chèque</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Section Remise, TVA et TPS pour dépense */}
                {selectedExpenseId && (() => {
                  const selectedExpense = expenses.find(e => e.id === selectedExpenseId);
                  if (!selectedExpense) return null;
                  
                  const montantHTInitial = selectedExpense.montant;
                  const montantRemise = montantHTInitial * (expenseRemise / 100);
                  const montantHTApresRemise = montantHTInitial - montantRemise;
                  const montantTVA = montantHTApresRemise * (expenseTva / 100);
                  const montantTPS = montantHTApresRemise * (expenseTps / 100);
                  const montantTTC = montantHTApresRemise + montantTVA + montantTPS;

                  return (
                    <div className="space-y-4 border-t pt-4">
                      {/* Remise */}
                      <div>
                        <Label className="text-base font-semibold mb-3 block">Remise (optionnel)</Label>
                        <div>
                          <Label htmlFor="expenseRemise">Remise (%)</Label>
                          <NumberInput
                            id="expenseRemise"
                            value={expenseRemise}
                            onChange={(value) => setExpenseRemise(value || 0)}
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="0"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Ex: 10 pour 10% de remise</p>
                        </div>
                      </div>

                      {/* TVA et TPS */}
                      <div>
                        <Label className="text-base font-semibold mb-3 block">Taux et taxes</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="expenseTva">TVA (%)</Label>
                            <NumberInput
                              id="expenseTva"
                              value={expenseTva}
                              onChange={(value) => setExpenseTva(value || 0)}
                              min={0}
                              max={100}
                              step={0.1}
                              placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Ex: 19.25 pour 19.25%</p>
                          </div>
                          <div>
                            <Label htmlFor="expenseTps">TPS (%)</Label>
                            <NumberInput
                              id="expenseTps"
                              value={expenseTps}
                              onChange={(value) => setExpenseTps(value || 0)}
                              min={0}
                              max={100}
                              step={0.1}
                              placeholder="0"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Ex: 5 pour 5%</p>
                          </div>
                        </div>
                      </div>

                      {/* Aperçu du calcul */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
                        <Label className="text-sm font-semibold">Aperçu du calcul :</Label>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Montant HT initial :</span>
                            <span className="font-medium">{montantHTInitial.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          {expenseRemise > 0 && (
                            <>
                              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                <span>Remise ({expenseRemise}%) :</span>
                                <span className="font-medium">-{montantRemise.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-border">
                                <span className="text-muted-foreground">Montant HT après remise :</span>
                                <span className="font-semibold">{montantHTApresRemise.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                              </div>
                            </>
                          )}
                          {expenseTva > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">TVA ({expenseTva}%) :</span>
                              <span className="font-medium">{montantTVA.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                            </div>
                          )}
                          {expenseTps > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">TPS ({expenseTps}%) :</span>
                              <span className="font-medium">{montantTPS.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                            </div>
                          )}
                          <div className="flex justify-between pt-2 border-t border-border font-bold text-lg">
                            <span>Montant TTC :</span>
                            <span className="text-primary">{montantTTC.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <Label htmlFor="notesExpense">Notes (optionnel)</Label>
                  <Input
                    id="notesExpense"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Remarques ou commentaires"
                  />
                </div>

                <Button onClick={handleCreateExpenseInvoice} className="w-full" disabled={!selectedExpenseId || isCreatingExpenseInvoice}>
                  {isCreatingExpenseInvoice ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</>
                  ) : (
                    'Créer la facture de dépense'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        }
      />

      {/* Barre de filtres */}
      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filtres
            </CardTitle>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-4">
            {/* Recherche par nom/número */}
            <div className="space-y-2">
              <Label htmlFor="search" className="text-xs">Recherche</Label>
              <Input
                id="search"
                placeholder="Client ou N° facture"
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                className="h-9"
              />
            </div>

            {/* Filtre par type de facture */}
            <div className="space-y-2">
              <Label htmlFor="typeFilter" className="text-xs">Type</Label>
              <Select
                value={filters.type || 'all'}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    type: value === 'all' ? '' : value,
                    tripId: value === 'parcel' ? '' : filters.tripId,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="trip">{EMOJI.camion} Trajets</SelectItem>
                  <SelectItem value="parcel">📦 Expéditions</SelectItem>
                  <SelectItem value="expense">{EMOJI.argent} Dépenses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtre par trajet */}
            <div className="space-y-2">
              <Label htmlFor="tripFilter" className="text-xs">Trajet</Label>
              <Select
                value={filters.tripId || 'all'}
                onValueChange={(value) => setFilters({ ...filters, tripId: value === 'all' ? '' : value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tous les trajets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les trajets</SelectItem>
                  {Array.from(new Set(invoices.map(inv => inv.trajetId))).map(tripId => {
                    const trip = getTrip(tripId);
                    if (!trip) return null;
                    return (
                      <SelectItem key={tripId} value={tripId}>
                        {trip.origine} → {trip.destination}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Filtre par chauffeur */}
            <div className="space-y-2">
              <Label htmlFor="driverFilter" className="text-xs">Chauffeur</Label>
              <Select
                value={filters.driverId || 'all'}
                onValueChange={(value) => setFilters({ ...filters, driverId: value === 'all' ? '' : value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tous les chauffeurs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les chauffeurs</SelectItem>
                  {Array.from(new Set(
                    invoices
                      .map(inv => {
                        const trip = getTrip(inv.trajetId);
                        const expense = getExpense(inv.expenseId);
                        const parcelEx = getParcelExpedition(inv.parcelExpeditionId);
                        return trip?.chauffeurId || expense?.chauffeurId || parcelEx?.chauffeurId;
                      })
                      .filter(Boolean) as string[]
                  )).map(driverId => {
                    const driver = drivers.find(d => d.id === driverId);
                    if (!driver) return null;
                    return (
                      <SelectItem key={driverId} value={driverId}>
                        {driver.prenom} {driver.nom}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Filtre par statut */}
            <div className="space-y-2">
              <Label htmlFor="statusFilter" className="text-xs">Statut</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? '' : value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="en_attente">En attente</SelectItem>
                  <SelectItem value="payee">Payée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtre impayés / encaissement (montants) */}
            <div className="space-y-2">
              <Label htmlFor="paiementSoldeFilter" className="text-xs">Impayés / encaissement</Label>
              <Select
                value={filters.paiementSolde || 'all'}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    paiementSolde: value === 'all' ? '' : (value as typeof filters.paiementSolde),
                  })
                }
              >
                <SelectTrigger id="paiementSoldeFilter" className="h-9">
                  <SelectValue placeholder="Tous les soldes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les soldes</SelectItem>
                  <SelectItem value="impaye">Impayés (reste à payer)</SelectItem>
                  <SelectItem value="jamais_payee">Jamais payées</SelectItem>
                  <SelectItem value="partiel">Partiellement payées</SelectItem>
                  <SelectItem value="soldee">Soldées</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtre par date (du) */}
            <div className="space-y-2">
              <Label htmlFor="dateFrom" className="text-xs">Date du</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="h-9"
              />
            </div>

            {/* Filtre par date (au) */}
            <div className="space-y-2">
              <Label htmlFor="dateTo" className="text-xs">Date au</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <ListSortSelect
                id="sort-invoices"
                value={listSort}
                onChange={setListSort}
                options={[...INVOICE_SORT_OPTIONS]}
              />
            </div>
          </div>

          {/* Indicateur de filtres actifs */}
          {hasActiveFilters && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>
                  {filteredInvoices.length} facture{filteredInvoices.length > 1 ? 's' : ''} trouvée{filteredInvoices.length > 1 ? 's' : ''} 
                  {filteredInvoices.length !== invoices.length && ` sur ${invoices.length} total`}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tableau des factures */}
      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 px-4 sm:px-6">
          <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-base sm:text-lg font-semibold">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>📄 Factures</span>
              <span className="text-muted-foreground font-normal text-sm sm:text-base">
                Montant en attente&nbsp;:
                <span className="ml-1.5 text-red-600 dark:text-red-400 font-bold tabular-nums">
                  {montantEnAttente.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA
                </span>
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-4 pt-0">
          <Table className="min-w-[1040px] w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[11rem] w-[11rem] whitespace-nowrap">Numéro</TableHead>
                <TableHead className="w-28 min-w-[7rem]">Type</TableHead>
                <TableHead className="min-w-[220px] w-[28%]">Détails</TableHead>
                <TableHead className="whitespace-nowrap w-28">Date création</TableHead>
                <TableHead className="text-right whitespace-nowrap min-w-[7.5rem]">Montant TTC</TableHead>
                <TableHead className="w-32 min-w-[8rem]">Statut</TableHead>
                <TableHead className="min-w-[6rem] max-w-[10rem]">Notes</TableHead>
                <TableHead className="text-right w-36 min-w-[9rem] whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {hasActiveFilters ? (
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-foreground" />
                        <p>Aucune facture ne correspond aux filtres sélectionnés</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={resetFilters}
                          className="mt-2"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Réinitialiser les filtres
                        </Button>
                      </div>
                    ) : (
                      'Aucune facture enregistrée'
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                sortedInvoices.map((invoice) => {
                  const trip = getTrip(invoice.trajetId);
                  const expense = getExpense(invoice.expenseId);
                  const parcelExRow = getParcelExpedition(invoice.parcelExpeditionId);
                  const isExpenseInvoice = !!invoice.expenseId;
                  const isParcelInvoice = !!invoice.parcelExpeditionId;
                  const clientKind = getClientInvoiceKind(invoice);
                  const clientDisplay =
                    clientKind &&
                    buildClientInvoiceDisplay(
                      invoice,
                      clientOrders,
                      clientDeliveries,
                      (id) => (id ? getDriverName(id) : '—'),
                      (id) => (id ? getTruckLabel(id) : '—'),
                      (id) =>
                        id ? thirdParties.find((tp) => tp.id === id)?.nom ?? '—' : '—',
                    );
                  const notesPreview = clientKind
                    ? clientInvoiceNotesPreview(invoice, clientKind)
                    : invoice.notes;

                  return (
                    <TableRow key={invoice.id} className="hover:bg-muted/50 transition-colors duration-200 [&>td]:align-top">
                      <TableCell className="whitespace-nowrap align-top">
                        <div className="font-mono text-sm font-semibold text-foreground">
                          {invoice.numero}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {isExpenseInvoice ? (
                          <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-orange-300">
                            {EMOJI.argent} Dépense
                          </Badge>
                        ) : isParcelInvoice ? (
                          <Badge variant="outline" className="bg-sky-100 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300 border-sky-300">
                            📦 Expédition
                          </Badge>
                        ) : clientKind ? (
                          <Badge
                            variant="outline"
                            className={
                              clientKind === 'delivery'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-300'
                                : 'bg-violet-100 text-violet-800 dark:bg-violet-950/30 dark:text-violet-300 border-violet-300'
                            }
                          >
                            {clientKind === 'delivery' ? '🚚' : <Package className="h-3 w-3 inline mr-0.5" />}
                            {clientInvoiceTypeLabel(clientKind)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-300">
                            {EMOJI.camion} Trajet
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {isExpenseInvoice && expense ? (
                          <div>
                            <div className="font-semibold">{expense.description}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">{expense.categorie}</span>
                              {expense.sousCategorie && <span> - {expense.sousCategorie}</span>}
                            </div>
                            {expense.quantite !== undefined && expense.quantite > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Quantité: {expense.quantite.toLocaleString('fr-FR')} {expense.categorie === 'Carburant' ? 'Litres' : expense.categorie === 'Maintenance' ? 'Pièces' : 'Unités'}
                              </div>
                            )}
                            {expense.prixUnitaire !== undefined && expense.prixUnitaire > 0 && (
                              <div className="text-xs text-muted-foreground">
                                Prix unitaire: {expense.prixUnitaire.toLocaleString('fr-FR')} FCFA
                              </div>
                            )}
                            {expense.chauffeurId && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Chauffeur: {getDriverName(expense.chauffeurId)}
                              </div>
                            )}
                            {expense.fournisseurId && (
                              <div className="text-xs text-muted-foreground">
                                Fournisseur: {thirdParties.find(tp => tp.id === expense.fournisseurId)?.nom || '-'}
                              </div>
                            )}
                          </div>
                        ) : isParcelInvoice && parcelExRow ? (
                          <div>
                            <div className="font-medium">
                              {parcelExRow.reference} · {parcelExRow.origine} → {parcelExRow.destination}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {parcelExRow.lots.length} ligne{parcelExRow.lots.length > 1 ? 's' : ''} ·{' '}
                              {formatTripStatusFr(parcelExRow.statut)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Chauffeur : {getDriverName(parcelExRow.chauffeurId)}
                            </div>
                          </div>
                        ) : clientDisplay ? (
                          <div>
                            <div className="font-medium">{clientDisplay.title}</div>
                            {clientDisplay.lines.map((line) => (
                              <div key={line} className="text-xs text-muted-foreground mt-0.5">
                                {line}
                              </div>
                            ))}
                          </div>
                        ) : trip ? (
                          <div>
                            <div>{getTripLabel(invoice.trajetId)}</div>
                            {(invoice.factureClientLibelle || invoice.clientTierId) && (
                              <div className="text-xs font-medium text-primary mt-0.5">
                                Facturé à :{' '}
                                {invoice.factureClientLibelle ||
                                  (invoice.clientTierId
                                    ? thirdParties.find((tp) => tp.id === invoice.clientTierId)?.nom
                                    : '')}
                              </div>
                            )}
                            {trip.client && (
                              <div className="text-xs text-muted-foreground">
                                Réf. trajet : {trip.client}
                              </div>
                            )}
                            {trip.marchandise && (
                              <div className="text-xs text-muted-foreground">📦 Marchandise: {trip.marchandise}</div>
                            )}
                            {trip && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Chauffeur: {getDriverName(trip.chauffeurId)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">{new Date(invoice.dateCreation).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="text-right align-top">
                        <div className="font-bold text-primary">
                          {invoice.montantTTC.toLocaleString('fr-FR')} FCFA
                        </div>
                        {invoice.montantPaye !== undefined && invoice.montantPaye > 0 && invoice.montantPaye < invoice.montantTTC && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Payé: {invoice.montantPaye.toLocaleString('fr-FR')} FCFA
                            <span className="text-orange-600 dark:text-orange-400 ml-1">
                              (Reste: {(invoice.montantTTC - invoice.montantPaye).toLocaleString('fr-FR')} FCFA)
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge 
                          variant={invoice.statut === 'payee' ? 'default' : invoice.montantPaye && invoice.montantPaye > 0 ? 'secondary' : 'secondary'}
                          className={
                            invoice.statut === 'payee' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' 
                              : invoice.montantPaye && invoice.montantPaye > 0
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400'
                          }
                        >
                  {invoice.statut === 'payee' ? (
                    <><CheckCircle2 className="mr-1 h-3 w-3" /> Payée</>
                  ) : invoice.montantPaye && invoice.montantPaye > 0 ? (
                    <><Clock className="mr-1 h-3 w-3" /> Paiement partiel</>
                  ) : (
                    <><Clock className="mr-1 h-3 w-3" /> En attente</>
                  )}
                </Badge>
                      </TableCell>
                      <TableCell className="align-top max-w-[10rem]">
                        {notesPreview ? (
                          <div className="text-sm text-muted-foreground max-w-xs" title={notesPreview}>
                            <span className="inline-flex items-center gap-1">
                              📝 <span className="truncate">{notesPreview}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <div className="flex flex-nowrap justify-end gap-1.5 sm:gap-2 shrink-0">
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setIsViewDialogOpen(true);
                            }}
                            className="hover:shadow-md transition-all duration-200"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                {canManageAccounting && (invoice.statut === 'en_attente' || (invoice.montantPaye !== undefined && invoice.montantPaye > 0 && invoice.montantPaye < invoice.montantTTC)) && (
                  <Button 
                              size="sm"
                    variant="default"
                    onClick={() => handleMarkPaid(invoice.id)}
                              className="hover:shadow-md transition-all duration-200"
                  >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              {invoice.montantPaye && invoice.montantPaye > 0 ? 'Modifier paiement' : 'Marquer payée'}
                  </Button>
                )}
                          {canManageAccounting && (
                          <Button 
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteInvoice(invoice.id)}
                            className="hover:shadow-md transition-all duration-200"
                            title="Supprimer la facture"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          )}
              </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
            </CardContent>
          </Card>

      {/* Modal de visualisation de facture */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto invoice-print">
          {selectedInvoice && (() => {
            const trip = getTrip(selectedInvoice.trajetId);
            const expense = getExpense(selectedInvoice.expenseId);
            const parcelEx = getParcelExpedition(selectedInvoice.parcelExpeditionId);
            const isParcelInvoice = !!selectedInvoice.parcelExpeditionId;
            const driver = trip?.chauffeurId
              ? drivers.find((d) => d.id === trip.chauffeurId)
              : parcelEx?.chauffeurId
                ? drivers.find((d) => d.id === parcelEx.chauffeurId)
                : expense?.chauffeurId
                  ? drivers.find((d) => d.id === expense.chauffeurId)
                  : undefined;
            const isExpenseInvoice = !!selectedInvoice.expenseId;
            const expenseDriver = expense?.chauffeurId ? drivers.find(d => d.id === expense.chauffeurId) : null;
            const expenseTruck = expense?.camionId ? trucks.find(t => t.id === expense.camionId) : null;
            const expenseSupplier = expense?.fournisseurId ? thirdParties.find(tp => tp.id === expense.fournisseurId) : null;
            
            return (
              <>
                {/* En-tête + export PDF */}
                <div className="border-b pb-4 mb-6 no-print">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-bold text-xl">Facture {selectedInvoice.numero}</span>
                    <div className="flex items-center gap-2">
                      {isExpenseInvoice ? (
                        <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 border-orange-300">
                          {EMOJI.argent} Dépense
                        </Badge>
                      ) : isParcelInvoice ? (
                        <Badge variant="outline" className="bg-sky-100 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300 border-sky-300">
                          📦 Expédition
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-300">
                          {EMOJI.camion} Trajet
                        </Badge>
                      )}
                      <Badge variant={selectedInvoice.statut === 'payee' ? 'default' : 'secondary'}>
                        {selectedInvoice.statut === 'payee' ? 'Payée' : 'En attente'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleDownloadPDF}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Télécharger PDF
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {/* Visible uniquement à l’impression (le bandeau avec boutons est masqué) */}
                  <div className="hidden print:block border-b-2 border-slate-900 pb-5 mb-0">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
                          Facture
                        </p>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
                          {selectedInvoice.numero}
                        </h1>
                        <p className="text-sm text-slate-600 mt-2">
                          Date d’émission :{' '}
                          {new Date(selectedInvoice.dateCreation).toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block border-2 border-slate-900 px-4 py-2 text-sm font-bold uppercase tracking-wide">
                          {selectedInvoice.statut === 'payee'
                            ? 'Payée'
                            : selectedInvoice.montantPaye && selectedInvoice.montantPaye > 0
                              ? 'Paiement partiel'
                              : 'En attente'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* En-tête de facture */}
                  <div className="border-b pb-4 print:pb-3 print:border-slate-300">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-bold text-lg mb-2">Truck Track Cameroun</h3>
                        <p className="text-sm text-muted-foreground">
                          Transport de marchandises<br />
                          Douala, Cameroun<br />
                          Tél: +237 6 XX XX XX XX<br />
                          Email: contact@trucktrack.cm
                        </p>
                      </div>
                      <div className="text-right">
                        {isExpenseInvoice ? (
                          <>
                            <p className="text-sm text-muted-foreground">Fournisseur:</p>
                            <p className="font-semibold">{expenseSupplier?.nom || 'N/A'}</p>
                          </>
                        ) : isParcelInvoice && parcelEx ? (
                          <>
                            <p className="text-sm text-muted-foreground">Clients (lignes colis)</p>
                            <p className="font-semibold max-w-md ml-auto">
                              {[...new Set(parcelEx.lots.map((l) => l.clients?.trim()).filter(Boolean) as string[])].join(', ') || '—'}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">Client:</p>
                            <p className="font-semibold">{trip?.client || 'N/A'}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Détails du service ou de la dépense */}
                  {isExpenseInvoice && expense ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-3">Détails de la dépense</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Description:</span>
                            <span className="font-medium">{expense.description}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Catégorie:</span>
                            <span className="font-medium">{expense.categorie}</span>
                          </div>
                          {expense.sousCategorie && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Sous-catégorie:</span>
                              <span className="font-medium">{expense.sousCategorie}</span>
                            </div>
                          )}
                          {expense.quantite !== undefined && expense.quantite > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Quantité:</span>
                              <span className="font-medium">
                                {expense.quantite.toLocaleString('fr-FR')} {expense.categorie === 'Carburant' ? 'Litres' : expense.categorie === 'Maintenance' ? 'Pièces' : 'Unités'}
                              </span>
                            </div>
                          )}
                          {expense.prixUnitaire !== undefined && expense.prixUnitaire > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Prix unitaire:</span>
                              <span className="font-medium">{expense.prixUnitaire.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Prix total:</span>
                            <span className="font-medium font-bold">{expense.montant.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Date de la dépense:</span>
                            <span className="font-medium">{new Date(expense.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>

                      {/* Informations du véhicule et du chauffeur */}
                      {(expenseTruck || expenseDriver) && (
                        <div>
                          <h4 className="font-semibold mb-3">Informations du véhicule</h4>
                          <div className="space-y-2 text-sm">
                            {expenseTruck && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Camion:</span>
                                  <span className="font-medium">{expenseTruck.immatriculation}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Modèle:</span>
                                  <span className="font-medium">{expenseTruck.modele}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Type:</span>
                                  <span className="font-medium">{expenseTruck.type === 'tracteur' ? 'Tracteur' : 'Remorqueuse'}</span>
                                </div>
                              </>
                            )}
                            {expenseDriver && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Chauffeur:</span>
                                  <span className="font-medium">{expenseDriver.prenom} {expenseDriver.nom}</span>
                                </div>
                                {expenseDriver.telephone && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Téléphone:</span>
                                    <span className="font-medium">{expenseDriver.telephone}</span>
                                  </div>
                                )}
                                {expenseDriver.cni && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">CNI:</span>
                                    <span className="font-medium">{expenseDriver.cni}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Informations du fournisseur */}
                      {expenseSupplier && (
                        <div>
                          <h4 className="font-semibold mb-3">Informations du fournisseur</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Nom:</span>
                              <span className="font-medium">{expenseSupplier.nom}</span>
                            </div>
                            {expenseSupplier.telephone && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Téléphone:</span>
                                <span className="font-medium">{expenseSupplier.telephone}</span>
                              </div>
                            )}
                            {expenseSupplier.email && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Email:</span>
                                <span className="font-medium">{expenseSupplier.email}</span>
                              </div>
                            )}
                            {expenseSupplier.adresse && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Adresse:</span>
                                <span className="font-medium">{expenseSupplier.adresse}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Lien avec trajet si disponible */}
                      {expense.tripId && (() => {
                        const linkedTrip = trips.find(t => t.id === expense.tripId);
                        if (linkedTrip) {
                          return (
                            <div>
                              <h4 className="font-semibold mb-3">Trajet associé</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Itinéraire:</span>
                                  <span className="font-medium">{linkedTrip.origine} → {linkedTrip.destination}</span>
                                </div>
                                {linkedTrip.client && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Client:</span>
                                    <span className="font-medium">{linkedTrip.client}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ) : isParcelInvoice && parcelEx ? (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-3">Détails de l&apos;expédition</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground shrink-0">Référence</span>
                            <span className="font-medium text-right">{parcelEx.reference}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground shrink-0">Itinéraire</span>
                            <span className="font-medium text-right">{parcelEx.origine} → {parcelEx.destination}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground shrink-0">Statut</span>
                            <span className={`font-medium ${parcelEx.statut === 'annule' ? 'text-red-600 dark:text-red-400' : ''}`}>
                              {formatTripStatusFr(parcelEx.statut)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground shrink-0">Chauffeur</span>
                            <span className="font-medium text-right">
                              {driver ? `${driver.prenom} ${driver.nom}` : 'N/A'}
                              {driver?.telephone ? ` · ${driver.telephone}` : ''}
                            </span>
                          </div>
                          {parcelEx.tracteurId && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground shrink-0">Tracteur</span>
                              <span className="font-medium text-right">{getTruckLabel(parcelEx.tracteurId)}</span>
                            </div>
                          )}
                          {parcelEx.remorqueuseId && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground shrink-0">Remorque</span>
                              <span className="font-medium text-right">{getTruckLabel(parcelEx.remorqueuseId)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground shrink-0">Départ</span>
                            <span className="font-medium text-right">{new Date(parcelEx.dateDepart).toLocaleDateString('fr-FR')}</span>
                          </div>
                          {parcelEx.dateArrivee?.trim() && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground shrink-0">Arrivée</span>
                              <span className="font-medium text-right">{new Date(parcelEx.dateArrivee).toLocaleDateString('fr-FR')}</span>
                            </div>
                          )}
                          {parcelEx.description?.trim() && (
                            <div className="flex justify-between gap-4 items-start">
                              <span className="text-muted-foreground shrink-0">Notes expédition</span>
                              <span className="font-medium text-right max-w-[70%]">{parcelEx.description}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Lignes (CA facturé)</h4>
                          <Table containerClassName="max-h-none shadow-none">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Client / ligne</TableHead>
                                <TableHead>Unité</TableHead>
                                <TableHead className="text-right">Qté</TableHead>
                                <TableHead className="text-right">PU</TableHead>
                                <TableHead className="text-right">Montant</TableHead>
                                <TableHead>Obs.</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {parcelEx.lots.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell className="text-sm">{l.clients}</TableCell>
                                  <TableCell className="text-sm">{l.unite}</TableCell>
                                  <TableCell className="text-sm text-right">{l.quantite.toLocaleString('fr-FR')}</TableCell>
                                  <TableCell className="text-sm text-right">{l.prixUnitaire.toLocaleString('fr-FR')}</TableCell>
                                  <TableCell className="text-sm text-right font-medium">{l.montant.toLocaleString('fr-FR')}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{l.observations || '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                      </div>
                    </div>
                  ) : trip ? (
                    <div>
                      <h4 className="font-semibold mb-3">Détails du service</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trajet:</span>
                          <span className="font-medium">{trip.origine} → {trip.destination}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Statut du trajet:</span>
                          <span className={`font-medium ${trip.statut === 'annule' ? 'text-red-600 dark:text-red-400' : ''}`}>
                            {formatTripStatusFr(trip.statut)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Chauffeur:</span>
                          <span className="font-medium">{driver ? `${driver.prenom} ${driver.nom}` : 'N/A'}</span>
                        </div>
                        {trip.tracteurId && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tracteur:</span>
                            <span className="font-medium">{getTruckLabel(trip.tracteurId)}</span>
                          </div>
                        )}
                        {trip.remorqueuseId && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Remorque:</span>
                            <span className="font-medium">{getTruckLabel(trip.remorqueuseId)}</span>
                          </div>
                        )}
                        {trip.marchandise && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Marchandise:</span>
                            <span className="font-medium">{trip.marchandise}</span>
                          </div>
                        )}
                        {trip.description && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Description:</span>
                            <span className="font-medium">{trip.description}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date de départ:</span>
                          <span className="font-medium">{new Date(trip.dateDepart).toLocaleDateString('fr-FR')}</span>
                        </div>
                        {trip.dateArrivee && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Date d'arrivée:</span>
                            <span className="font-medium">{new Date(trip.dateArrivee).toLocaleDateString('fr-FR')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Détails financiers */}
                  <div>
                    <h4 className="font-semibold mb-3">Détails financiers</h4>
                    <div className="invoice-print-panel space-y-2 text-sm border rounded-lg p-4 bg-primary/5 border-border">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Montant HT initial:</span>
                        <span className="font-semibold">{selectedInvoice.montantHT.toLocaleString('fr-FR')} FCFA</span>
                      </div>
                      {selectedInvoice.remise && selectedInvoice.remise > 0 && selectedInvoice.montantHTApresRemise && (
                        <>
                          <div className="flex justify-between text-orange-600 dark:text-orange-400">
                            <span className="text-muted-foreground">Remise ({selectedInvoice.remise}%):</span>
                            <span className="font-semibold">-{(selectedInvoice.montantHT - selectedInvoice.montantHTApresRemise).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-border">
                            <span className="text-muted-foreground">Montant HT après remise:</span>
                            <span className="font-semibold">{selectedInvoice.montantHTApresRemise.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                          </div>
                        </>
                      )}
                      {selectedInvoice.tva && selectedInvoice.tva > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">TVA:</span>
                          <span className="font-semibold">{selectedInvoice.tva.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                        </div>
                      )}
                      {selectedInvoice.tps && selectedInvoice.tps > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">TPS:</span>
                          <span className="font-semibold">{selectedInvoice.tps.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-border">
                        <span className="text-lg font-semibold">Montant TTC:</span>
                        <span className="text-2xl font-bold text-primary">{selectedInvoice.montantTTC.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-border">
                        <span className="text-muted-foreground">Montant déjà payé:</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {(selectedInvoice.montantPaye ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reste à payer:</span>
                        <span
                          className={
                            Math.max(0, selectedInvoice.montantTTC - (selectedInvoice.montantPaye ?? 0)) > 0.01
                              ? 'font-semibold text-orange-600 dark:text-orange-400'
                              : 'font-semibold text-green-600 dark:text-green-400'
                          }
                        >
                          {Math.max(0, selectedInvoice.montantTTC - (selectedInvoice.montantPaye ?? 0)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedInvoice.paiementsEncaissements &&
                    selectedInvoice.paiementsEncaissements.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3">Ventilation des encaissements</h4>
                        <div className="invoice-print-panel border rounded-lg overflow-hidden text-sm">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Payeur</TableHead>
                                <TableHead className="text-right">Montant</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedInvoice.paiementsEncaissements.map((row, idx) => {
                                const nomFiche = row.clientTierId
                                  ? thirdParties.find((tp) => tp.id === row.clientTierId)?.nom
                                  : undefined;
                                const label =
                                  row.payeurLibelle ||
                                  nomFiche ||
                                  (row.clientTierId ? `Fiche ${row.clientTierId.slice(0, 8)}…` : '—');
                                return (
                                  <TableRow key={`${idx}-${row.montant}`}>
                                    <TableCell>{label}</TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">
                                      {row.montant.toLocaleString('fr-FR')} FCFA
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between">
                            <span>Total ventilé</span>
                            <span className="font-medium text-foreground tabular-nums">
                              {sumInvoicePaymentSlices(selectedInvoice.paiementsEncaissements).toLocaleString(
                                'fr-FR',
                              )}{' '}
                              FCFA
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Informations de paiement */}
                  <div>
                    <h4 className="font-semibold mb-3">Informations de paiement</h4>
                    <div className="invoice-print-panel space-y-2 text-sm border rounded-lg p-4 bg-muted/30 border-border">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date de création:</span>
                        <span className="font-medium">{new Date(selectedInvoice.dateCreation).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                      {selectedInvoice.modePaiement && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mode de paiement:</span>
                          <span className="font-medium">{selectedInvoice.modePaiement}</span>
                        </div>
                      )}
                      {selectedInvoice.datePaiement && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date de paiement:</span>
                          <span className="font-medium">{new Date(selectedInvoice.datePaiement).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Statut:</span>
                        <Badge 
                          variant={selectedInvoice.statut === 'payee' ? 'default' : selectedInvoice.montantPaye && selectedInvoice.montantPaye > 0 ? 'secondary' : 'secondary'} 
                          className={
                            selectedInvoice.statut === 'payee' 
                              ? 'ml-auto bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                              : selectedInvoice.montantPaye && selectedInvoice.montantPaye > 0
                              ? 'ml-auto bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                              : 'ml-auto'
                          }
                        >
                          {selectedInvoice.statut === 'payee' 
                            ? 'Payée' 
                            : selectedInvoice.montantPaye && selectedInvoice.montantPaye > 0
                            ? 'Paiement partiel'
                            : 'En attente'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Informations additionnelles */}
                  {selectedInvoice.notes && (
                    <div>
                      <h4 className="font-semibold mb-3">Notes</h4>
                      <div className="text-sm border rounded-lg p-4 bg-muted/30">
                        <p className="font-medium">{selectedInvoice.notes}</p>
                      </div>
                    </div>
                  )}
      </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog de paiement partiel */}
      <Dialog
        open={isPaymentDialogOpen}
        onOpenChange={(open) => {
          setIsPaymentDialogOpen(open);
          if (!open) {
            setPaymentCompteBanqueId('');
            setPaymentPayerParticipantId('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer le paiement</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant TTC:</span>
                  <span className="font-bold text-primary">
                    {selectedInvoice.montantTTC.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
                {selectedInvoice.montantPaye !== undefined && selectedInvoice.montantPaye > 0 && (
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Déjà payé:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {selectedInvoice.montantPaye.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                )}
                {selectedInvoice.montantPaye !== undefined && selectedInvoice.montantPaye > 0 && (
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Reste à payer:</span>
                    <span className="font-medium text-orange-600 dark:text-orange-400">
                      {(selectedInvoice.montantTTC - selectedInvoice.montantPaye).toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                )}
              </div>

              {selectedInvoice.trajetId &&
                (() => {
                  const tr = trips.find((t) => t.id === selectedInvoice.trajetId);
                  if (!tr || !tripHasMultipleInvoicePayers(tr)) return null;
                  const parts = (tr.clientParticipants ?? []).filter((p) => p.libelle.trim());
                  return (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                      <Label htmlFor="paymentPayerParticipant" className="text-foreground">
                        Client qui verse cet encaissement *
                      </Label>
                      <Select
                        value={paymentPayerParticipantId || undefined}
                        onValueChange={setPaymentPayerParticipantId}
                      >
                        <SelectTrigger id="paymentPayerParticipant" className="mt-1 h-9">
                          <SelectValue placeholder="Choisir le client qui verse" />
                        </SelectTrigger>
                        <SelectContent>
                          {parts.map((p) => {
                            const fiche = p.tierId
                              ? thirdParties.find((tp) => tp.id === p.tierId && tp.type === 'client')
                              : undefined;
                            return (
                              <SelectItem key={p.id} value={p.id}>
                                {p.libelle.trim()}
                                {fiche ? ` — ${fiche.nom}` : p.tierId ? ` — fiche ${p.tierId.slice(0, 8)}…` : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Plusieurs clients sur ce trajet : ventilation de l’encaissement sur la facture.
                      </p>
                    </div>
                  );
                })()}

              <div>
                <Label htmlFor="paymentAmount">Montant payé (FCFA) *</Label>
                <NumberInput
                  id="paymentAmount"
                  value={paymentAmount}
                  onChange={(value) => setPaymentAmount(value || 0)}
                  min={0}
                  max={selectedInvoice.montantTTC - (selectedInvoice.montantPaye || 0)}
                  placeholder="0"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Le montant peut être partiel. Maximum: {(selectedInvoice.montantTTC - (selectedInvoice.montantPaye || 0)).toLocaleString('fr-FR')} FCFA
                </p>
              </div>

              {paymentAmount > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Montant payé:</span>
                    <span className="font-bold text-primary">
                      {paymentAmount.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reste à payer:</span>
                    <span className="font-medium text-orange-600 dark:text-orange-400">
                      {(selectedInvoice.montantTTC - (selectedInvoice.montantPaye || 0) - paymentAmount).toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                  {(selectedInvoice.montantPaye || 0) + paymentAmount >= selectedInvoice.montantTTC && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 pt-2 border-t">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Facture sera marquée comme payée complètement</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="paymentMode">Mode de paiement (optionnel)</Label>
                <Select 
                  value={
                    !selectedInvoice.modePaiement
                      ? 'none'
                      : selectedInvoice.modePaiement === 'Virement'
                        ? 'Virement bancaire'
                        : selectedInvoice.modePaiement
                  }
                  onValueChange={(value) => {
                    if (selectedInvoice) {
                      const mode = value === 'none' ? undefined : value;
                      setSelectedInvoice({
                        ...selectedInvoice,
                        modePaiement: mode,
                      });
                      if (mode && isPaiementVersBanque(mode)) {
                        const accs = getBankAccounts();
                        setPaymentCompteBanqueId((prev) => prev || accs[0]?.id || '');
                      }
                    }
                  }}
                >
                  <SelectTrigger id="paymentMode">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="Espèces">Espèces</SelectItem>
                    <SelectItem value="Virement bancaire">Virement bancaire</SelectItem>
                    <SelectItem value="Chèque">Chèque</SelectItem>
                    <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentAmount > 0 && isPaiementVersBanque(selectedInvoice.modePaiement) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Landmark className="h-4 w-4 shrink-0 text-amber-600" />
                    {selectedInvoice.expenseId
                      ? 'Compte débité (paiement fournisseur)'
                      : 'Compte qui reçoit le virement'}
                  </div>
                  {getBankAccounts().length === 0 ? (
                    <p className="text-sm text-destructive">
                      Aucun compte bancaire enregistré. Ajoutez-en un (données / API) pour les virements.
                    </p>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="paymentBankAccount">Compte bancaire *</Label>
                        <Select
                          value={paymentCompteBanqueId || undefined}
                          onValueChange={setPaymentCompteBanqueId}
                        >
                          <SelectTrigger id="paymentBankAccount" className="mt-1">
                            <SelectValue
                              placeholder={
                                selectedInvoice.expenseId
                                  ? 'Choisir le compte à débiter'
                                  : 'Choisir le compte crédité'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {getBankAccounts().map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.nom} — {a.banque}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {paymentCompteBanqueId && soldeComptePourVirement !== null && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Solde disponible sur ce compte avant ce paiement :{' '}
                            <span className="font-medium tabular-nums text-foreground">
                              {soldeComptePourVirement.toLocaleString('fr-FR')} FCFA
                            </span>
                          </p>
                          {paiementBanqueDepenseInsuffisant && (
                            <p className="text-sm text-destructive flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>
                                Solde insuffisant pour régler ce montant par la banque. Réduisez le paiement,
                                choisissez un autre compte ou utilisez un autre mode (caisse).
                              </span>
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {paymentAmount > 0 && !isPaiementVersBanque(selectedInvoice.modePaiement) && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-3 text-sm text-emerald-900 dark:text-emerald-200">
                  Ce montant sera enregistré en <strong>caisse</strong> (espèces, chèque, mobile money, etc.). Seul le{' '}
                  <strong>virement bancaire</strong> est crédité sur la banque.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={handleConfirmPayment}
                  disabled={
                    isConfirmingPayment ||
                    paymentAmount <= 0 ||
                    paiementBanqueDepenseInsuffisant ||
                    paymentAmount >
                      Math.max(0, selectedInvoice.montantTTC - (selectedInvoice.montantPaye ?? 0)) + 0.01 ||
                    (paymentAmount > 0 &&
                      isPaiementVersBanque(selectedInvoice.modePaiement) &&
                      (getBankAccounts().length === 0 || !paymentCompteBanqueId))
                  }
                >
                  {isConfirmingPayment ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</>
                  ) : (
                    'Enregistrer le paiement'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
