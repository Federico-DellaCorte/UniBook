/*
 * Service di creazione delle prenotazioni.
 *
 * Questo file contiene la logica applicativa principale legata alla creazione
 * di una prenotazione. A differenza dei repository, che eseguono solo query
 * sul database, un service applica le regole del dominio: decide se una
 * prenotazione può essere creata oppure se deve essere rifiutata.
 *
 * In UniBook, una prenotazione non può essere salvata semplicemente con una
 * INSERT nel database. Prima bisogna controllare diversi vincoli:
 *   - la risorsa deve esistere;
 *   - la risorsa deve essere attiva;
 *   - la prenotazione deve restare nello stesso giorno logico;
 *   - il giorno scelto deve essere aperto nella disponibilità settimanale;
 *   - l'orario scelto deve rientrare nella finestra di apertura;
 *   - la durata deve rispettare minimo e massimo della categoria;
 *   - l'utente non deve superare il limite di prenotazioni future;
 *   - l'utente non deve superare il limite giornaliero di minuti;
 *   - l'utente non deve avere sovrapposizioni su altre risorse non-attrezzatura;
 *   - la risorsa deve avere capienza disponibile nell'intervallo richiesto.
 *
 * Tutti questi controlli vengono eseguiti lato server. Questo è fondamentale:
 * eventuali controlli lato client migliorano l'esperienza utente, ma non sono
 * sufficienti per proteggere i dati, perché il browser può essere manipolato.
 *
 * La creazione viene eseguita dentro una transazione SQLite con BEGIN IMMEDIATE.
 * Questo serve a evitare race condition: se due utenti provano a prenotare
 * contemporaneamente lo stesso ultimo posto disponibile, una richiesta viene
 * completata prima dell'altra e i controlli restano coerenti con l'inserimento.
 *
 * Gli errori di validazione vengono rappresentati con BookingValidationError.
 * In questo modo la route che chiama il service può distinguere gli errori
 * applicativi dagli errori tecnici e mostrare messaggi chiari nel form.
 */

const db = require('../db/connection');
const bookingRepo = require('../repositories/bookingRepo');
const resourceRepo = require('../repositories/resourceRepo');
const availabilityRepo = require('../repositories/resourceAvailabilityRepo');
const availabilityService = require('./availabilityService');
const dt = require('../helpers/dateTime');
const {
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES_BY_TYPE,
  MAX_DAILY_BOOKING_MINUTES_BY_TYPE,
  MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER,
  TYPE_META,
} = require('../constants');

/*
 * Errore specifico per prenotazioni non valide.
 *
 * Questa classe rappresenta un errore applicativo, non un errore tecnico.
 * Per esempio: risorsa chiusa, durata troppo lunga, capienza esaurita,
 * sovrapposizione con un'altra prenotazione.
 *
 * Ogni errore contiene:
 *   - code: identificativo tecnico del problema;
 *   - field: campo del form a cui associare l'errore, se esiste;
 *   - message: testo leggibile da mostrare all'utente.
 *
 * Questo permette alle rotte di gestire gli errori in modo ordinato, senza
 * dover interpretare stringhe o messaggi SQL.
 */
class BookingValidationError extends Error {
  constructor({ code, field = null, message }) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

/*
 * Errore mantenuto per compatibilità con vecchie parti del codice.
 *
 * La nuova logica usa BookingValidationError con codici più specifici, come
 * CAPACITY_FULL. Questa classe resta disponibile per eventuali chiamanti che
 * si aspettavano ancora un errore di tipo BOOKING_CONFLICT.
 */
class BookingConflictError extends BookingValidationError {
  constructor(message) {
    super({ code: 'BOOKING_CONFLICT', field: null, message });
    this.overlaps = [];
  }
}

/*
 * Calcola la durata in minuti tra inizio e fine prenotazione.
 *
 * Le prenotazioni di UniBook devono stare nello stesso giorno logico.
 * Il caso particolare è l'orario 24:00: nel database non viene salvato come
 * "YYYY-MM-DD 24:00", ma come "giorno successivo 00:00".
 *
 * Questa funzione gestisce quindi due casi:
 *   - inizio e fine nella stessa data;
 *   - fine normalizzata al giorno successivo alle 00:00, che rappresenta
 *     semanticamente le 24:00 del giorno di partenza.
 *
 * Restituisce la durata in minuti. Se l'intervallo non rispetta i casi previsti,
 * restituisce NaN.NaN significa Not-a-Number
 */
function diffMinutesSameDay(startAt, endAt) {
  const startTime = startAt.substring(11, 16);
  const startMin = dt.timeToMinutes(startTime);
  if (startAt.substring(0, 10) === endAt.substring(0, 10)) {
    const endMin = dt.timeToMinutes(endAt.substring(11, 16));
    return endMin - startMin;
  }
  if (dt.isSameLogicalDay(startAt, endAt)) {
    // end_at è "<giornoSuccessivo> 00:00", che semanticamente
    // rappresenta 24:00 del giorno di start_at = 1440 minuti.
    return 1440 - startMin;
  }
  return NaN;
}

/*
 * Alias locale dell'algoritmo di occupazione massima.
 *
 * computeMaxOccupancy calcola il picco massimo di prenotazioni contemporanee
 * dentro un intervallo. È importante per le risorse con capacity maggiore di 1:
 * non basta contare quante prenotazioni si sovrappongono, bisogna capire quante
 * sono contemporanee nello stesso istante.
 *
 * La funzione vera vive in availabilityService, così lo stesso algoritmo può
 * essere riutilizzato anche nella disponibilità pubblica e nelle API.
 */
const computeMaxOccupancy = availabilityService.computeMaxOccupancy;

/*
 * Helper per interrompere la creazione con un errore di validazione.
 *
 * Invece di ripetere ogni volta:
 *   throw new BookingValidationError(...)
 *
 * uso questa funzione per rendere il codice più leggibile.
 *
 * Quando un vincolo non è rispettato, il service lancia un errore tipizzato.
 * La route lo intercetta e mostra il messaggio nel form.
 */
function rejectValidation(code, field, message) {
  throw new BookingValidationError({ code, field, message });
}

/*
 * Crea una prenotazione dopo aver applicato tutti i controlli principali.
 *
 * Questa è la funzione centrale del file.
 *
 * Riceve:
 *   - user_id: utente che sta prenotando;
 *   - resource_id: risorsa richiesta;
 *   - start_at: data e ora di inizio;
 *   - end_at: data e ora di fine.
 *
 * La route che chiama questa funzione ha già controllato la forma base dei dati,
 * per esempio presenza della data, formato degli orari e ordine inizio/fine.
 *
 * Qui invece vengono controllate le regole applicative vere:
 * disponibilità, durata, limiti, sovrapposizioni e capienza.
 *
 * Tutto avviene dentro una transazione BEGIN IMMEDIATE. Questo significa che
 * il controllo e l'inserimento finale sono atomici: non può inserirsi un'altra
 * scrittura concorrente tra la verifica della disponibilità e la INSERT.
 *
 * Se tutti i controlli passano, viene creata la prenotazione e viene restituito
 * l'id della nuova prenotazione insieme alla risorsa.
 */
function createBookingWithConflictCheck({ user_id, resource_id, start_at, end_at }) {
  const txn = db.transaction((payload) => {
    const { uid, rid, sAt, eAt } = payload;

    // 1) Risorsa esistente e attiva. Letta dentro la transazione
    //    così che eventuali modifiche concorrenti (es. admin che
    //    disattiva la risorsa) vengano viste in modo consistente.
    const resource = resourceRepo.findById(rid);
    if (!resource) {
      rejectValidation('RESOURCE_NOT_FOUND', null, 'Risorsa non trovata.');
    }
    if (resource.active !== 1) {
      rejectValidation('RESOURCE_INACTIVE', null, 'Risorsa non disponibile per la prenotazione.');
    }
    const typeMeta = TYPE_META[resource.type];

    // 2) Stessa giornata logica per inizio e fine: niente
    //    prenotazioni che attraversano la mezzanotte. La regola
    //    accetta come "stessa giornata" anche il caso di end_at
    //    normalizzato a "<giornoSuccessivo> 00:00" (vedi
    //    dt.normalizeBookingEndAt), che corrisponde semanticamente
    //    a "fine giornata = 24:00".
    if (!dt.isSameLogicalDay(sAt, eAt)) {
      rejectValidation(
        'CROSS_MIDNIGHT',
        'endTime',
        'La prenotazione deve iniziare e terminare nello stesso giorno.'
      );
    }

    // 3) Disponibilità del giorno della settimana richiesto.
    const isoDate = sAt.substring(0, 10);
    const weekday = dt.weekdayFromIsoDate(isoDate);
    const dayAvailability = availabilityRepo.findOne(rid, weekday);
    if (!dayAvailability || dayAvailability.is_open !== 1) {
      rejectValidation(
        'DAY_CLOSED',
        'date',
        `La risorsa è chiusa di ${dt.weekdayNameLong(weekday).toLowerCase()}.`
      );
    }

    // 4. Controllo che l'orario richiesto rientri nella finestra di apertura.
    // Anche se il giorno è aperto, l'utente deve scegliere un intervallo compreso
    // tra opens_at e closes_at.
    const startTime = sAt.substring(11, 16);
    const endTimeForCheck = dt.endTimeDisplay(sAt, eAt);
    if (startTime < dayAvailability.opens_at) {
      rejectValidation(
        'OUT_OF_WINDOW_START',
        'startTime',
        `Il ${dt.weekdayNameLong(weekday).toLowerCase()} la risorsa apre alle ${dayAvailability.opens_at}.`
      );
    }
    if (endTimeForCheck > dayAvailability.closes_at) {
      rejectValidation(
        'OUT_OF_WINDOW_END',
        'endTime',
        `Il ${dt.weekdayNameLong(weekday).toLowerCase()} la risorsa chiude alle ${dayAvailability.closes_at}.`
      );
    }

    // 5. Controllo la durata minima e massima della prenotazione.
    // La durata minima è comune, mentre la durata massima cambia in base alla
    // categoria della risorsa.
    const duration = diffMinutesSameDay(sAt, eAt);
    if (duration < MIN_DURATION_MINUTES) {
      rejectValidation(
        'DURATION_TOO_SHORT',
        'endTime',
        `La durata minima di una prenotazione è di ${MIN_DURATION_MINUTES} minuti.`
      );
    }
    const maxDuration = MAX_DURATION_MINUTES_BY_TYPE[resource.type];
    if (maxDuration && duration > maxDuration) {
      const label = typeMeta ? typeMeta.labelSingular.toLowerCase() : resource.type;
      rejectValidation(
        'DURATION_TOO_LONG',
        'endTime',
        `Per le risorse di tipo ${label} la durata massima è ${maxDuration / 60} ore.`
      );
    }

    // 6) Tetto globale 7 prenotazioni future attive per utente.
    //    Calcolato PRIMA degli altri controlli "soft" così che, se
    //    l'utente è già saturo, il messaggio sia immediatamente
    //    chiaro e non venga confuso da altri errori secondari.
    const futureCount = bookingRepo.countActiveFutureByUser(uid);
    if (futureCount >= MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER) {
      rejectValidation(
        'FUTURE_LIMIT',
        null,
        `Hai già ${MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER} prenotazioni future attive: annullane qualcuna prima di crearne un'altra.`
      );
    }

    // 7. Controllo il limite giornaliero di minuti per categoria.
    // Sommo i minuti già prenotati dall'utente nello stesso giorno e nella stessa
    // categoria, poi aggiungo la durata della nuova prenotazione.
    const dayBookings = bookingRepo.findUserDayBookingsByType(uid, resource.type, isoDate);
    const minutesUsed = dayBookings.reduce(
      (acc, b) => acc + diffMinutesSameDay(b.start_at, b.end_at),
      0
    );
    const dailyLimit = MAX_DAILY_BOOKING_MINUTES_BY_TYPE[resource.type];
    if (dailyLimit && minutesUsed + duration > dailyLimit) {
      const label = typeMeta ? typeMeta.labelPlural.toLowerCase() : resource.type;
      const remaining = Math.max(0, dailyLimit - minutesUsed);
      rejectValidation(
        'DAILY_LIMIT',
        null,
        `Hai già usato ${minutesUsed} minuti di ${label} oggi e il limite è ${dailyLimit}: restano ${remaining} minuti disponibili.`
      );
    }

    // 8) Overlap utente fra risorse non-attrezzatura. Si applica
    //    solo quando la nuova prenotazione è anch'essa su una
    //    risorsa non-attrezzatura: le attrezzature sono jolly per
    //    l'utente e non triggherano il vincolo nemmeno quando
    //    sono loro a essere richieste.
    if (resource.type !== 'attrezzatura') {
      const userOverlaps = bookingRepo.findUserOverlapNonAttrezzatura(uid, sAt, eAt);
      if (userOverlaps.length > 0) {
        const ov = userOverlaps[0];
        rejectValidation(
          'USER_OVERLAP',
          null,
          `Hai già una prenotazione su "${ov.resource_name}" in questo intervallo: non puoi occupare due spazi/postazioni contemporaneamente.`
        );
      }
    }

    // 9. Controllo la capienza effettiva della risorsa.
    // Per capacity = 1 basta verificare se esiste una sovrapposizione.
    // Per capacity > 1 calcolo il picco massimo di occupazione contemporanea con
    // computeMaxOccupancy.
    const existingOverlaps = bookingRepo.findOverlapping(rid, sAt, eAt);
    if (resource.capacity <= 1) {
      // Caso semplice: una sola unità, qualunque overlap blocca.
      if (existingOverlaps.length > 0) {
        rejectValidation(
          'CAPACITY_FULL',
          null,
          'L\'intervallo selezionato si sovrappone a una prenotazione esistente. Scegli un altro orario.'
        );
      }
    } else {
      const maxOcc = computeMaxOccupancy(existingOverlaps, sAt, eAt);
      if (maxOcc + 1 > resource.capacity) {
        rejectValidation(
          'CAPACITY_FULL',
          null,
          `La risorsa è già occupata al massimo della capienza (${resource.capacity}) in parte dell'intervallo selezionato.`
        );
      }
    }

    // 10. Inserimento finale della prenotazione.
    // Se il codice arriva qui, tutti i vincoli sono stati superati e la INSERT può
    // essere eseguita in sicurezza dentro la stessa transazione.
    const id = bookingRepo.create({
      user_id: uid,
      resource_id: rid,
      start_at: sAt,
      end_at: eAt,
    });
    return { id, resource };
  });

/*
 * Esecuzione della transazione in modalità IMMEDIATE.
 *
 * BEGIN IMMEDIATE chiede a SQLite di acquisire subito il lock di scrittura.
 * Questo è importante perché la funzione prima legge lo stato del database
 * e poi inserisce una nuova prenotazione.
 *
 * Senza questa modalità, due richieste concorrenti potrebbero entrambe leggere
 * uno slot come disponibile e poi provare a inserirsi nello stesso intervallo.
 *
 * Con la transazione immediata, il blocco controllo + inserimento resta coerente.
 */
  return txn.immediate({ uid: user_id, rid: resource_id, sAt: start_at, eAt: end_at });
}

/*
 * Esportazione del service e degli errori tipizzati.
 *
 * Le route importano createBookingWithConflictCheck per creare prenotazioni.
 * Importano anche le classi di errore per distinguere una prenotazione rifiutata
 * per motivi applicativi da un errore tecnico inatteso.
 */
module.exports = {
  createBookingWithConflictCheck,
  BookingConflictError,
  BookingValidationError,
};
