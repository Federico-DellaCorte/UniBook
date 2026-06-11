/*
 * Repository delle prenotazioni.
 *
 * Questo file contiene le query principali verso la tabella bookings.
 * Le prenotazioni collegano utenti e risorse: ogni record dice quale utente
 * ha prenotato quale risorsa, in quale intervallo di tempo e con quale stato.
 *
 * Questo repository viene usato sia dalle funzionalità utente sia da quelle
 * amministrative:
 *   - l'utente crea, vede e annulla le proprie prenotazioni;
 *   - l'admin consulta tutte le prenotazioni, le filtra e le vede nel calendario;
 *   - i service usano alcune query per controllare conflitti, limiti e capienza.
 *
 * Molte query usano JOIN con users e resources. Una JOIN serve a unire dati
 * provenienti da più tabelle: per esempio, invece di restituire solo user_id e
 * resource_id, la query può restituire anche username e nome della risorsa.
 *
 * Questo evita di fare più query separate per costruire una pagina.
 *
 * Le query più semplici sono preparate una volta con db.prepare().
 * Alcune query più dinamiche, come quelle con filtri opzionali, vengono invece
 * costruite dentro la funzione usando condizioni variabili, ma i valori esterni
 * vengono comunque passati tramite placeholder ?, non concatenati direttamente
 * nell'SQL.
 */

const db = require('../db/connection');

/*
 * Query che recupera una singola prenotazione tramite id.
 *
 * Usa JOIN con users e resources per restituire anche il nome dell'utente e
 * il nome della risorsa collegata alla prenotazione.
 *
 * È utile quando una rotta o un service deve lavorare su una prenotazione
 * specifica e avere già i dati principali pronti.
 */
const stmtFindById = db.prepare(`
  SELECT b.id, b.user_id, b.resource_id, b.start_at, b.end_at,
         b.status, b.created_at,
         u.username AS user_username,
         r.name     AS resource_name
  FROM bookings b
  JOIN users     u ON u.id = b.user_id
  JOIN resources r ON r.id = b.resource_id
  WHERE b.id = ?
`);

/*
 * Query che recupera tutte le prenotazioni di un utente.
 *
 * Viene usata per l'area personale dell'utente, dove ognuno deve vedere solo
 * le proprie prenotazioni.
 *
 * La JOIN con resources aggiunge nome e tipo della risorsa, così la pagina può
 * mostrare informazioni leggibili senza fare altre query.
 */
const stmtFindByUserId = db.prepare(`
  SELECT b.id, b.resource_id, b.start_at, b.end_at, b.status,
         r.name AS resource_name, r.type AS resource_type
  FROM bookings b
  JOIN resources r ON r.id = b.resource_id
  WHERE b.user_id = ?
  ORDER BY b.start_at DESC
`);

/*
 * Query che recupera le prenotazioni future e confermate di un utente.
 *
 * Considera solo le prenotazioni:
 *   - appartenenti all'utente indicato;
 *   - con status = 'confirmed';
 *   - con start_at maggiore o uguale al momento attuale.
 *
 * Serve per la sezione "prossime prenotazioni".
 *
 * L'ordinamento è crescente: la prenotazione più vicina nel tempo viene mostrata
 * per prima.
 */
const stmtFindUpcomingByUser = db.prepare(`
  SELECT b.id, b.resource_id, b.start_at, b.end_at, b.status,
         r.name AS resource_name, r.type AS resource_type
  FROM bookings b
  JOIN resources r ON r.id = b.resource_id
  WHERE b.user_id = ?
    AND b.status = 'confirmed'
    AND b.start_at >= datetime('now', 'localtime')
  ORDER BY b.start_at ASC
`);

/*
 * Query che recupera lo storico delle prenotazioni di un utente.
 *
 * Nello storico rientrano:
 *   - le prenotazioni cancellate;
 *   - le prenotazioni già passate.
 *
 * Le prenotazioni annullate restano nel database con status = 'cancelled',
 * invece di essere eliminate fisicamente. Questo permette di mantenere traccia
 * delle operazioni fatte.
 */
const stmtFindHistoryByUser = db.prepare(`
  SELECT b.id, b.resource_id, b.start_at, b.end_at, b.status,
         r.name AS resource_name, r.type AS resource_type
  FROM bookings b
  JOIN resources r ON r.id = b.resource_id
  WHERE b.user_id = ?
    AND (b.status = 'cancelled' OR b.start_at < datetime('now', 'localtime'))
  ORDER BY b.start_at DESC
`);

/*
 * Query che recupera tutte le prenotazioni per l'area amministrativa.
 *
 * L'admin deve avere una visione complessiva del sistema, quindi questa query
 * non filtra per utente.
 *
 * Le JOIN permettono di mostrare direttamente chi ha prenotato e quale risorsa
 * è stata prenotata.
 */
const stmtFindAll = db.prepare(`
  SELECT b.id, b.start_at, b.end_at, b.status,
         u.username AS user_username,
         r.name     AS resource_name
  FROM bookings b
  JOIN users     u ON u.id = b.user_id
  JOIN resources r ON r.id = b.resource_id
  ORDER BY b.start_at DESC
`);

/*
 * Query che cerca prenotazioni sovrapposte sulla stessa risorsa.
 *
 * È una delle query più importanti per il controllo dei conflitti.
 *
 * Due intervalli si sovrappongono quando:
 *
 *   prenotazione_esistente.start_at < nuovo_end_at
 *   AND
 *   prenotazione_esistente.end_at > nuovo_start_at
 *
 * Questa formula usa intervalli semi-aperti [inizio, fine):
 * una prenotazione 10:00-11:00 e una 11:00-12:00 non sono in conflitto,
 * perché la prima finisce esattamente quando la seconda inizia.
 *
 * Vengono considerate solo prenotazioni confirmed, perché le cancellate non
 * occupano più lo slot.
 */
const stmtFindOverlapping = db.prepare(`
  SELECT id, user_id, start_at, end_at, status
  FROM bookings
  WHERE resource_id = ?
    AND status = 'confirmed'
    AND start_at < ?
    AND end_at   > ?
`);

/*
 * Query che crea una nuova prenotazione.
 *
 * Inserisce user_id, resource_id, start_at ed end_at.
 *
 * Lo status viene fissato direttamente a 'confirmed', perché una prenotazione
 * appena creata e valida nasce confermata.
 */
const stmtInsert = db.prepare(`
  INSERT INTO bookings (user_id, resource_id, start_at, end_at, status)
  VALUES (?, ?, ?, ?, 'confirmed')
`);

/*
 * Query che annulla una prenotazione.
 *
 * Non elimina la riga dal database: cambia solo lo status in 'cancelled'.
 *
 * Questa scelta conserva lo storico e libera lo slot, perché i controlli di
 * conflitto considerano solo prenotazioni confirmed.
 */
const stmtCancel = db.prepare(`
  UPDATE bookings SET status = 'cancelled' WHERE id = ?
`);

/*
 * Query che annulla tutte le prenotazioni future confermate di una risorsa.
 *
 * Serve quando l'admin disattiva o modifica una risorsa e alcune prenotazioni
 * future non sono più compatibili.
 *
 * Le prenotazioni passate non vengono toccate, perché fanno parte dello storico.
 */
const stmtCancelFutureByResource = db.prepare(`
  UPDATE bookings
  SET status = 'cancelled'
  WHERE resource_id = ?
    AND status = 'confirmed'
    AND start_at >= datetime('now', 'localtime')
`);

/*
 * Query che elimina tutte le prenotazioni collegate a una risorsa.
 *
 * Questa operazione è usata solo nei casi di eliminazione definitiva della
 * risorsa.
 *
 * È diversa dall'annullamento: qui le righe vengono cancellate fisicamente.
 *
 * Va eseguita con attenzione, normalmente dentro una transazione insieme alla
 * cancellazione della risorsa, per evitare dati lasciati a metà.
 */
const stmtDeleteAllByResource = db.prepare(`
  DELETE FROM bookings WHERE resource_id = ?
`);

/*
 * Query che conta le prenotazioni future confermate di un utente.
 *
 * Serve per applicare il limite massimo di prenotazioni future attive.
 *
 * Le prenotazioni cancellate e quelle passate non vengono contate.
 */
const stmtCountActiveFutureByUser = db.prepare(`
  SELECT COUNT(*) AS n
  FROM bookings
  WHERE user_id = ?
    AND status = 'confirmed'
    AND start_at >= datetime('now', 'localtime')
`);

/*
 * Query che cerca sovrapposizioni tra prenotazioni dello stesso utente.
 *
 * Serve a impedire che un utente prenoti contemporaneamente due spazi fisici
 * diversi, come due aule, una sala e un laboratorio, oppure due postazioni.
 *
 * Le attrezzature vengono escluse da questo controllo perché sono trattate come
 * risorse prestabili: un utente può teoricamente avere una postazione e anche
 * un'attrezzatura nello stesso intervallo.
 */
const stmtFindUserOverlapNonAttrezzatura = db.prepare(`
  SELECT b.id, b.start_at, b.end_at,
         r.id   AS resource_id,
         r.name AS resource_name,
         r.type AS resource_type
  FROM bookings b
  JOIN resources r ON r.id = b.resource_id
  WHERE b.user_id = ?
    AND b.status = 'confirmed'
    AND r.type != 'attrezzatura'
    AND b.start_at < ?
    AND b.end_at   > ?
`);

/*
 * Query che recupera le prenotazioni confermate di un utente in un certo giorno
 * e per una certa categoria di risorsa.
 *
 * Serve al service per calcolare quanti minuti giornalieri l'utente ha già
 * prenotato in quella categoria.
 *
 * Il filtro LIKE su "YYYY-MM-DD %" funziona perché le date sono salvate come
 * testo nel formato fisso "YYYY-MM-DD HH:MM".
 */
const stmtFindUserDayBookingsByType = db.prepare(`
  SELECT b.id, b.start_at, b.end_at
  FROM bookings b
  JOIN resources r ON r.id = b.resource_id
  WHERE b.user_id = ?
    AND b.status = 'confirmed'
    AND r.type = ?
    AND b.start_at LIKE ? || ' %'
`);

/*
 * Query che recupera le prenotazioni future confermate di una risorsa.
 *
 * È usata nelle operazioni admin delicate, per esempio modifica disponibilità,
 * disattivazione o eliminazione.
 *
 * Prima di procedere, il sistema può mostrare una pagina di conferma indicando
 * quante prenotazioni future saranno coinvolte.
 */
const stmtFindFutureConfirmedByResource = db.prepare(`
  SELECT b.id, b.start_at, b.end_at, b.user_id,
         u.username AS user_username
  FROM bookings b
  JOIN users u ON u.id = b.user_id
  WHERE b.resource_id = ?
    AND b.status = 'confirmed'
    AND b.start_at >= datetime('now', 'localtime')
  ORDER BY b.start_at ASC
`);

/*
 * Query che annulla una prenotazione specifica tramite id.
 *
 * Viene usata quando il sistema deve annullare in blocco un insieme preciso
 * di prenotazioni già individuate.
 */
const stmtCancelById = db.prepare(`
  UPDATE bookings SET status = 'cancelled' WHERE id = ?
`);

/*
 * Funzioni semplici del repository.
 *
 * Ogni funzione chiama lo statement SQL corrispondente.
 *
 * .get() viene usato quando la query restituisce una sola riga.
 * .all() viene usato quando la query restituisce più righe.
 * .run() viene usato per operazioni di scrittura, come INSERT, UPDATE o DELETE.
 *
 * Il resto dell'applicazione usa queste funzioni senza conoscere il dettaglio
 * delle query SQL.
 */
function findById(id) {
  return stmtFindById.get(id);
}

function findByUserId(userId) {
  return stmtFindByUserId.all(userId);
}

function findUpcomingByUser(userId) {
  return stmtFindUpcomingByUser.all(userId);
}

function findHistoryByUser(userId) {
  return stmtFindHistoryByUser.all(userId);
}

/*
 * Ricerca delle prenotazioni per l'area amministrativa.
 *
 * Questa funzione costruisce una query con filtri opzionali:
 *   - period: tutte, future oppure storico;
 *   - type: categoria della risorsa;
 *   - resourceId: singola risorsa.
 *
 * È una query dinamica perché l'admin può combinare i filtri in modi diversi.
 *
 * La parte dinamica riguarda solo le condizioni SQL scelte dal codice.
 * I valori ricevuti dall'esterno vengono sempre messi nell'array params e
 * passati come placeholder ?, quindi non vengono concatenati direttamente
 * nella query.
 *
 * Il risultato include già dati di utente e risorsa grazie alle JOIN, così la
 * tabella admin può mostrare username, email, nome risorsa e tipo risorsa.
 */
function listForAdmin({ period = 'all', type = null, resourceId = null } = {}) {
  // L'ordinamento esposto all'admin segue una regola "naturale" per
  // ogni tipologia di periodo:
  //   - 'future'    le più vicine in cima (ASC su start_at);
  //   - 'history'   le più recenti in cima (DESC su start_at);
  //   - 'all'       sezione future ASC seguita da sezione history
  //                 DESC (un'unica query con ORDER BY composto che
  //                 sfrutta una colonna calcolata "bucket": 0 per
  //                 le future attive, 1 per lo storico).
  //
  // Implementare l'ordine "futuro ASC poi storico DESC" come una
  // singola SELECT evita di concatenare due query JS-side e
  // mantiene risultati paginabili in modo prevedibile.
  const conditions = [];
  const params = [];

  if (period === 'future') {
    conditions.push("b.status = 'confirmed' AND b.start_at >= datetime('now', 'localtime')");
  } else if (period === 'history') {
    conditions.push("(b.status = 'cancelled' OR b.start_at < datetime('now', 'localtime'))");
  }

  if (type) {
    conditions.push('r.type = ?');
    params.push(type);
  }

  if (resourceId) {
    conditions.push('b.resource_id = ?');
    params.push(resourceId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy;
  if (period === 'future') {
    orderBy = 'ORDER BY b.start_at ASC';
  } else if (period === 'history') {
    orderBy = 'ORDER BY b.start_at DESC';
  } else {
    // CASE: future-confirmed → bucket 0 (ordinare ASC), tutto il
    // resto → bucket 1 (ordinare DESC). Costruiamo la chiave di
    // ordinamento direttamente in SQL così SQLite ordina senza
    // bisogno di post-processing in JS.
    orderBy = `
      ORDER BY
        CASE
          WHEN b.status = 'confirmed' AND b.start_at >= datetime('now', 'localtime') THEN 0
          ELSE 1
        END ASC,
        CASE
          WHEN b.status = 'confirmed' AND b.start_at >= datetime('now', 'localtime') THEN b.start_at
        END ASC,
        CASE
          WHEN NOT (b.status = 'confirmed' AND b.start_at >= datetime('now', 'localtime')) THEN b.start_at
        END DESC
    `;
  }

  const sql = `
    SELECT b.id, b.start_at, b.end_at, b.status,
           u.username AS user_username, u.email AS user_email,
           r.id   AS resource_id,
           r.name AS resource_name,
           r.type AS resource_type
    FROM bookings b
    JOIN users     u ON u.id = b.user_id
    JOIN resources r ON r.id = b.resource_id
    ${where}
    ${orderBy}
  `;

  return db.prepare(sql).all(...params);
}

function findAll() {
  return stmtFindAll.all();
}

/*
 * Recupera le prenotazioni che si sovrappongono a un intervallo temporale.
 *
 * È utile soprattutto per le viste calendario, dove bisogna mostrare tutte le
 * prenotazioni presenti in una certa settimana o in un certo intervallo.
 *
 * La funzione accetta filtri opzionali per:
 *   - categoria della risorsa;
 *   - singola risorsa;
 *   - stato della prenotazione.
 *
 * Anche qui viene usata la formula di overlap:
 *
 *   b.start_at < rangeEnd
 *   AND
 *   b.end_at > rangeStart
 *
 * Così vengono prese tutte le prenotazioni che intersecano l'intervallo
 * richiesto, anche se iniziano prima o finiscono dopo.
 */
function findInRange({
  rangeStart,
  rangeEnd,
  type = null,
  resourceId = null,
  status = 'all',
} = {}) {
  const conditions = ['b.start_at < ?', 'b.end_at > ?'];
  const params = [rangeEnd, rangeStart];

  if (status === 'confirmed') {
    conditions.push("b.status = 'confirmed'");
  } else if (status === 'cancelled') {
    conditions.push("b.status = 'cancelled'");
  }
  if (type) {
    conditions.push('r.type = ?');
    params.push(type);
  }
  if (resourceId) {
    conditions.push('b.resource_id = ?');
    params.push(resourceId);
  }

  const sql = `
    SELECT b.id, b.start_at, b.end_at, b.status, b.user_id,
           u.username AS user_username, u.email AS user_email,
           r.id   AS resource_id,
           r.name AS resource_name,
           r.type AS resource_type,
           r.capacity AS resource_capacity
    FROM bookings b
    JOIN users     u ON u.id = b.user_id
    JOIN resources r ON r.id = b.resource_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY b.start_at ASC
  `;
  return db.prepare(sql).all(...params);
}

/*
 * Wrapper della query di conflitto sulla risorsa.
 *
 * Riceve resourceId, startAt ed endAt nel modo più naturale per il chiamante,
 * ma li passa allo statement nell'ordine richiesto dalla query:
 * resourceId, endAt, startAt.
 */
function findOverlapping(resourceId, startAt, endAt) {
  return stmtFindOverlapping.all(resourceId, endAt, startAt);
}

/*
 * Crea una prenotazione e restituisce l'id generato da SQLite.
 *
 * La validazione completa non avviene qui: questo repository inserisce il dato.
 * Le regole applicative, come conflitti e limiti, vengono controllate nei service.
 */
function create({ user_id, resource_id, start_at, end_at }) {
  const info = stmtInsert.run(user_id, resource_id, start_at, end_at);
  return info.lastInsertRowid;
}

/*
 * Annulla una prenotazione impostando status = 'cancelled'.
 *
 * Restituisce il numero di righe modificate.
 */
function cancel(id) {
  return stmtCancel.run(id).changes;
}

/*
 * Annulla tutte le prenotazioni future confermate di una risorsa.
 *
 * Restituisce quante righe sono state aggiornate.
 */
function cancelFutureByResource(resourceId) {
  return stmtCancelFutureByResource.run(resourceId).changes;
}

/*
 * Elimina fisicamente tutte le prenotazioni collegate a una risorsa.
 *
 * Da usare solo nelle operazioni amministrative di eliminazione definitiva.
 */
function deleteAllByResource(resourceId) {
  return stmtDeleteAllByResource.run(resourceId).changes;
}

/*
 * Restituisce il numero di prenotazioni future confermate di un utente.
 *
 * È usato per controllare il limite massimo di prenotazioni attive future.
 */
function countActiveFutureByUser(userId) {
  return stmtCountActiveFutureByUser.get(userId).n;
}

/*
 * Recupera eventuali sovrapposizioni dell'utente su risorse non attrezzatura.
 *
 * È usato dal service per impedire prenotazioni contemporanee su più spazi.
 */
function findUserOverlapNonAttrezzatura(userId, startAt, endAt) {
  return stmtFindUserOverlapNonAttrezzatura.all(userId, endAt, startAt);
}

/*
 * Recupera le prenotazioni giornaliere di un utente per categoria.
 *
 * È usato per calcolare il limite massimo di minuti prenotabili al giorno.
 */
function findUserDayBookingsByType(userId, type, isoDate) {
  return stmtFindUserDayBookingsByType.all(userId, type, isoDate);
}

/*
 * Recupera le prenotazioni future confermate di una risorsa.
 *
 * È utile nelle conferme admin prima di modifiche o disattivazioni impattanti.
 */
function findFutureConfirmedByResource(resourceId) {
  return stmtFindFutureConfirmedByResource.all(resourceId);
}

/*
 * Annulla più prenotazioni partendo da un elenco di id.
 *
 * Esegue una UPDATE per ogni id e somma il numero totale di righe modificate.
 *
 * Questa funzione è pensata per essere chiamata dentro una transazione esterna,
 * quando una modifica admin rende incompatibili più prenotazioni future.
 */
function cancelManyByIds(ids) {
  let changed = 0;
  for (const id of ids) {
    changed += stmtCancelById.run(id).changes;
  }
  return changed;
}

/*
 * Esportazione delle funzioni del repository.
 *
 * Gli altri file del progetto possono usare queste funzioni per lavorare sulle
 * prenotazioni senza scrivere direttamente query SQL.
 */
module.exports = {
  findById,
  findByUserId,
  findUpcomingByUser,
  findHistoryByUser,
  findAll,
  findOverlapping,
  listForAdmin,
  findInRange,
  create,
  cancel,
  cancelFutureByResource,
  deleteAllByResource,
  countActiveFutureByUser,
  findUserOverlapNonAttrezzatura,
  findUserDayBookingsByType,
  findFutureConfirmedByResource,
  cancelManyByIds,
};
