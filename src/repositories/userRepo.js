/*
 * Repository degli utenti.
 *
 * Un repository è un modulo che si occupa dell'accesso ai dati di una
 * specifica tabella del database. In questo caso, userRepo.js è il punto
 * unico in cui il progetto legge o scrive dati nella tabella users.
 *
 * Le rotte e i middleware non scrivono SQL direttamente: chiamano funzioni
 * come findById(), findByUsernameOrEmail() o create(). Questo rende il codice
 * più ordinato, perché la logica HTTP resta nelle routes, mentre le query
 * verso il database restano nei repository.
 *
 * Questo file usa prepared statement di better-sqlite3. Un prepared statement
 * è una query SQL preparata in anticipo, dove i valori variabili vengono
 * inseriti tramite placeholder ?, invece di essere concatenati direttamente
 * dentro la stringa SQL.
 *
 * Esempio:
 *   WHERE username = ?
 *
 * Il ? viene riempito in modo sicuro quando la funzione viene eseguita.
 * Questo riduce il rischio di SQL injection, perché l'input dell'utente non
 * viene mai trattato come parte del codice SQL, ma solo come valore.
 *
 * In sintesi:
 *   - userRepo.js centralizza le query sugli utenti;
 *   - le routes usano funzioni descrittive invece di SQL diretto;
 *   - i prepared statement rendono le query più sicure e riutilizzabili.
 */

const db = require('../db/connection');

/*
 * Query per cercare un utente tramite username.
 *
 * Restituisce anche password_hash perché questa query può essere usata nel
 * processo di autenticazione, dove serve confrontare la password inserita
 * con l'hash salvato nel database.
 *
 * La password in chiaro non viene mai salvata: nel database esiste solo
 * password_hash.
 * 
 * Recupera un utente in base alla username e include il campo
 * password_hash. È la query pensata per il processo di login, dove
 * l'hash memorizzato deve essere confrontato con la password
 * fornita dall'utente tramite bcrypt.compare().
 */
const stmtFindByUsername = db.prepare(`
  SELECT id, username, email, password_hash, role, created_at
  FROM users
  WHERE username = ?
`);

/*
 * Query per cercare un utente tramite email.
 *
 * Serve sia durante il login, perché l'applicazione permette di accedere
 * anche con l'email, sia durante la registrazione, per controllare che una
 * nuova email non sia già associata a un account esistente.
 */
const stmtFindByEmail = db.prepare(`
  SELECT id, username, email, password_hash, role, created_at
  FROM users
  WHERE email = ?
`);

/*
 * Query usata nel login quando l'utente può inserire username oppure email.
 *
 * Invece di fare due query separate, il database controlla entrambe le colonne
 * con una sola istruzione SQL:
 *
 *   WHERE username = ? OR email = ?
 *
 * Lo stesso valore inserito nel form viene passato a entrambi i placeholder.
 * Se corrisponde a uno username o a un'email, viene restituito l'utente.
 */
const stmtFindByUsernameOrEmail = db.prepare(`
  SELECT id, username, email, password_hash, role, created_at
  FROM users
  WHERE username = ? OR email = ?
`);

/*
 * Query per recuperare un utente tramite id.
 *
 * È usata soprattutto da currentUser.js: nella sessione viene salvato solo
 * l'id dell'utente, poi a ogni richiesta questo id viene usato per recuperare
 * il record completo dal database.
 *
 * Qui non viene selezionato password_hash, perché per mostrare l'utente nelle
 * pagine o controllarne il ruolo non serve avere l'hash della password.
 * Meno dati sensibili circolano nell'applicazione, meglio è.
 */
const stmtFindById = db.prepare(`
  SELECT id, username, email, role, created_at
  FROM users
  WHERE id = ?
`);

/*
 * Query per creare un nuovo utente standard.
 *
 * Inserisce username, email e password_hash nella tabella users.
 *
 * Il ruolo viene impostato direttamente nella query come 'user'. Questo è
 * importante perché il ruolo non arriva dal form di registrazione: un nuovo
 * utente non può auto-attribuirsi il ruolo admin modificando manualmente la
 * richiesta dal browser.
 *
 * Gli amministratori vengono creati solo tramite seed iniziale, non tramite
 * registrazione pubblica.
 */
const stmtInsert = db.prepare(`
  INSERT INTO users (username, email, password_hash, role)
  VALUES (?, ?, ?, 'user')
`);

/*
 * Funzioni esportate dal repository.
 *
 * Ogni funzione è un piccolo wrapper attorno a uno statement SQL preparato.
 * Le altre parti del progetto non devono conoscere i dettagli della query:
 * chiamano semplicemente una funzione con un nome descrittivo.
 *
 * .get() viene usato per le SELECT che devono restituire al massimo una riga.
 * .run() viene usato per le query di scrittura, come INSERT.
 */
function findByUsername(username) {
  return stmtFindByUsername.get(username);
}

function findByEmail(email) {
  return stmtFindByEmail.get(email);
}

function findByUsernameOrEmail(value) {
  // Lo stesso valore viene passato per entrambi i placeholder: la
  // query restituisce il record se corrisponde all'username oppure
  // all'email. Username ed email sono entrambi UNIQUE, quindi al
  // massimo verrà restituita una riga.
  return stmtFindByUsernameOrEmail.get(value, value);
}

function findById(id) {
  return stmtFindById.get(id);
}

function create({ username, email, password_hash }) {
  const info = stmtInsert.run(username, email, password_hash);
  return info.lastInsertRowid;
}

/*
 * Esportazione delle funzioni del repository.
 *
 * In questo modo routes e middleware possono usare le operazioni sugli utenti
 * senza accedere direttamente al database e senza riscrivere query SQL.
 */
module.exports = {
  findByUsername,
  findByEmail,
  findByUsernameOrEmail,
  findById,
  create,
};
