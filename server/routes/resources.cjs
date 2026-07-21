'use strict';

const { createTableApi } = require('../crud.cjs');
const {
  HttpError,
  dateOnly,
  num,
  audit,
  rowToJson,
  randomUUID,
  query,
} = require('../lib.cjs');
const caisse = require('./caisse.cjs');

const thirdParties = createTableApi({
  table: 'third_parties',
  moduleName: 'third-parties',
  orderBy: 'nom ASC',
  numericKeys: ['plafondCredit'],
  dateKeys: ['dateNaissance'],
});

const driversApi = createTableApi({
  table: 'drivers',
  moduleName: 'drivers',
  orderBy: 'nom ASC, prenom ASC',
});

async function createDriver(body, actor) {
  const id = randomUUID();
  await query(
    `INSERT INTO drivers (id, nom, prenom, telephone, cni, "numeroPermis", photo)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      body.nom,
      body.prenom,
      body.telephone,
      body.cni || null,
      body.numeroPermis || null,
      body.photo || null,
    ],
  );
  if (Array.isArray(body.transactions)) {
    for (const t of body.transactions) {
      await query(
        `INSERT INTO driver_transactions (id, type, montant, date, description, "driverId")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          t.type,
          num(t.montant),
          dateOnly(t.date),
          t.description || '',
          id,
        ],
      );
    }
  }
  return driversApi.get(id);
}

async function getDriverFull(id) {
  const d = await driversApi.get(id);
  if (!d) return null;
  const { rows } = await query(
    `SELECT * FROM driver_transactions WHERE "driverId" = $1 ORDER BY date ASC`,
    [id],
  );
  d.transactions = rows.map((r) => {
    const j = rowToJson(r);
    j.montant = num(r.montant);
    return j;
  });
  return d;
}

async function listDriversFull() {
  const list = await driversApi.list();
  for (const d of list) {
    const { rows } = await query(
      `SELECT * FROM driver_transactions WHERE "driverId" = $1 ORDER BY date ASC`,
      [d.id],
    );
    d.transactions = rows.map((r) => {
      const j = rowToJson(r);
      j.montant = num(r.montant);
      return j;
    });
  }
  return list;
}

const trips = createTableApi({
  table: 'trips',
  moduleName: 'trips',
  orderBy: '"dateDepart" DESC',
  numericKeys: [
    'origineLat',
    'origineLng',
    'destinationLat',
    'destinationLng',
    'recette',
    'prefinancement',
    'quantiteChargee',
  ],
  dateKeys: ['dateDepart', 'dateArrivee'],
  jsonKeys: ['stops', 'clientParticipants'],
  afterWrite: async (action, after, actor, before) => {
    if (action !== 'update') return;
    if (!after || after.statut !== 'termine') return;
    if (before && before.statut === 'termine') return;
    await ensureTripInvoiceOnCompletion(after, actor);
  },
});

async function nextTripInvoiceNumero() {
  const year = new Date().getFullYear();
  const { rows } = await query(`SELECT count(*)::int AS c FROM invoices`);
  return `FAC-${year}-${String((rows[0]?.c || 0) + 1).padStart(3, '0')}`;
}

async function ensureTripInvoiceOnCompletion(trip, actor) {
  const recette = num(trip.recette);
  if (recette <= 0) return;
  const { rows } = await query(
    `SELECT COALESCE(SUM("montantTTC"), 0)::float AS s FROM invoices WHERE "trajetId" = $1`,
    [trip.id],
  );
  const sumTtc = num(rows[0]?.s);
  const reste = Math.max(0, recette - sumTtc);
  if (reste <= 0.01) return;

  const parts = Array.isArray(trip.clientParticipants) ? trip.clientParticipants : [];
  const payeurId = trip.payeurParticipantId;
  const payeur = payeurId ? parts.find((p) => p.id === payeurId) : parts[0];
  const clientTierId = payeur?.tierId || null;
  const factureClientLibelle =
    (payeur?.libelle || trip.client || '').trim() || null;

  const id = randomUUID();
  const numero = await nextTripInvoiceNumero();
  await query(
    `INSERT INTO invoices (
      id, numero, "trajetId", statut, "montantHT", "montantHTApresRemise", "montantTTC",
      "montantPaye", "dateCreation", "clientTierId", "factureClientLibelle", notes
    ) VALUES ($1,$2,$3,'en_attente',$4,$4,$4,0,$5,$6,$7,$8)`,
    [
      id,
      numero,
      trip.id,
      reste,
      new Date().toISOString().slice(0, 10),
      clientTierId,
      factureClientLibelle,
      `Facture automatique — trajet ${trip.origine} → ${trip.destination}`,
    ],
  );
  await audit(
    'invoices',
    'CREATE',
    id,
    `Facture auto ${numero} (trajet terminé)`,
    null,
    { id, numero, trajetId: trip.id, montantTTC: reste },
    actor,
  );
}
const expenses = createTableApi({
  table: 'expenses',
  moduleName: 'expenses',
  orderBy: 'date DESC',
  numericKeys: ['montant', 'quantite', 'prixUnitaire'],
  dateKeys: ['date'],
  prepareInsert: async (data) => {
    await caisse.assertSortieByRef(num(data.montant));
    return data;
  },
  prepareUpdate: async (data, before) => {
    if (data.montant != null) {
      await caisse.assertSortieByRef(num(data.montant), `depense:${before.id}`);
    }
    return data;
  },
});

const invoices = createTableApi({
  table: 'invoices',
  moduleName: 'invoices',
  orderBy: '"dateCreation" DESC',
  numericKeys: [
    'montantHT',
    'remise',
    'montantHTApresRemise',
    'tva',
    'tps',
    'montantTTC',
    'montantPaye',
  ],
  dateKeys: ['dateCreation', 'datePaiement'],
  jsonKeys: ['paiementsEncaissements'],
  prepareInsert: async (data) => {
    const paye = num(data.montantPaye);
    const ttc = num(data.montantTTC);
    if (paye < 0 || paye > ttc + 0.01) {
      throw HttpError(400, 'montantPaye invalide par rapport au montantTTC.');
    }
    return data;
  },
  prepareUpdate: async (data, before) => {
    const paye = data.montantPaye !== undefined ? num(data.montantPaye) : num(before.montantPaye);
    const ttc = data.montantTTC !== undefined ? num(data.montantTTC) : num(before.montantTTC);
    if (paye < 0 || paye > ttc + 0.01) {
      throw HttpError(400, 'montantPaye invalide par rapport au montantTTC.');
    }
    return data;
  },
});

const merchandise = createTableApi({
  table: 'merchandise_qualities',
  moduleName: 'merchandise-qualities',
  orderBy: 'libelle ASC',
});

const articles = createTableApi({
  table: 'articles',
  moduleName: 'articles',
  orderBy: 'libelle ASC',
  numericKeys: ['prixVente'],
});

async function listArticlesFull() {
  const list = await articles.list();
  for (const a of list) {
    const { rows } = await query(
      `SELECT * FROM article_supplier_prices WHERE "articleId" = $1`,
      [a.id],
    );
    a.supplierPrices = rows.map((r) => {
      const j = rowToJson(r);
      j.prixUnitaire = num(r.prixUnitaire);
      return j;
    });
  }
  return list;
}

async function getArticleFull(id) {
  const a = await articles.get(id);
  if (!a) return null;
  const { rows } = await query(
    `SELECT * FROM article_supplier_prices WHERE "articleId" = $1`,
    [id],
  );
  a.supplierPrices = rows.map((r) => {
    const j = rowToJson(r);
    j.prixUnitaire = num(r.prixUnitaire);
    return j;
  });
  return a;
}

async function addSupplierPrice(articleId, body, actor) {
  const id = randomUUID();
  await query(
    `INSERT INTO article_supplier_prices (id, "articleId", "fournisseurId", "prixUnitaire")
     VALUES ($1,$2,$3,$4)`,
    [id, articleId, body.fournisseurId, num(body.prixUnitaire)],
  );
  const { rows } = await query(`SELECT * FROM article_supplier_prices WHERE id = $1`, [id]);
  const row = rowToJson(rows[0]);
  row.prixUnitaire = num(rows[0].prixUnitaire);
  await audit('articles', 'CREATE', id, 'Prix fournisseur', null, row, actor);
  return row;
}

async function updateSupplierPrice(priceId, body, actor) {
  await query(
    `UPDATE article_supplier_prices SET
      "fournisseurId" = COALESCE($2, "fournisseurId"),
      "prixUnitaire" = COALESCE($3, "prixUnitaire")
     WHERE id = $1`,
    [
      priceId,
      body.fournisseurId ?? null,
      body.prixUnitaire !== undefined ? num(body.prixUnitaire) : null,
    ],
  );
  const { rows } = await query(`SELECT * FROM article_supplier_prices WHERE id = $1`, [priceId]);
  if (!rows[0]) throw HttpError(404, 'Prix introuvable');
  const row = rowToJson(rows[0]);
  row.prixUnitaire = num(rows[0].prixUnitaire);
  return row;
}

async function deleteSupplierPrice(priceId) {
  await query(`DELETE FROM article_supplier_prices WHERE id = $1`, [priceId]);
}

const parcels = createTableApi({
  table: 'parcel_expeditions',
  moduleName: 'parcel-expeditions',
  orderBy: '"dateDepart" DESC',
  numericKeys: ['commissionPct'],
  dateKeys: ['dateDepart', 'dateArrivee'],
  jsonKeys: ['lots'],
  prepareInsert: async (data) => {
    if (Array.isArray(data.lots)) {
      data.lots = data.lots.map((l) => ({
        ...l,
        montant: Math.round(num(l.quantite) * num(l.prixUnitaire) * 100) / 100,
      }));
    }
    return data;
  },
  prepareUpdate: async (data) => {
    if (Array.isArray(data.lots)) {
      data.lots = data.lots.map((l) => ({
        ...l,
        montant: Math.round(num(l.quantite) * num(l.prixUnitaire) * 100) / 100,
      }));
    }
    return data;
  },
});

module.exports = {
  thirdParties,
  driversApi,
  createDriver,
  getDriverFull,
  listDriversFull,
  trips,
  expenses,
  invoices,
  merchandise,
  articles,
  listArticlesFull,
  getArticleFull,
  addSupplierPrice,
  updateSupplierPrice,
  deleteSupplierPrice,
  parcels,
};
