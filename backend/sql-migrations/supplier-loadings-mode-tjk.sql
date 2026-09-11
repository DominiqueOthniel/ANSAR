-- Commentaire mode d’entrée : ajoute TJK.

COMMENT ON COLUMN supplier_loadings."modeEntree" IS
  'bon_simple | camion_ansar | rail | tjk | rendu_fournisseur (legacy: camion, autre)';
