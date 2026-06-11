/*
 * Costanti condivise dell'applicazione UniBook.
 *
 * Questo file contiene valori fissi usati in più punti del progetto.
 * L'obiettivo è evitare di riscrivere gli stessi valori dentro route,
 * service, repository o template.
 *
 * Per esempio, le categorie delle risorse e i limiti delle prenotazioni
 * vengono definiti qui e poi importati dagli altri file.
 *
 * In questo modo il progetto ha un'unica fonte di verità:
 * se un domani voglio cambiare una categoria, una capienza massima o un
 * limite di durata, so che il primo file da controllare è constants.js.
 *
 * Questo rende il codice più ordinato e più facile da mantenere 
 * perché le regole generali non sono sparse in punti diversi dell'applicazione.
 */

/*
 * Elenco delle categorie di risorse gestite da UniBook.
 *
 * Ogni oggetto contiene:
 *   - type: identificativo tecnico usato nel codice, nel database e nelle URL;
 *   - labelPlural: nome plurale mostrato nell'interfaccia;
 *   - labelSingular: nome singolare mostrato nell'interfaccia.
 *
 * Esempio:
 * type = 'aula' è il valore tecnico salvato nel database.
 * labelPlural = 'Aule' è il testo leggibile mostrato all'utente.
 *
 * Separare valore tecnico ed etichetta grafica è utile perché il codice
 * lavora con stringhe stabili e semplici, mentre l'interfaccia può mostrare
 * testi più chiari e leggibili.
 */
const RESOURCE_TYPES = [
  { type: 'aula',         labelPlural: 'Aule',         labelSingular: 'Aula' },
  { type: 'sala',         labelPlural: 'Sale',         labelSingular: 'Sala' },
  { type: 'laboratorio',  labelPlural: 'Laboratori',   labelSingular: 'Laboratorio' },
  { type: 'postazione',   labelPlural: 'Postazioni',   labelSingular: 'Postazione' },
  { type: 'attrezzatura', labelPlural: 'Attrezzature', labelSingular: 'Attrezzatura' },
];

/*
 * Lista dei soli identificativi tecnici delle categorie.
 *
 * Partendo da RESOURCE_TYPES, creo un array che contiene solo:
 * ['aula', 'sala', 'laboratorio', 'postazione', 'attrezzatura'].
 *
 * Questo array è utile nelle validazioni. Per esempio, quando arriva un
 * valore da un form o da una query string, il server può controllare se
 * quel valore appartiene davvero alle categorie ammesse.
 *
 * In pratica, TYPE_KEYS serve a rispondere alla domanda:
 * "Il tipo di risorsa ricevuto è uno di quelli consentiti?"
 */
const TYPE_KEYS = RESOURCE_TYPES.map((t) => t.type);

/*
 * Dizionario che collega ogni type alle sue informazioni complete.
 *
 * RESOURCE_TYPES è un array, quindi per cercare una categoria dovrei
 * scorrerlo. TYPE_META invece trasforma quell'array in un oggetto:
 *
 * {
 *   aula: { type: 'aula', labelPlural: 'Aule', labelSingular: 'Aula' },
 *   sala: { ... }
 * }
 *
 * Questo permette di recuperare rapidamente le etichette di una categoria
 * partendo dal valore tecnico salvato nel database.
 *
 * Esempio:
 * TYPE_META['aula'].labelPlural restituisce 'Aule'.
 */
const TYPE_META = Object.fromEntries(RESOURCE_TYPES.map((t) => [t.type, t]));

/*
 * Capienza massima consentita per una risorsa.
 *
 * Questo limite impedisce all'amministratore di inserire valori fuori scala,
 * per esempio una sala con milioni di posti.
 *
 * Il valore 1499 è un limite alto ma realistico per un contesto universitario:
 * può coprire grandi aule o auditorium, senza lasciare completamente libero
 * il campo capacity.
 *
 * Questo valore viene usato nella validazione server-side e deve rimanere
 * coerente con il vincolo definito nello schema del database.
 */
const MAX_CAPACITY = 1499;

/*
 * Vincoli L2 sulle prenotazioni.
 *
 * MIN_DURATION_MINUTES — durata minima di qualsiasi prenotazione.
 * Coincide con la granularità degli slot (30 minuti) per evitare la
 * prenotazione di una "fascia vuota": qualsiasi intervallo valido
 * occupa almeno uno slot pieno.
 *
 * MAX_DURATION_MINUTES_BY_TYPE — durata massima della singola
 * prenotazione, differenziata per categoria. Le aule e le sale, di
 * uso tipicamente collettivo e prenotabili per attività più lunghe,
 * ammettono fino a 5 ore. Laboratori, postazioni e attrezzature,
 * tipicamente d'uso più rotativo, sono limitati a 4 ore.
 *
 * MAX_DAILY_BOOKING_MINUTES_BY_TYPE — quanto un singolo utente può
 * cumulare in un giorno civile su tutte le proprie prenotazioni di
 * quella categoria (somma dei minuti delle confermate, prenotazione
 * in corso di creazione inclusa). Vincolo che impedisce a un utente
 * di "monopolizzare" troppe risorse di una stessa categoria.
 *
 * MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER — tetto globale al numero di
 * prenotazioni confermate con start_at futuro per uno stesso utente.
 * Si applica a tutte le categorie sommate.
 *
 * I valori vivono qui (e non nelle route o nel service) per essere
 * mostrati anche dalla "nota regole" sotto al form di prenotazione,
 * mantenendo un'unica fonte di verità fra validazione e UI.
 */
const MIN_DURATION_MINUTES = 30;

const MAX_DURATION_MINUTES_BY_TYPE = {
  aula: 300,
  sala: 300,
  laboratorio: 240,
  postazione: 240,
  attrezzatura: 240,
};

const MAX_DAILY_BOOKING_MINUTES_BY_TYPE = {
  aula: 600,
  sala: 600,
  laboratorio: 480,
  postazione: 480,
  attrezzatura: 480,
};

const MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER = 7;

/*
 * Esportazione delle costanti.
 *
 * module.exports rende questi valori disponibili agli altri file del progetto.
 * Per esempio, route e service possono importare categorie, limiti di durata
 * e capienza massima senza ridefinirli.
 *
 * Questo è il sistema CommonJS usato nel progetto per condividere dati tra file.
 */
module.exports = {
  RESOURCE_TYPES,
  TYPE_KEYS,
  TYPE_META,
  MAX_CAPACITY,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES_BY_TYPE,
  MAX_DAILY_BOOKING_MINUTES_BY_TYPE,
  MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER,
};


