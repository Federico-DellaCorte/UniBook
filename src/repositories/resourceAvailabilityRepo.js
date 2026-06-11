/*
 * Repository della disponibilità settimanale delle risorse.
 *
 * Questo file gestisce l'accesso alla tabella resource_availability.
 * La tabella contiene le fasce orarie settimanali in cui ogni risorsa
 * può essere prenotata.
 *
 * Ogni risorsa dovrebbe avere 7 righe di disponibilità, una per ogni giorno
 * della settimana:
 *   - 1 = lunedì;
 *   - 2 = martedì;
 *   - ...
 *   - 7 = domenica.
 *
 * Ogni riga indica se la risorsa è aperta in quel giorno e, se è aperta,
 * qual è l'orario di apertura e chiusura.
 *
 * Questo repository viene usato in più punti del progetto:
 *   - quando si mostra il dettaglio di una risorsa;
 *   - quando si controlla se una prenotazione rientra negli orari disponibili;
 *   - quando l'admin crea o modifica la disponibilità settimanale;
 *   - quando il seed inserisce le disponibilità demo.
 *
 * Le query sono preparate con prepared statement, quindi i valori variabili
 * vengono passati tramite placeholder ? e non concatenati dentro la stringa SQL.
 *
 * La funzione più delicata è replaceForResource(): elimina le vecchie righe
 * di disponibilità di una risorsa e inserisce quelle nuove. Per evitare stati
 * incompleti, questa sostituzione avviene dentro una transazione.
 */

const db = require('../db/connection');

/*
 * Query che recupera tutte le disponibilità settimanali di una risorsa.
 *
 * Restituisce le righe ordinate per weekday, quindi dal lunedì alla domenica.
 *
 * È utile quando devo mostrare all'utente o all'admin l'intero calendario
 * settimanale di apertura di una risorsa.
 */
const stmtFindByResource = db.prepare(`
  SELECT id, resource_id, weekday, is_open, opens_at, closes_at
  FROM resource_availability
  WHERE resource_id = ?
  ORDER BY weekday
`);

/*
 * Query che recupera la disponibilità di una risorsa in un singolo giorno.
 *
 * Serve quando il sistema deve controllare una prenotazione specifica:
 * data una risorsa e un giorno della settimana, bisogna sapere se quel giorno
 * la risorsa è aperta e quali sono opens_at e closes_at.
 */
const stmtFindOne = db.prepare(`
  SELECT id, resource_id, weekday, is_open, opens_at, closes_at
  FROM resource_availability
  WHERE resource_id = ? AND weekday = ?
`);

/*
 * Query che elimina tutte le righe di disponibilità associate a una risorsa.
 *
 * Viene usata quando l'admin modifica la disponibilità settimanale:
 * prima si rimuove la vecchia configurazione, poi si inserisce quella nuova.
 */
const stmtDeleteByResource = db.prepare(`
  DELETE FROM resource_availability WHERE resource_id = ?
`);

/*
 * Query che inserisce una nuova riga di disponibilità settimanale.
 *
 * Ogni inserimento rappresenta un giorno della settimana per una risorsa:
 * resource_id collega la riga alla risorsa, weekday indica il giorno,
 * is_open dice se è aperta, opens_at e closes_at indicano la fascia oraria.
 */
const stmtInsert = db.prepare(`
  INSERT INTO resource_availability
    (resource_id, weekday, is_open, opens_at, closes_at)
  VALUES (?, ?, ?, ?, ?)
`);

/*
 * Funzioni esportate dal repository.
 *
 * Queste funzioni nascondono alle route e ai service il dettaglio delle query SQL.
 * Chi usa il repository non deve sapere come è scritta la SELECT o la INSERT:
 * chiama semplicemente una funzione con un nome descrittivo.
 *
 * .all() viene usato quando servono più righe.
 * .get() viene usato quando serve una sola riga.
 * .run() viene usato per query che modificano il database.
 */
function findByResourceId(resourceId) {
  return stmtFindByResource.all(resourceId);
}

function findOne(resourceId, weekday) {
  return stmtFindOne.get(resourceId, weekday);
}

/*
 * Sostituisce la disponibilità settimanale di una risorsa.
 *
 * Questa funzione riceve l'id della risorsa e un array di righe, normalmente
 * sette, una per ogni giorno della settimana.
 *
 * La logica è:
 *   1. elimino tutte le disponibilità precedenti della risorsa;
 *   2. inserisco le nuove disponibilità ricevute;
 *   3. salvo null come opens_at/closes_at nei giorni chiusi.
 *
 * Questa operazione viene eseguita dentro una transazione perché deve essere
 * atomica. Non voglio rischiare di cancellare la vecchia disponibilità e poi,
 * in caso di errore, inserire solo una parte di quella nuova.
 *
 * Con la transazione, o tutta la sostituzione riesce, oppure il database torna
 * allo stato precedente.
 */

function replaceForResource(resourceId, rows) {
  const txn = db.transaction((rid, items) => {
    stmtDeleteByResource.run(rid);
    for (const it of items) {
      stmtInsert.run(
        rid,
        it.weekday,
        it.is_open ? 1 : 0,
        it.is_open ? it.opens_at : null,
        it.is_open ? it.closes_at : null
      );
    }
  });
  txn(resourceId, rows);
}

/*
 * Esportazione delle funzioni del repository.
 *
 * Gli altri file del progetto possono così leggere o sostituire la disponibilità
 * settimanale delle risorse senza scrivere direttamente SQL.
 */
module.exports = {
  findByResourceId,
  findOne,
  replaceForResource,
};
