/*
 * Service di supporto per la disponibilità settimanale delle risorse.
 *
 * Questo file contiene la logica usata dall'area admin per costruire, validare
 * e confrontare la disponibilità settimanale di una risorsa.
 *
 * La disponibilità settimanale è composta da 7 righe, una per ogni giorno:
 *   - 1 = lunedì;
 *   - 2 = martedì;
 *   - ...
 *   - 7 = domenica.
 *
 * Ogni giorno può essere aperto oppure chiuso. Se è aperto, deve avere un orario
 * di apertura e un orario di chiusura validi.
 *
 * Questo service viene usato soprattutto da admin.resources.routes.js quando
 * l'amministratore crea o modifica una risorsa.
 *
 * Le sue responsabilità principali sono:
 *   - costruire una settimana di default per una nuova risorsa;
 *   - leggere dal form i campi day1_open, day1_opens_at, day1_closes_at, ecc.;
 *   - validare gli orari inseriti dall'admin;
 *   - trasformare i dati del form in righe adatte al repository;
 *   - individuare prenotazioni future che diventano incompatibili con una nuova
 *     disponibilità.
 *
 * Tenere questa logica in un service evita di appesantire le rotte admin con
 * controlli ripetuti sui sette giorni della settimana.
 */

const dt = require('../helpers/dateTime');
const bookingRepo = require('../repositories/bookingRepo');

/*
 * Costruisce la disponibilità settimanale di default.
 *
 * Viene usata quando l'admin apre il form per creare una nuova risorsa.
 *
 * La regola iniziale è:
 *   - lunedì-venerdì aperto 08:00-22:00;
 *   - sabato e domenica chiusi.
 *
 * Il risultato è un array di 7 oggetti, già pronto per essere mostrato nel form.
 * L'admin può poi modificare manualmente giorni e orari prima di salvare.
 */
function buildDefaultWeek() {
  const rows = [];
  for (let w = 1; w <= 5; w++) {
    rows.push({ weekday: w, is_open: true, opens_at: '08:00', closes_at: '22:00' });
  }
  rows.push({ weekday: 6, is_open: false, opens_at: '', closes_at: '' });
  rows.push({ weekday: 7, is_open: false, opens_at: '', closes_at: '' });
  return rows;
}

/*
 * Legge dal form admin la disponibilità settimanale.
 *
 * Il form invia campi ripetuti per ciascun giorno:
 *   - day1_open;
 *   - day1_opens_at;
 *   - day1_closes_at;
 *   - ...
 *   - day7_open;
 *   - day7_opens_at;
 *   - day7_closes_at.
 *
 * I checkbox HTML non selezionati non arrivano nel body della richiesta.
 * Per questo la presenza del campo day{n}_open indica che quel giorno è aperto.
 *
 * La funzione restituisce sempre 7 righe, una per ogni giorno della settimana.
 *
 * Gli orari vengono conservati anche per i giorni chiusi, così se il form ha
 * errori di validazione posso ripresentarlo all'admin senza perdere i valori
 * inseriti. Sarà poi toRepositoryRows() a trasformare gli orari dei giorni
 * chiusi in null prima del salvataggio nel database.
 */
function parseWeeklyAvailabilityFromBody(body) {
  const rows = [];
  for (let w = 1; w <= 7; w++) {
    const isOpen = Boolean(body[`day${w}_open`]);
    const opensAt = (body[`day${w}_opens_at`] || '').trim();
    const closesAt = (body[`day${w}_closes_at`] || '').trim();
    rows.push({
      weekday: w,
      is_open: isOpen,
      opens_at: opensAt,
      closes_at: closesAt,
    });
  }
  return rows;
}

/*
 * Valida le 7 righe di disponibilità settimanale.
 *
 * Per ogni giorno aperto controlla:
 *   - che l'orario di apertura sia presente;
 *   - che l'orario di apertura sia uno slot valido di inizio;
 *   - che l'orario di chiusura sia presente;
 *   - che l'orario di chiusura sia uno slot valido di fine;
 *   - che la chiusura sia successiva all'apertura.
 *
 * Gli slot seguono la stessa convenzione usata nelle prenotazioni:
 *   - apertura: da 00:00 a 23:30;
 *   - chiusura: da 00:30 a 24:00.
 *
 * 24:00 è ammesso solo come orario di chiusura, perché rappresenta la fine
 * della giornata.
 *
 * I giorni chiusi non richiedono orari validi.
 *
 * Gli errori vengono restituiti in un oggetto con chiavi uguali ai name dei
 * campi del form, per esempio day1_opens_at o day3_closes_at. Questo permette
 * al template di mostrare l'errore vicino al campo corretto.
 *
 * Se tutti i giorni sono chiusi, viene aggiunto errors._general: una risorsa
 * completamente chiusa non avrebbe senso nel sistema.
 */
function validateWeeklyAvailability(rows) {
  // errors raccoglie i messaggi da mostrare nel form.
  // anyOpen serve a verificare che almeno un giorno della settimana sia aperto.
  const errors = {};
  let anyOpen = false;

  for (const r of rows) {
    // I giorni chiusi non devono avere obbligatoriamente orari validi.
    if (!r.is_open) continue;
    anyOpen = true;

    // Apertura: solo slot "inizio" (00:00..23:30). Per uniformità con
    // la prenotazione utente, 24:00 NON è ammesso come apertura.
    // Chiusura: slot "fine" (00:30..23:30 o 24:00). 24:00 rappresenta
    // la fine giornata ed è ammesso solo come chiusura.
    const opensValid = dt.isValidStartSlot(r.opens_at);
    const closesValid = dt.isValidEndSlot(r.closes_at);

    if (!r.opens_at) {
      errors[`day${r.weekday}_opens_at`] = 'Orario di apertura obbligatorio.';
    } else if (!opensValid) {
      errors[`day${r.weekday}_opens_at`] = r.opens_at === '24:00'
        ? "24:00 non è ammesso come orario di apertura."
        : 'Slot non valido (00:00–23:30 a passi di 30 minuti).';
    }

    if (!r.closes_at) {
      errors[`day${r.weekday}_closes_at`] = 'Orario di chiusura obbligatorio.';
    } else if (!closesValid) {
      errors[`day${r.weekday}_closes_at`] = 'Slot non valido (00:30–24:00 a passi di 30 minuti).';
    }

    // Confronto in minuti del giorno: 24:00 = 1440 è correttamente
    // maggiore di qualunque apertura ammessa.
    if (opensValid && closesValid &&
        dt.timeToMinutes(r.opens_at) >= dt.timeToMinutes(r.closes_at)) {
      errors[`day${r.weekday}_closes_at`] = 'La chiusura deve essere dopo l\'apertura.';
    }
  }

  if (!anyOpen) {
    // Una risorsa con tutti i giorni chiusi non avrebbe senso: la
    // segnaliamo con un errore generale che le route possono
    // mostrare in un callout sopra il blocco di disponibilità.
    errors._general = 'La risorsa deve essere aperta almeno in un giorno della settimana.';
  }

  return errors;
}

/*
 * Trasforma le righe del form in righe pronte per il repository.
 *
 * Nel form manteniamo opens_at e closes_at anche per i giorni chiusi, perché
 * servono a ripopolare i campi se ci sono errori.
 *
 * Nel database, invece, un giorno chiuso deve avere:
 *   - is_open = 0;
 *   - opens_at = null;
 *   - closes_at = null.
 *
 * Questa funzione fa quindi la conversione finale prima del salvataggio nella
 * tabella resource_availability.
 */
function toRepositoryRows(rows) {
  return rows.map((r) => ({
    weekday: r.weekday,
    is_open: r.is_open,
    opens_at: r.is_open ? r.opens_at : null,
    closes_at: r.is_open ? r.closes_at : null,
  }));
}

/*
 * Trova le prenotazioni future che diventerebbero incompatibili.
 *
 * Questa funzione viene usata quando l'admin modifica la disponibilità
 * settimanale di una risorsa.
 *
 * Il problema è questo: una risorsa può avere già prenotazioni future confermate.
 * Se l'admin cambia giorni o orari di apertura, alcune di quelle prenotazioni
 * potrebbero non essere più valide.
 *
 * Una prenotazione futura viene considerata incompatibile se, con la nuova
 * disponibilità:
 *   - cade in un giorno che ora risulta chiuso;
 *   - inizia prima del nuovo orario di apertura;
 *   - finisce dopo il nuovo orario di chiusura.
 *
 * La funzione restituisce le prenotazioni incompatibili, aggiungendo anche un
 * campo reason:
 *   - day_closed;
 *   - out_of_window.
 *
 * Queste informazioni vengono poi usate nella pagina di conferma admin, così
 * l'amministratore vede quali prenotazioni saranno annullate e perché.
 */
function findIncompatibleFutureBookings(resourceId, weekRows) {
  // Creo una mappa weekday -> regola del giorno, così posso recuperare rapidamente
  // la nuova disponibilità del giorno in cui cade ogni prenotazione.
  const byWeekday = new Map();
  for (const r of weekRows) {
    byWeekday.set(r.weekday, r);
  }

  // Recupero solo prenotazioni future confermate: quelle passate o già annullate
  // non devono essere rivalutate.
  const future = bookingRepo.findFutureConfirmedByResource(resourceId);
  const incompatibles = [];
  for (const b of future) {
    const isoDate = b.start_at.substring(0, 10);
    const startTime = b.start_at.substring(11, 16);
    // Recupero l'ora di fine visibile all'utente: se nel DB è salvata come
    // giorno successivo 00:00, qui torna a essere 24:00.
    const endTime = dt.endTimeDisplay(b.start_at, b.end_at);
    const weekday = dt.weekdayFromIsoDate(isoDate);
    const dayRule = byWeekday.get(weekday);
    // Se il nuovo calendario chiude quel giorno, la prenotazione diventa incompatibile.
    if (!dayRule || !dayRule.is_open) {
      incompatibles.push({ ...b, reason: 'day_closed' });
      continue;
    }
    // Se l'orario della prenotazione esce dalla nuova finestra di apertura,
    // la prenotazione deve essere segnalata come incompatibile.
    if (startTime < dayRule.opens_at || endTime > dayRule.closes_at) {
      incompatibles.push({ ...b, reason: 'out_of_window' });
    }
  }
  return incompatibles;
}

/*
 * Esportazione delle funzioni del service.
 *
 * Le rotte admin usano queste funzioni per costruire, validare, salvare e
 * confrontare la disponibilità settimanale delle risorse senza duplicare la
 * stessa logica dentro admin.resources.routes.js.
 */
module.exports = {
  buildDefaultWeek,
  parseWeeklyAvailabilityFromBody,
  validateWeeklyAvailability,
  toRepositoryRows,
  findIncompatibleFutureBookings,
};
