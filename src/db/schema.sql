-- Schema relazionale dell'applicazione UniBook.
--
-- Questo file definisce la struttura del database SQLite usato dal progetto.
-- Non contiene i dati demo: quelli vengono inseriti da seed.js. Qui vengono
-- invece definite tabelle, colonne, vincoli e indici.
--
-- Quando viene eseguito npm run db:init, lo script init.js legge questo file
-- e applica queste istruzioni al database locale data/app.db.
--
-- Le istruzioni usano CREATE TABLE IF NOT EXISTS e CREATE INDEX IF NOT EXISTS:
-- questo significa che lo script può essere eseguito più volte senza generare
-- errore se le tabelle o gli indici esistono già.
--
-- Il database è relazionale perché le informazioni sono divise in tabelle
-- collegate tra loro. In particolare:
--   - users contiene gli utenti;
--   - resources contiene le risorse prenotabili;
--   - bookings collega utenti e risorse attraverso le prenotazioni;
--   - resource_availability contiene le disponibilità settimanali delle risorse.
--
-- I vincoli CHECK, UNIQUE e FOREIGN KEY servono a proteggere la coerenza dei
-- dati anche se qualche controllo applicativo venisse aggirato


-- Tabella users: utenti dell'applicazione
--
-- Questa tabella contiene gli account degli utenti registrati.
--
-- Ogni utente ha:
--   - id: identificativo numerico univoco generato automaticamente;
--   - username: nome utente, unico nel sistema;
--   - email: indirizzo email, unico nel sistema;
--   - password_hash: hash bcrypt della password;
--   - role: ruolo applicativo, cioè admin oppure user;
--   - created_at: data di creazione dell'account.
--
-- username ed email sono UNIQUE perché entrambi possono identificare un account
-- e vengono usati nel login.
--
-- La password vera non viene mai salvata: viene salvato solo password_hash.
-- Questo è fondamentale perché, anche aprendo il database, non si vedono le
-- password in chiaro.
--
-- Il ruolo ha un vincolo CHECK: il database accetta solo 'admin' o 'user'.
-- Questo impedisce l'inserimento di ruoli non previsti.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);


-- Tabella resources: risorse prenotabili
--
-- Questa tabella contiene tutto ciò che un utente può prenotare:
-- aule, sale, laboratori, postazioni informatiche e attrezzature.
--
-- Ogni risorsa ha:
--   - id: identificativo univoco;
--   - name: nome della risorsa;
--   - type: categoria tecnica della risorsa;
--   - capacity: capienza o numero massimo di prenotazioni contemporanee;
--   - location: posizione fisica;
--   - description: descrizione libera;
--   - active: indica se la risorsa è attiva o disattivata;
--   - opens_at e closes_at: orari legacy/default della risorsa.
--
-- Il campo type ha un CHECK che limita le categorie ai valori previsti
-- dall'applicazione: aula, sala, laboratorio, postazione, attrezzatura.
--
-- Il campo active funziona come soft delete:
--   - active = 1 significa risorsa visibile e prenotabile;
--   - active = 0 significa risorsa disattivata e non prenotabile.
--
-- Disattivare una risorsa è diverso da eliminarla: la risorsa rimane nel
-- database e lo storico può essere conservato.
--
-- La capacity ha un vincolo CHECK: deve essere maggiore di 0 e non superiore
-- a 1499. Questo limite deve restare coerente con MAX_CAPACITY in constants.js.
CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('aula','sala','laboratorio','postazione','attrezzatura')),
  capacity    INTEGER NOT NULL CHECK (capacity > 0 AND capacity <= 1499),
  location    TEXT,
  description TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  opens_at    TEXT NOT NULL DEFAULT '08:00',
  closes_at   TEXT NOT NULL DEFAULT '22:00'
);


-- Tabella bookings: prenotazioni
--
-- Questa tabella contiene le prenotazioni effettuate dagli utenti.
--
-- Ogni prenotazione collega:
--   - un utente, tramite user_id;
--   - una risorsa, tramite resource_id;
--   - un intervallo temporale, tramite start_at ed end_at;
--   - uno stato, tramite status.
--
-- Le date sono salvate come testo nel formato "YYYY-MM-DD HH:MM".
-- Questo formato è comodo perché l'ordine alfabetico coincide con l'ordine
-- cronologico: SQLite può confrontare correttamente le date anche se sono TEXT.
--
-- user_id è una foreign key verso users(id).
-- resource_id è una foreign key verso resources(id).
--
-- Le foreign key impediscono di creare prenotazioni collegate a utenti o
-- risorse inesistenti.
--
-- Il campo status può essere:
--   - confirmed: prenotazione attiva/confermata;
--   - cancelled: prenotazione annullata.
--
-- Una prenotazione annullata non viene cancellata fisicamente dal database:
-- cambia stato. Questo permette di mantenere lo storico.
--
-- Il CHECK (start_at < end_at) garantisce che una prenotazione finisca dopo
-- essere iniziata.
--
-- In questa tabella non c'è ON DELETE CASCADE sulle prenotazioni: quindi una
-- risorsa o un utente referenziati da prenotazioni non vengono eliminati in
-- modo silenzioso dal database.
CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  start_at    TEXT NOT NULL,
  end_at      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed', 'cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_at < end_at)
);


-- Tabella resource_availability: disponibilità settimanale
--
-- Questa tabella definisce quando una risorsa è prenotabile durante la settimana.
--
-- Per ogni risorsa vengono create sette righe, una per ciascun giorno:
--   - 1 = lunedì;
--   - 2 = martedì;
--   - ...
--   - 7 = domenica.
--
-- Ogni riga dice:
--   - se la risorsa è aperta in quel giorno, tramite is_open;
--   - a che ora apre, tramite opens_at;
--   - a che ora chiude, tramite closes_at.
--
-- Se is_open = 0, la risorsa è chiusa in quel giorno e opens_at/closes_at
-- possono restare NULL.
--
-- Il vincolo UNIQUE(resource_id, weekday) impedisce di avere due disponibilità
-- diverse per la stessa risorsa nello stesso giorno.
--
-- Qui resource_id ha ON DELETE CASCADE: se una risorsa viene eliminata
-- fisicamente, vengono eliminate automaticamente anche le sue righe di
-- disponibilità settimanale. Questo evita disponibilità orfane collegate a una
-- risorsa che non esiste più.
CREATE TABLE IF NOT EXISTS resource_availability (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_open     INTEGER NOT NULL DEFAULT 0 CHECK (is_open IN (0, 1)),
  opens_at    TEXT,
  closes_at   TEXT,
  UNIQUE (resource_id, weekday)
);

-- Indice sulle disponibilità per risorsa.
--
-- Serve perché l'applicazione recupera spesso tutte le disponibilità settimanali
-- di una risorsa. Con questo indice SQLite trova più velocemente le righe con
-- lo stesso resource_id.
CREATE INDEX IF NOT EXISTS idx_availability_resource
  ON resource_availability(resource_id);

-- Indice sulle prenotazioni per risorsa e intervallo temporale.
--
-- È utile per il controllo dei conflitti: quando un utente prova a prenotare
-- una risorsa, il sistema deve cercare rapidamente le prenotazioni già presenti
-- sulla stessa risorsa nello stesso intervallo di tempo.
CREATE INDEX IF NOT EXISTS idx_bookings_resource_time
  ON bookings(resource_id, start_at, end_at);

-- Indice sulle prenotazioni per utente.
--
-- Serve per recuperare velocemente la sezione "Le mie prenotazioni", dove
-- vengono mostrate solo le prenotazioni dell'utente autenticato.
CREATE INDEX IF NOT EXISTS idx_bookings_user
  ON bookings(user_id);

-- Indice sulle prenotazioni per utente e intervallo temporale.
--
-- Aiuta i controlli più avanzati: sovrapposizioni tra prenotazioni dello stesso
-- utente, limiti giornalieri e conteggi legati agli intervalli temporali.
CREATE INDEX IF NOT EXISTS idx_bookings_user_time
  ON bookings(user_id, start_at, end_at);

-- Indice su status e start_at.
--
-- Serve per cercare velocemente prenotazioni future confermate, cioè query del
-- tipo: status = 'confirmed' e start_at >= data corrente.
--
-- Questo tipo di ricerca viene usato, per esempio, nei controlli sulle
-- prenotazioni future attive e nelle conferme intermedie dell'area admin.
CREATE INDEX IF NOT EXISTS idx_bookings_status_time
  ON bookings(status, start_at);
