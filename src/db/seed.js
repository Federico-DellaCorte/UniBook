/*
 * Popolamento del database con dati dimostrativi.
 *
 * Lo scopo del seed è offrire un ambiente di prova realistico ma
 * completamente riproducibile: dopo l'esecuzione l'applicazione
 * contiene gli utenti di test, un insieme variegato di risorse di
 * categorie diverse e alcune prenotazioni future, così è possibile
 * verificare immediatamente i flussi senza dover creare i dati a
 * mano dall'interfaccia.
 *
 * Lo script è idempotente. Prima di inserire i nuovi record svuota
 * le tre tabelle e reimposta i contatori di AUTOINCREMENT: in questo
 * modo ogni esecuzione produce esattamente lo stesso stato finale,
 * indipendentemente dal punto di partenza.
 *
 * Tutto il lavoro avviene all'interno di una singola transazione:
 * better-sqlite3 apre BEGIN, esegue il corpo e committa al termine.
 * Se durante l'esecuzione viene sollevato un errore, viene fatta una
 * ROLLBACK automatica e il database resta nello stato precedente,
 * evitando di lasciare il seed a metà.
 *
 * Le password degli utenti dimostrativi non vengono mai scritte in
 * chiaro: bcrypt produce un hash con salt incorporato e solo l'hash
 * finisce nella colonna users.password_hash. Il fattore di costo
 * (numero di round) è impostato a 10, valore di compromesso tipico
 * fra resistenza al brute force e velocità di esecuzione.
 */

const bcrypt = require('bcrypt');
const db = require('./connection');
const availabilityRepo = require('../repositories/resourceAvailabilityRepo');

const BCRYPT_COST = 10;

/*
 * Helper per costruire una data nel futuro a partire da oggi.
 *
 * Le prenotazioni dimostrative vengono ancorate alla data corrente
 * tramite questa funzione così da restare sempre nel futuro,
 * indipendentemente da quando viene rilanciato il seed: la
 * presentazione del progetto resta valida anche a distanza di
 * settimane o mesi dall'ultimo aggiornamento.
 * 
 *  La funzione riceve:
 *   - daysFromNow: quanti giorni aggiungere alla data di oggi;
 *   - hour: ora della prenotazione;
 *   - minute: minuti, con valore predefinito 0.
 *
 * Il risultato è formattato come stringa "YYYY-MM-DD HH:MM",
 * coerente con il tipo TEXT scelto nelle colonne bookings.start_at e
 * bookings.end_at.
 */
function futureDateTime(daysFromNow, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/*
 * Prepared statement usati per inserire utenti, risorse e prenotazioni.
 *
 * Un prepared statement è una query SQL preparata una volta e poi eseguita più
 * volte cambiando solo i valori dei placeholder ?.
 *
 * Anche se qui i dati sono interni al seed e non arrivano direttamente da un
 * utente, uso lo stesso stile del resto del progetto: niente concatenazione di
 * stringhe SQL e uso costante dei placeholder.
 *
 * Questo rende il codice più sicuro, più uniforme e più facile da spiegare.
 */
const insertUser = db.prepare(`
  INSERT INTO users (username, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`);

const insertResource = db.prepare(`
  INSERT INTO resources (name, type, capacity, location, description, active, opens_at, closes_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertBooking = db.prepare(`
  INSERT INTO bookings (user_id, resource_id, start_at, end_at, status)
  VALUES (?, ?, ?, ?, 'confirmed')
`);

/*
 * Svuota le tabelle principali prima di reinserire i dati demo.
 *
 * Questo serve a rendere il seed ripetibile: se lo eseguo più volte, non ottengo
 * duplicati, ma sempre lo stesso stato finale.
 *
 * Le tabelle vengono svuotate rispettando le relazioni tra dati:
 * prima vengono eliminate le prenotazioni, poi disponibilità, risorse e utenti.
 *
 * Infine viene ripulita sqlite_sequence, la tabella interna usata da SQLite per
 * ricordare il valore degli AUTOINCREMENT. Così gli id ripartono da 1 e il
 * database demo resta prevedibile.
 */
function clearAll() {
  // L'ordine di DELETE rispetta le dipendenze di foreign key:
  // bookings referenzia resources, resource_availability ha
  // ON DELETE CASCADE quindi viene ripulita automaticamente dal
  // DELETE su resources, ma la rimuoviamo esplicitamente in
  // anticipo per maggiore chiarezza.
  db.exec(`
    DELETE FROM bookings;
    DELETE FROM resource_availability;
    DELETE FROM resources;
    DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('users','resources','bookings','resource_availability');
  `);
}

/*
 * Costruisce le sette righe di disponibilità settimanale di una risorsa.
 *
 * Ogni argomento rappresenta un giorno della settimana:
 *   lunedì, martedì, mercoledì, giovedì, venerdì, sabato, domenica.
 *
 * Se passo una stringa come "08:00-22:00", quel giorno viene considerato aperto.
 * Se passo null, quel giorno viene considerato chiuso.
 *
 * La funzione restituisce un array di oggetti già pronto per essere inserito
 * nella tabella resource_availability.
 *
 * Questo evita di scrivere manualmente sette oggetti completi per ogni risorsa
 * e rende più leggibile la definizione delle disponibilità demo.
 */
function week(mon, tue, wed, thu, fri, sat, sun) {
  return [mon, tue, wed, thu, fri, sat, sun].map((spec, idx) => {
    if (!spec) {
      return { weekday: idx + 1, is_open: 0, opens_at: null, closes_at: null };
    }
    const [opens_at, closes_at] = spec.split('-');
    return { weekday: idx + 1, is_open: 1, opens_at, closes_at };
  });
}

/*
 * Utenti dimostrativi.
 *
 * Questi account permettono di provare subito il progetto dopo il seed.
 *
 * Sono presenti:
 *   - un amministratore, usato per testare l'area admin;
 *   - due utenti standard, usati per testare prenotazioni e area personale.
 *
 * L'admin viene creato qui perché la registrazione pubblica crea solo utenti
 * standard. In questo modo nessun utente può diventare amministratore dal form
 * di registrazione.
 */
const demoUsers = [
  { username: 'admin', email: 'admin@unibook.test', password: 'admin123', role: 'admin' },
  { username: 'mario', email: 'mario@unibook.test', password: 'mario123', role: 'user' },
  { username: 'lucia', email: 'lucia@unibook.test', password: 'lucia123', role: 'user' },
];

/*
 * Versione degli utenti demo con password hashata.
 *
 * Prima di inserire gli utenti nel database, le password in chiaro vengono
 * trasformate in hash bcrypt.
 *
 * Nel database finirà solo password_hash, non la password vera. Le password
 * in chiaro restano qui solo per permettere i test con credenziali note.
 */
const hashedUsers = demoUsers.map((u) => ({
  username: u.username,
  email: u.email,
  password_hash: bcrypt.hashSync(u.password, BCRYPT_COST),
  role: u.role,
}));

/*
 * Risorse dimostrative.
 *
 * Questo array contiene le risorse universitarie iniziali del progetto.
 * Sono volutamente distribuite su categorie diverse:
 *   - aule;
 *   - sale;
 *   - laboratori;
 *   - postazioni;
 *   - attrezzature.
 *
 * La varietà serve a provare filtri, ricerca, disponibilità, capienza e
 * gestione amministrativa.
 *
 * Ogni risorsa contiene dati realistici: nome, categoria, capienza, posizione,
 * descrizione e orari base di apertura/chiusura.
 *
 * Questi orari base non sostituiscono la tabella resource_availability, ma
 * aiutano a costruire dati demo coerenti.
 */
const demoResources = [
  // Aule studio: orari ampi, alcune leggermente differenziate
  {
    name: 'Aula Studio Leonardo',
    type: 'aula',
    capacity: 40,
    location: 'Edificio A, piano 1',
    description: 'Aula studio silenziosa con prese di corrente a ogni postazione.',
    opens_at: '08:00',
    closes_at: '22:00',
  },
  {
    name: 'Aula Studio Galilei',
    type: 'aula',
    capacity: 60,
    location: 'Edificio A, piano 2',
    description: 'Aula studio di grandi dimensioni, adatta al periodo di esami.',
    opens_at: '07:30',
    closes_at: '23:00',
  },
  {
    name: 'Aula Studio Fermi',
    type: 'aula',
    capacity: 30,
    location: 'Edificio B, piano 1',
    description: 'Aula studio con tavoli condivisi e Wi-Fi dedicato.',
    opens_at: '08:00',
    closes_at: '20:00',
  },
  {
    name: 'Aula Studio Montessori',
    type: 'aula',
    capacity: 25,
    location: 'Edificio B, piano 2',
    description: 'Aula studio raccolta, adatta a piccoli gruppi di studio.',
    opens_at: '09:00',
    closes_at: '19:00',
  },

  // Sale: orario d'ufficio
  {
    name: 'Sala Riunioni Volta',
    type: 'sala',
    capacity: 10,
    location: 'Edificio A, piano 2',
    description: 'Sala riunioni con schermo, adatta a lavori di gruppo.',
    opens_at: '09:00',
    closes_at: '18:00',
  },
  {
    name: 'Sala Progetti Olivetti',
    type: 'sala',
    capacity: 8,
    location: 'Edificio B, piano 1',
    description: 'Sala dedicata ai progetti di tesi, con lavagna e proiettore.',
    opens_at: '09:00',
    closes_at: '18:00',
  },
  {
    name: 'Sala Conferenze Marconi',
    type: 'sala',
    capacity: 80,
    location: 'Edificio A, piano terra',
    description: 'Sala conferenze con palco rialzato e impianto audio.',
    opens_at: '08:00',
    closes_at: '22:00',
  },

  // Laboratori: orari più stretti per attività con assistente
  {
    name: 'Laboratorio Informatica Turing',
    type: 'laboratorio',
    capacity: 25,
    location: 'Edificio B, piano terra',
    description: 'Laboratorio con 25 postazioni Linux/Windows e proiettore.',
    opens_at: '09:00',
    closes_at: '19:00',
  },
  {
    name: 'Laboratorio Multimediale Ada',
    type: 'laboratorio',
    capacity: 20,
    location: 'Edificio C, piano 1',
    description: 'Laboratorio per editing audio e video con software professionale.',
    opens_at: '10:00',
    closes_at: '18:00',
  },
  {
    name: 'Laboratorio Elettronica Meucci',
    type: 'laboratorio',
    capacity: 16,
    location: 'Edificio C, piano 2',
    description: 'Laboratorio di elettronica con banchi di misura e oscilloscopi.',
    opens_at: '09:00',
    closes_at: '17:30',
  },

  // Postazioni singole: orario biblioteca
  {
    name: 'Postazione PC 01',
    type: 'postazione',
    capacity: 1,
    location: 'Biblioteca, area silenzio',
    description: 'Postazione singola con monitor 24 pollici.',
    opens_at: '08:00',
    closes_at: '22:00',
  },
  {
    name: 'Postazione PC 02',
    type: 'postazione',
    capacity: 1,
    location: 'Biblioteca, area silenzio',
    description: 'Postazione singola con monitor 24 pollici.',
    opens_at: '08:00',
    closes_at: '22:00',
  },
  {
    name: 'Postazione PC CAD 01',
    type: 'postazione',
    capacity: 1,
    location: 'Laboratorio CAD, Edificio C',
    description: 'Postazione con software CAD installato e mouse 3D.',
    opens_at: '09:00',
    closes_at: '19:00',
  },
  {
    name: 'Postazione PC Grafica 01',
    type: 'postazione',
    capacity: 1,
    location: 'Laboratorio Grafica, Edificio C',
    description: 'Postazione con tablet grafico e suite di editing.',
    opens_at: '09:00',
    closes_at: '19:00',
  },

  // Attrezzature prestabili: orario dello sportello prestiti
  {
    name: 'Proiettore Portatile',
    type: 'attrezzatura',
    capacity: 1,
    location: 'Sportello prestiti, Biblioteca',
    description: 'Proiettore HDMI portatile con custodia da trasporto.',
    opens_at: '09:00',
    closes_at: '17:00',
  },
  {
    name: 'Kit Videoconferenza',
    type: 'attrezzatura',
    capacity: 1,
    location: 'Sportello prestiti, Biblioteca',
    description: 'Webcam, microfono direzionale e treppiede per chiamate online.',
    opens_at: '09:00',
    closes_at: '17:00',
  },
  {
    name: 'Lavagna Interattiva Mobile',
    type: 'attrezzatura',
    capacity: 1,
    location: 'Magazzino Edificio A',
    description: 'Lavagna interattiva su ruote, completa di cavi e telecomando.',
    opens_at: '09:00',
    closes_at: '17:00',
  },
  {
    name: 'Tablet Grafico',
    type: 'attrezzatura',
    capacity: 1,
    location: 'Sportello prestiti, Biblioteca',
    description: 'Tablet grafico professionale con penna sensibile alla pressione.',
    opens_at: '09:00',
    closes_at: '17:00',
  },
];

/*
 * Disponibilità settimanali dimostrative.
 *
 * Questa struttura collega ogni risorsa alle sue aperture settimanali.
 *
 * La chiave dell'oggetto è il nome della risorsa, mentre il valore è il risultato
 * della funzione week(), cioè un array di sette giorni.
 *
 * Le disponibilità non sono tutte uguali: alcune risorse sono aperte anche il
 * sabato, altre solo nei giorni feriali, altre hanno orari ridotti.
 *
 * Questo serve a dimostrare che UniBook non usa un unico orario globale, ma può
 * gestire disponibilità diverse per ogni singola risorsa.
 */
const demoAvailability = {
  // Aule studio
  'Aula Studio Leonardo':    week('08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','08:00-18:00', null),
  'Aula Studio Galilei':     week('07:30-23:00','07:30-23:00','07:30-23:00','07:30-23:00','07:30-23:00','08:00-20:00','08:00-20:00'),
  'Aula Studio Fermi':       week('08:00-20:00','08:00-20:00','08:00-20:00','08:00-20:00','08:00-20:00', null, null),
  'Aula Studio Montessori':  week('09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00', null, null),

  // Sale: tipicamente orario d'ufficio, alcune diversificate
  'Sala Riunioni Volta':     week('09:00-18:00','09:00-18:00','09:00-18:00','09:00-18:00','09:00-18:00', null, null),
  'Sala Progetti Olivetti':  week('09:00-18:00','09:00-18:00', null,        '09:00-18:00','09:00-18:00', null, null),
  'Sala Conferenze Marconi': week('08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','10:00-18:00', null),

  // Laboratori: chiusi nel weekend, orari ridotti in alcuni giorni
  'Laboratorio Informatica Turing': week('09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00', null, null),
  'Laboratorio Multimediale Ada':   week('10:00-18:00','10:00-18:00','10:00-18:00','10:00-18:00','10:00-18:00', null, null),
  'Laboratorio Elettronica Meucci': week('09:00-17:30','09:00-17:30','09:00-17:30','09:00-17:30','09:00-17:30', null, null),

  // Postazioni: PC biblioteca aperti anche il sabato, postazioni
  // specializzate solo nei feriali
  'Postazione PC 01':         week('08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','10:00-18:00', null),
  'Postazione PC 02':         week('08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','08:00-22:00','10:00-18:00', null),
  'Postazione PC CAD 01':     week('09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00', null, null),
  'Postazione PC Grafica 01': week('09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00','09:00-19:00', null, null),

  // Attrezzature: orario sportello prestiti, alcune con orari ridotti
  'Proiettore Portatile':       week('09:00-17:00','09:00-17:00','09:00-17:00','09:00-17:00','09:00-17:00', null, null),
  'Kit Videoconferenza':        week('09:00-17:00','09:00-17:00','09:00-17:00','09:00-17:00','09:00-17:00', null, null),
  'Lavagna Interattiva Mobile': week('09:00-17:00','09:00-17:00', null,        '09:00-17:00','16:00-19:00', null, null),
  'Tablet Grafico':             week('09:00-17:00','09:00-17:00','09:00-17:00','09:00-17:00','09:00-17:00', null, null),
};

/*
 * Transazione principale del seed.
 *
 * db.transaction() crea una funzione che esegue tutte le operazioni dentro una
 * transazione SQLite.
 *
 * Questo è importante perché il seed contiene molte operazioni collegate:
 * cancellazione dei vecchi dati, inserimento utenti, inserimento risorse,
 * inserimento disponibilità e inserimento prenotazioni.
 *
 * Se una di queste operazioni fallisse, la transazione annullerebbe tutto,
 * evitando di lasciare il database in uno stato incompleto.
 */
const runSeed = db.transaction(() => {
  clearAll();

  // Inserisce gli utenti e raccoglie gli id assegnati in una mappa
  // username -> id, così le prenotazioni dimostrative possono
  // riferirsi agli utenti per nome senza dipendere dal valore
  // esatto degli id generati dall'AUTOINCREMENT.
  const userIds = {};
  for (const u of hashedUsers) {
    const info = insertUser.run(u.username, u.email, u.password_hash, u.role);
    userIds[u.username] = info.lastInsertRowid;
  }

  // Stessa logica per le risorse: una mappa nome -> id rende
  // leggibili le prenotazioni dimostrative qui sotto.
  const resourceIds = {};
  for (const r of demoResources) {
    const info = insertResource.run(
      r.name,
      r.type,
      r.capacity,
      r.location,
      r.description,
      1,
      r.opens_at,
      r.closes_at
    );
    resourceIds[r.name] = info.lastInsertRowid;

    // Inseriamo subito anche le sette righe di disponibilità
    // settimanale. La transazione esterna garantisce che, in caso
    // di errore in un punto qualunque, il database resti nello
    // stato precedente.
    const availability = demoAvailability[r.name];
    if (availability) {
      availabilityRepo.replaceForResource(info.lastInsertRowid, availability);
    }
  }

/*
 * Prenotazioni dimostrative.
 *
 * Queste prenotazioni permettono di provare subito:
 *   - la vista "Le mie prenotazioni";
 *   - la vista calendario;
 *   - lo storico;
 *   - il controllo dei conflitti;
 *   - l'export .ics.
 *
 * Le date vengono calcolate con futureDateTime(), quindi restano sempre future
 * rispetto al giorno in cui viene rilanciato il seed.
 *
 * Le prenotazioni sono distribuite su utenti, risorse e orari diversi per
 * offrire una base demo realistica.
 */
  const demoBookings = [
    // Domani: mattina in aula studio, pomeriggio in laboratorio
    {
      user: 'mario',
      resource: 'Aula Studio Leonardo',
      start: futureDateTime(1, 9, 0),
      end: futureDateTime(1, 11, 0),
    },
    {
      user: 'lucia',
      resource: 'Laboratorio Informatica Turing',
      start: futureDateTime(1, 14, 0),
      end: futureDateTime(1, 16, 0),
    },

    // Dopodomani: sala riunioni al mattino, aula studio nel pomeriggio
    {
      user: 'lucia',
      resource: 'Sala Riunioni Volta',
      start: futureDateTime(2, 10, 0),
      end: futureDateTime(2, 12, 0),
    },
    {
      user: 'mario',
      resource: 'Aula Studio Galilei',
      start: futureDateTime(2, 15, 0),
      end: futureDateTime(2, 17, 0),
    },

    // Fra tre giorni: postazione CAD al mattino, proiettore nel pomeriggio
    {
      user: 'mario',
      resource: 'Postazione PC CAD 01',
      start: futureDateTime(3, 9, 0),
      end: futureDateTime(3, 12, 0),
    },
    {
      user: 'lucia',
      resource: 'Proiettore Portatile',
      start: futureDateTime(3, 14, 0),
      end: futureDateTime(3, 16, 0),
    },

    // Fra quattro giorni: laboratorio multimediale
    {
      user: 'mario',
      resource: 'Laboratorio Multimediale Ada',
      start: futureDateTime(4, 10, 0),
      end: futureDateTime(4, 13, 0),
    },
  ];

  for (const b of demoBookings) {
    insertBooking.run(userIds[b.user], resourceIds[b.resource], b.start, b.end);
  }
});

/*
 * Esecuzione effettiva del seed.
 *
 * Dopo questa chiamata il database contiene utenti, risorse, disponibilità e
 * prenotazioni demo.
 *
 * I messaggi in console servono solo come conferma per chi esegue il comando:
 * indicano quanti record dimostrativi sono stati inseriti.
 */
runSeed();

console.log('Seed completato:');
console.log(`  utenti dimostrativi:       ${demoUsers.length}`);
console.log(`  risorse dimostrative:      ${demoResources.length}`);
console.log(`  prenotazioni dimostrative: 7 (date dinamiche a partire da oggi)`);
