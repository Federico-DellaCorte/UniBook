/*
 * Repository delle risorse prenotabili.
 *
 * Questo file contiene tutte le query principali verso la tabella resources.
 * Le risorse sono gli oggetti che gli utenti possono prenotare: aule, sale,
 * laboratori, postazioni e attrezzature.
 *
 * Il repository separa l'accesso al database dalla logica delle rotte e dei
 * service. Le route non scrivono SQL direttamente, ma chiamano funzioni come
 * findAllActive(), findById(), create(), update(), setActive() o searchActive().
 *
 * Questa separazione rende il progetto più ordinato:
 *   - le route gestiscono richieste e risposte HTTP;
 *   - i repository leggono e scrivono dati nel database;
 *   - i service applicano eventuali regole applicative più complesse.
 *
 * In questo file vengono usati prepared statement di better-sqlite3, cioè query
 * SQL preparate con placeholder ?. I valori variabili vengono passati separati
 * dalla stringa SQL, riducendo il rischio di SQL injection.
 *
 * Le risorse hanno anche un campo active:
 *   - active = 1 significa risorsa attiva, visibile e prenotabile dagli utenti;
 *   - active = 0 significa risorsa disattivata, quindi nascosta agli utenti
 *     standard ma ancora visibile all'amministratore.
 *
 * Questo permette di distinguere tra disattivazione logica e cancellazione
 * definitiva.
 */

const db = require('../db/connection');

/*
 * Query che recupera tutte le risorse attive.
 *
 * È usata nelle pagine pubbliche/utente, dove devono comparire solo le risorse
 * effettivamente prenotabili.
 *
 * Le risorse disattivate non vengono mostrate agli utenti standard.
 *
 * ORDER BY name rende l'elenco prevedibile e ordinato alfabeticamente,
 * indipendentemente dall'ordine con cui le risorse sono state inserite nel DB.
 */
const stmtFindAllActive = db.prepare(`
  SELECT id, name, type, capacity, location, description, active, opens_at, closes_at
  FROM resources
  WHERE active = 1
  ORDER BY name
`);

/*
 * Query che recupera tutte le risorse, attive e disattivate.
 *
 * È pensata per l'area amministrativa, perché l'admin deve vedere anche le
 * risorse non più disponibili agli utenti.
 *
 * L'ordinamento mette prima le risorse attive e poi quelle disattivate,
 * mantenendo comunque l'ordine alfabetico per nome.
 */
const stmtFindAll = db.prepare(`
  SELECT id, name, type, capacity, location, description, active, opens_at, closes_at
  FROM resources
  ORDER BY active DESC, name
`);

/*
 * Query che recupera le risorse attive di una specifica categoria.
 *
 * È usata quando l'utente consulta, per esempio, solo le aule, solo le sale
 * oppure solo le attrezzature.
 *
 * Anche qui vengono escluse le risorse disattivate, perché l'utente standard
 * deve vedere solo ciò che può effettivamente prenotare.
 */
const stmtFindActiveByType = db.prepare(`
  SELECT id, name, type, capacity, location, description, active, opens_at, closes_at
  FROM resources
  WHERE active = 1 AND type = ?
  ORDER BY name
`);

/*
 * Query che recupera tutte le risorse di una categoria, incluse quelle
 * disattivate.
 *
 * È utile nell'area admin, dove l'amministratore può filtrare per categoria
 * ma deve comunque poter vedere anche risorse non più attive.
 */
const stmtFindAllByType = db.prepare(`
  SELECT id, name, type, capacity, location, description, active, opens_at, closes_at
  FROM resources
  WHERE type = ?
  ORDER BY active DESC, name
`);

/*
 * Query che recupera una singola risorsa tramite id.
 *
 * È usata quando serve lavorare su una risorsa specifica: dettaglio risorsa,
 * modifica admin, prenotazione, disattivazione, riattivazione o eliminazione.
 *
 * L'id è la chiave primaria della tabella resources.
 */
const stmtFindById = db.prepare(`
  SELECT id, name, type, capacity, location, description, active, opens_at, closes_at
  FROM resources
  WHERE id = ?
`);

/*
 * Query che crea una nuova risorsa.
 *
 * Inserisce nome, categoria, capienza, posizione, descrizione e orari base.
 *
 * Il campo active viene impostato direttamente a 1: una risorsa appena creata
 * nasce attiva e quindi potenzialmente visibile/prenotabile, salvo successive
 * modifiche dell'amministratore.
 */
const stmtInsert = db.prepare(`
  INSERT INTO resources (name, type, capacity, location, description, active, opens_at, closes_at)
  VALUES (?, ?, ?, ?, ?, 1, ?, ?)
`);

/*
 * Query che aggiorna i dati principali di una risorsa esistente.
 *
 * Modifica nome, categoria, capienza, posizione, descrizione e orari base.
 *
 * Non modifica direttamente il campo active: attivazione e disattivazione sono
 * gestite da setActive(), così il cambio di stato resta un'operazione separata.
 */
const stmtUpdate = db.prepare(`
  UPDATE resources
  SET name = ?, type = ?, capacity = ?, location = ?, description = ?, opens_at = ?, closes_at = ?
  WHERE id = ?
`);

/*
 * Query che cambia lo stato attivo/disattivato di una risorsa.
 *
 * Questa è una forma di soft delete: invece di eliminare fisicamente la risorsa,
 * si imposta active = 0.
 *
 * Così la risorsa non viene più mostrata agli utenti standard e non dovrebbe
 * essere prenotabile, ma resta nel database per l'amministratore e per lo storico.
 *
 * La stessa query può anche riattivare una risorsa impostando active = 1.
 */
const stmtSetActive = db.prepare(`
  UPDATE resources SET active = ? WHERE id = ?
`);

/*
 * Query che elimina definitivamente una risorsa dal database.
 *
 * Questa operazione è diversa dalla disattivazione:
 *   - setActive(0) nasconde la risorsa ma la mantiene nel database;
 *   - remove() cancella fisicamente la riga dalla tabella resources.
 *
 * L'eliminazione definitiva è più delicata, perché la risorsa può essere
 * collegata a prenotazioni e disponibilità settimanali.
 *
 * Per questo, nel progetto, la cancellazione reale deve essere gestita con
 * attenzione dalle rotte/service amministrativi, idealmente dentro una
 * transazione insieme alle operazioni collegate.
 */
const stmtRemove = db.prepare(`
  DELETE FROM resources WHERE id = ?
`);

/*
 * Query di conteggio delle risorse per categoria.
 *
 * stmtCountActiveByType conta solo le risorse attive.
 * stmtCountAllByType conta tutte le risorse, anche quelle disattivate.
 *
 * Questi conteggi servono per costruire statistiche e card di riepilogo,
 * per esempio nella pagina indice delle categorie o nell'area amministrativa.
 *
 * Il risultato del database è una lista di righe del tipo:
 *   { type: 'aula', count: 4 }
 */
const stmtCountActiveByType = db.prepare(`
  SELECT type, COUNT(*) AS count
  FROM resources
  WHERE active = 1
  GROUP BY type
`);

const stmtCountAllByType = db.prepare(`
  SELECT type, COUNT(*) AS count
  FROM resources
  GROUP BY type
`);

/*
 * Funzioni di accesso alle risorse.
 *
 * Ogni funzione chiama lo statement SQL corrispondente.
 *
 * .all() viene usato quando la query restituisce più righe.
 * .get() viene usato quando ci si aspetta una sola riga.
 * .run() viene usato per INSERT, UPDATE e DELETE.
 *
 * Le funzioni create qui sono quelle usate dalle route e dai service: il resto
 * dell'applicazione non deve conoscere il dettaglio delle query SQL.
 */
function findAllActive() {
  return stmtFindAllActive.all();
}

function findAll() {
  return stmtFindAll.all();
}

function findActiveByType(type) {
  return stmtFindActiveByType.all(type);
}

function findAllByType(type) {
  return stmtFindAllByType.all(type);
}

function findById(id) {
  return stmtFindById.get(id);
}

/*
 * Crea una nuova risorsa e restituisce l'id generato dal database.
 *
 * location e description possono essere vuoti: in quel caso vengono salvati
 * come NULL, cioè valore assente nel database.
 *
 * lastInsertRowid è l'id assegnato automaticamente da SQLite alla nuova riga.
 */
function create({ name, type, capacity, location, description, opens_at, closes_at }) {
  const info = stmtInsert.run(
    name,
    type,
    capacity,
    location || null,
    description || null,
    opens_at,
    closes_at
  );
  return info.lastInsertRowid;
}

/*
 * Aggiorna una risorsa esistente.
 *
 * Restituisce il numero di righe modificate tramite .changes.
 * Se .changes vale 0, significa che nessuna risorsa con quell'id è stata
 * aggiornata oppure che l'operazione non ha prodotto cambiamenti effettivi.
 */
function update(id, { name, type, capacity, location, description, opens_at, closes_at }) {
  return stmtUpdate.run(
    name,
    type,
    capacity,
    location || null,
    description || null,
    opens_at,
    closes_at,
    id
  ).changes;
}

/*
 * Attiva o disattiva una risorsa.
 *
 * Il parametro active viene convertito in 1 o 0 perché SQLite non ha un vero
 * tipo booleano: nel database i booleani vengono rappresentati come interi.
 */
function setActive(id, active) {
  return stmtSetActive.run(active ? 1 : 0, id).changes;
}

/*
 * Elimina fisicamente una risorsa.
 *
 * Restituisce il numero di righe eliminate. Anche qui .changes permette di
 * sapere se l'id indicato corrispondeva davvero a una risorsa esistente.
 */
function remove(id) {
  return stmtRemove.run(id).changes;
}

/*
 * Converte i risultati dei conteggi in una mappa più comoda.
 *
 * SQLite restituisce un array di righe:
 *   [{ type: 'aula', count: 4 }, { type: 'sala', count: 3 }]
 *
 * Questa funzione lo trasforma in un oggetto:
 *   { aula: 4, sala: 3 }
 *
 * Questa forma è più facile da usare nei template e negli helper che devono
 * recuperare rapidamente il conteggio di una categoria.
 */
function rowsToCountMap(rows) {
  const map = {};
  for (const row of rows) {
    map[row.type] = row.count;
  }
  return map;
}

/*
 * Restituiscono i conteggi delle risorse per categoria.
 *
 * countActiveByType considera solo le risorse attive.
 * countAllByType considera tutte le risorse.
 *
 * Entrambe trasformano le righe SQL in una mappa tramite rowsToCountMap().
 */
function countActiveByType() {
  return rowsToCountMap(stmtCountActiveByType.all());
}

function countAllByType() {
  return rowsToCountMap(stmtCountAllByType.all());
}

/*
 * Ricerca delle risorse attive con filtri opzionali.
 *
 * Questa funzione è usata nella ricerca lato utente. Restituisce solo risorse
 * attive, perché l'utente standard non deve vedere risorse disattivate.
 *
 * I filtri possibili sono:
 *   - type: categoria della risorsa;
 *   - minCapacity: capienza minima richiesta;
 *   - q: parola chiave cercata in nome, posizione e descrizione.
 *
 * La query viene costruita dinamicamente perché i filtri sono opzionali:
 * l'utente può usarne uno, più di uno oppure nessuno.
 *
 * Anche se la query è dinamica, i valori provenienti dall'esterno non vengono
 * concatenati direttamente nel testo SQL. Vengono inseriti nell'array params e
 * poi passati come placeholder ?. Questo mantiene la protezione contro SQL
 * injection.
 *
 * Per la ricerca testuale viene usato LIKE con %term%, sufficiente per una
 * ricerca semplice nel contesto del progetto.
 */
function searchActive({ type = null, minCapacity = null, q = null } = {}) {
  const conditions = ['r.active = 1'];
  const params = [];

  if (type) {
    conditions.push('r.type = ?');
    params.push(type);
  }
  if (minCapacity !== null && minCapacity !== undefined) {
    conditions.push('r.capacity >= ?');
    params.push(minCapacity);
  }
  if (q) {
    conditions.push(`(
      r.name LIKE ? OR
      COALESCE(r.location, '') LIKE ? OR
      COALESCE(r.description, '') LIKE ?
    )`);
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const sql = `
    SELECT r.id, r.name, r.type, r.capacity, r.location, r.description,
           r.active, r.opens_at, r.closes_at
    FROM resources r
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.name
  `;
  return db.prepare(sql).all(...params);
}

/*
 * Esportazione delle funzioni del repository.
 *
 * Gli altri file del progetto possono importare queste funzioni per lavorare
 * sulle risorse senza accedere direttamente alla tabella resources.
 */
module.exports = {
  findAllActive,
  findAll,
  findActiveByType,
  findAllByType,
  findById,
  create,
  update,
  setActive,
  remove,
  countActiveByType,
  countAllByType,
  searchActive,
};
