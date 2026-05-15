/** Normalise un nom pour comparaison (trajets / prêteurs en texte libre). */
export function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Associe un libellé libre (trajet.client, ligne colis, nom client sur une créance) à une fiche client. */
export function matchClientReference(field: string | undefined, clientNom: string): boolean {
  if (!field?.trim() || !clientNom.trim()) return false;
  const a = normName(field);
  const b = normName(clientNom);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const significant = b.split(' ').filter((w) => w.length > 2);
  return significant.some((w) => a.includes(w));
}
