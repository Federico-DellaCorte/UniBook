/*
 * Script di inizializzazione del database.
 *
 * Questo file viene eseguito quando lancio:
 *
 *   npm run db:init
 *
 * Il suo compito è preparare il database SQLite locale data/app.db,
 * creando le tabelle e gli indici definiti nel file schema.sql.
 *
 * La differenza tra questo file e schema.sql è importante:
 *   - schema.sql contiene le istruzioni SQL che descrivono la struttura
 *     del database;
 *   - init.js legge quel file e lo applica concretamente al database.
 *
 * Lo script usa db.exec(schemaSql), cioè passa a SQLite l'intero contenuto
 * di schema.sql. In questo modo vengono eseguite tutte le CREATE TABLE,
 * CREATE INDEX e i vincoli definiti nello schema.
 *
 * Le istruzioni SQL principali usano IF NOT EXISTS, quindi lo script può
 * essere lanciato più volte senza cancellare tabelle o dati già presenti.
 * Questo comportamento si chiama idempotenza: eseguire più volte lo stesso
 * comando produce uno stato finale coerente, senza duplicare o rompere la
 * struttura.
 *
 * Oltre ad applicare lo schema, il file gestisce anche piccole migrazioni
 * incrementali. Una migrazione serve ad aggiornare un database già esistente
 * quando il progetto cambia nel tempo, per esempio aggiungendo una colonna
 * che prima non c'era.
 *
 * In sintesi, init.js non inserisce dati demo: prepara o aggiorna la struttura
 * del database. I dati iniziali vengono invece inseriti da seed.js.
 */

const fs = require('fs');
const path = require('path');
const db = require('./connection');

/*
 * Percorso e lettura del file schema.sql.
 *
 * schemaPath costruisce il percorso del file schema.sql che si trova nella
 * stessa cartella di init.js.
 *
 * fs.readFileSync(..., 'utf8') legge il contenuto del file come testo.
 * Il risultato, schemaSql, è una stringa contenente tutte le istruzioni SQL
 * che definiscono tabelle, vincoli e indici.
 */
const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

/*
 * Applicazione dello schema al database.
 *
 * db.exec() esegue una o più istruzioni SQL contenute in una stringa.
 * Qui viene usato per applicare tutto schema.sql al database aperto tramite
 * connection.js.
 *
 * Dopo questa riga, se il database era vuoto, esistono le tabelle principali
 * dell'applicazione. Se invece le tabelle esistevano già, le istruzioni
 * IF NOT EXISTS evitano errori e non cancellano i dati presenti.
 */
db.exec(schemaSql);
console.log('Schema applicato. Tabelle e indici pronti in data/app.db.');

/*
 * Funzione di migrazione per aggiungere colonne mancanti.
 *
 * SQLite permette di aggiungere una colonna con ALTER TABLE ADD COLUMN,
 * ma non offre direttamente una sintassi "ADD COLUMN IF NOT EXISTS".
 *
 * Per questo viene definita ensureColumn:
 *   1. legge le colonne reali della tabella usando PRAGMA table_info;
 *   2. controlla se la colonna richiesta esiste già;
 *   3. se manca, la aggiunge con ALTER TABLE.
 *
 * PRAGMA table_info(nome_tabella) è un comando SQLite che restituisce
 * informazioni sulla struttura di una tabella, come nomi delle colonne,
 * tipi e vincoli.
 *
 * Questa funzione rende la migrazione sicura e ripetibile: posso rilanciare
 * npm run db:init più volte senza aggiungere due volte la stessa colonna.
 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migrazione: aggiunta colonna ${table}.${column}.`);
    return true;
  }
  return false;
}

/*
 * Migrazioni incrementali sulla tabella resources.
 *
 * Queste righe assicurano che la tabella resources abbia le colonne opens_at
 * e closes_at. Sono colonne legate agli orari di apertura e chiusura base
 * della risorsa.
 *
 * Se il database è nuovo, queste colonne sono già create da schema.sql.
 * Se invece il database viene da una versione precedente del progetto, questa
 * migrazione le aggiunge senza cancellare i dati esistenti.
 *
 * I valori di default 08:00 e 22:00 servono a mantenere valide anche le
 * risorse già presenti.
 */
ensureColumn('resources', 'opens_at', `TEXT NOT NULL DEFAULT '08:00'`);
ensureColumn('resources', 'closes_at', `TEXT NOT NULL DEFAULT '22:00'`);

/*
 * Backfill della disponibilità settimanale.
 *
 * Un backfill è un riempimento automatico di dati mancanti in un database
 * già esistente.
 *
 * In questo caso lo script cerca risorse che esistono nella tabella resources
 * ma non hanno ancora righe nella tabella resource_availability.
 *
 * resource_availability è la tabella che descrive in quali giorni e orari una
 * risorsa è prenotabile. Ogni risorsa dovrebbe avere sette righe, una per
 * ciascun giorno della settimana.
 *
 * Per le risorse senza disponibilità, lo script crea automaticamente:
 *   - lunedì-venerdì aperti, usando opens_at e closes_at della risorsa;
 *   - sabato e domenica chiusi.
 *
 * Le risorse che hanno già disponibilità configurate non vengono toccate.
 * Anche questo rende lo script idempotente: rilanciarlo non duplica le righe.
 */
const orphanResources = db
  .prepare(`
    SELECT r.id, r.opens_at, r.closes_at
    FROM resources r
    WHERE NOT EXISTS (
      SELECT 1 FROM resource_availability a WHERE a.resource_id = r.id
    )
  `)
  .all();

if (orphanResources.length > 0) {
  const insertAvailability = db.prepare(`
    INSERT INTO resource_availability (resource_id, weekday, is_open, opens_at, closes_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
    /*
   * Inserimento delle disponibilità mancanti dentro una transazione.
   *
   * Una transazione raggruppa più operazioni SQL in un unico blocco:
   * o riescono tutte, oppure in caso di errore vengono annullate.
   *
   * Qui è utile perché per ogni risorsa devono essere create più righe
   * di disponibilità. Non vogliamo rischiare di inserirne solo alcune
   * e lasciare il database in uno stato incompleto.
   */
  const backfill = db.transaction((rows) => {
    for (const r of rows) {
      const open = r.opens_at || '08:00';
      const close = r.closes_at || '22:00';
      for (let w = 1; w <= 5; w++) {
        insertAvailability.run(r.id, w, 1, open, close);
      }
      insertAvailability.run(r.id, 6, 0, null, null);
      insertAvailability.run(r.id, 7, 0, null, null);
    }
  });
  backfill(orphanResources);
  console.log(`Migrazione: creata disponibilità settimanale per ${orphanResources.length} risorsa/e (lun-ven aperto, sab-dom chiuso).`);
}
