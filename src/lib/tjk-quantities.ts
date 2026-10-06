/** Poids d’un sac ciment standard (kg) — utilisé pour le tonnage automatique. */
export const TJK_DEFAULT_UNIT_WEIGHT_KG = 50;

/** Qtes = quantité ; tonnage (t) = quantité × poids unitaire / 1000. */
export function tjkQuantiteToQtesTonnage(
  quantite: number | undefined,
  poidsUniteKg: number = TJK_DEFAULT_UNIT_WEIGHT_KG,
): { qtes: number | undefined; tonnage: number | undefined } {
  if (quantite == null || !Number.isFinite(Number(quantite)) || Number(quantite) < 0) {
    return { qtes: undefined, tonnage: undefined };
  }
  const q = Number(quantite);
  const kg = poidsUniteKg > 0 ? Number(poidsUniteKg) : TJK_DEFAULT_UNIT_WEIGHT_KG;
  const tonnage = Math.round(((q * kg) / 1000) * 1000) / 1000;
  return { qtes: q, tonnage };
}

/** Montant final = tonnage × prix du tonnage (FCFA). */
export function tjkMontantFromPrixTonnage(
  tonnage: number | undefined,
  prixTonnage: number | undefined,
): number | undefined {
  if (
    tonnage == null ||
    prixTonnage == null ||
    !Number.isFinite(Number(tonnage)) ||
    !Number.isFinite(Number(prixTonnage)) ||
    Number(tonnage) < 0 ||
    Number(prixTonnage) < 0
  ) {
    return undefined;
  }
  return Math.round(Number(tonnage) * Number(prixTonnage));
}
