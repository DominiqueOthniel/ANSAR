/** Types partagés caisse / factures / comptes bancaires (API ou local). */

export interface BankAccount {
  id: string;
  nom: string;
  numeroCompte: string;
  banque: string;
  type: 'courant' | 'epargne' | 'professionnel';
  soldeInitial: number;
  soldeActuel: number;
  devise: string;
  iban?: string;
  swift?: string;
  notes?: string;
}

export interface BankTransaction {
  id: string;
  compteId: string;
  type: 'depot' | 'retrait' | 'virement' | 'prelevement' | 'frais';
  montant: number;
  date: string;
  description: string;
  reference?: string;
  beneficiaire?: string;
  categorie?: string;
}
