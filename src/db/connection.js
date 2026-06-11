/*
 * Connessione condivisa al database SQLite.
 *
 * Questo file è il punto unico in cui UniBook apre il database locale.
 * Tutti i repository importano questa stessa connessione invece di aprirne
 * una nuova ogni volta.
 *
 * Il database usato dal progetto è SQLite: a differenza di database come
 * PostgreSQL o MySQL, non richiede un server separato, ma salva i dati in
 * un file locale. Nel nostro caso il file è:
 *
 *   data/app.db
 *
 * Questo file viene creato quando si esegue npm run db:init e contiene le
 * tabelle dell'applicazione: utenti, risorse, disponibilità e prenotazioni.
 *
 * better-sqlite3 è la libreria che permette a Node.js di parlare con SQLite.
 * Espone un'API sincrona: quando eseguo una query, il risultato viene restituito
 * direttamente, senza callback o Promise. Per un progetto didattico locale
 * questa scelta rende il codice più semplice da leggere e da spiegare.
 *
 * Centralizzare la connessione qui è importante perché:
 *   - evita di aprire più connessioni sparse verso lo stesso file app.db;
 *   - garantisce che le impostazioni del database siano applicate una volta sola;
 *   - permette a tutti i repository di usare lo stesso oggetto db;
 *   - rende più semplice cambiare in futuro il modo in cui il database viene aperto.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/*
 * Percorso della cartella e del file database.
 *
 * DB_DIR indica la cartella data/ nella radice del progetto.
 * DB_PATH indica il file effettivo del database: data/app.db.
 *
 * Uso path.join() invece di scrivere il percorso a mano, perché così il codice
 * funziona correttamente su sistemi diversi, per esempio Windows, macOS e Linux,
 * dove i separatori di cartella possono cambiare.
 *
 * La cartella data/ è separata da src/ perché app.db non è codice sorgente:
 * è un file generato localmente e può essere ricreato con gli script del progetto.
 */
const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'app.db');

/*
 * Creazione della cartella data/ se non esiste.
 *
 * SQLite può creare automaticamente il file app.db, ma non crea da solo le
 * cartelle mancanti. Per questo, prima di aprire il database, ci assicuriamo
 * che la cartella data/ esista.
 *
 * L'opzione recursive: true evita errori se la cartella esiste già e permette
 * di creare anche eventuali cartelle intermedie.
 */
fs.mkdirSync(DB_DIR, { recursive: true });

/*
 * Apertura del database SQLite.
 *
 * Se il file data/app.db esiste già, better-sqlite3 lo apre.
 * Se invece non esiste, SQLite crea il file vuoto.
 *
 * Le tabelle non vengono create qui: vengono create da src/db/init.js leggendo
 * lo schema SQL. Questo file si occupa solo di aprire la connessione.
 */
const db = new Database(DB_PATH);

/*
 * Attivazione delle foreign key.
 *
 * Le foreign key sono vincoli che collegano tabelle diverse. Nel progetto,
 * per esempio, una prenotazione contiene user_id e resource_id, che devono
 * riferirsi a un utente e a una risorsa realmente esistenti.
 *
 * In SQLite il controllo delle foreign key non è sempre attivo di default,
 * quindi viene abilitato esplicitamente con questo pragma.
 *
 * Senza questa riga, il database potrebbe accettare dati incoerenti, come una
 * prenotazione collegata a un utente inesistente.
 */
db.pragma('foreign_keys = ON');

/*
 * Esportazione della connessione.
 *
 * In questo modo tutti gli altri file possono importare lo stesso oggetto db
 * e usarlo per preparare query, leggere dati, scrivere dati e avviare transazioni.
 */
module.exports = db;
