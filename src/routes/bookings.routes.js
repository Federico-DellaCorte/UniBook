/*
 * Rotte delle prenotazioni lato utente.
 *
 * Questo file gestisce tutte le operazioni che un utente autenticato può fare
 * sulle proprie prenotazioni.
 *
 * Le rotte principali sono:
 *   - GET  /bookings/new       mostra il form per prenotare una risorsa;
 *   - POST /bookings           riceve il form e prova a creare la prenotazione;
 *   - GET  /bookings/mine      mostra le prenotazioni dell'utente;
 *   - POST /bookings/:id/cancel annulla una prenotazione futura;
 *   - GET  /bookings/:id/ics   esporta una prenotazione futura in formato .ics.
 *
 * Questa route non contiene da sola tutta la logica delle prenotazioni.
 * La sua responsabilità principale è ricevere la richiesta HTTP, leggere i dati
 * del form, fare le prime validazioni di forma e poi delegare la logica più
 * importante al bookingService.
 *
 * In particolare:
 *   - la route controlla che data e orari siano presenti e nel formato corretto;
 *   - bookingService controlla disponibilità, durata, limiti, conflitti,
 *     capienza e transazione;
 *   - bookingRepo legge o aggiorna le prenotazioni nel database;
 *   - icsService genera il file calendario .ics.
 *
 * Tutte le rotte sotto /bookings sono protette da requireAuth: un utente deve
 * essere autenticato per creare, vedere, cancellare o esportare prenotazioni.
 */

const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const resourceRepo = require('../repositories/resourceRepo');
const availabilityRepo = require('../repositories/resourceAvailabilityRepo');
const bookingRepo = require('../repositories/bookingRepo');
const bookingService = require('../services/bookingService');
const icsService = require('../services/icsService');
const {
  TYPE_META,
  MIN_DURATION_MINUTES,
  MAX_DURATION_MINUTES_BY_TYPE,
  MAX_DAILY_BOOKING_MINUTES_BY_TYPE,
  MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER,
} = require('../constants');
const dt = require('../helpers/dateTime');

const router = express.Router();
/*
 * Protezione di tutte le rotte /bookings.
 *
 * Questo router è montato senza prefisso in server.js, quindi qui proteggiamo
 * solo gli URL che iniziano con /bookings.
 *
 * In questo modo tutte le funzionalità di prenotazione richiedono il login,
 * ma eventuali URL inesistenti fuori da /bookings possono ancora arrivare al
 * gestore 404 generale di server.js.
 */
router.use('/bookings', requireAuth);

/*
 * Prepara le regole da mostrare sotto al form di prenotazione.
 *
 * Ogni categoria di risorsa può avere limiti diversi: durata massima,
 * limite giornaliero, capienza e numero massimo di prenotazioni future.
 *
 * Questa funzione raccoglie quei valori e li trasforma in un oggetto comodo
 * per il template. Così la pagina può mostrare all'utente una nota chiara sulle
 * regole applicate alla risorsa scelta.
 *
 * La funzione non decide se una prenotazione è valida: prepara solo informazioni
 * descrittive per l'interfaccia.
 */
function buildRulesNote(resource) {
  const meta = TYPE_META[resource.type];
  const maxDur = MAX_DURATION_MINUTES_BY_TYPE[resource.type];
  const maxDaily = MAX_DAILY_BOOKING_MINUTES_BY_TYPE[resource.type];
  return {
    minDurationMinutes: MIN_DURATION_MINUTES,
    maxDurationHours: maxDur ? maxDur / 60 : null,
    maxDailyHours: maxDaily ? maxDaily / 60 : null,
    maxFutureBookings: MAX_ACTIVE_FUTURE_BOOKINGS_PER_USER,
    typeLabelPlural: meta ? meta.labelPlural.toLowerCase() : resource.type,
    typeLabelSingular: meta ? meta.labelSingular.toLowerCase() : resource.type,
    capacity: resource.capacity,
  };
}

/*
 * Arricchisce una prenotazione con dati pronti per la vista.
 *
 * Il database salva le prenotazioni in formato tecnico, per esempio con start_at,
 * end_at, status e resource_type. Il template, però, ha bisogno di informazioni
 * più leggibili: data italiana, ora di inizio, ora di fine, etichetta dello stato
 * e possibilità di cancellazione.
 *
 * Questa funzione trasforma quindi una prenotazione grezza in un oggetto più
 * adatto alla visualizzazione.
 *
 * Lo stato visibile viene calcolato così:
 *   - cancelled  -> "Annullata";
 *   - passata    -> "Conclusa";
 *   - futura     -> "Confermata".
 *
 * La prenotazione è cancellabile solo se non è annullata e non è già passata.
 */
function decorateBooking(b, nowIso) {
  const cancelled = b.status === 'cancelled';
  const past = b.start_at < nowIso;
  let statusKey;
  let statusLabel;
  if (cancelled) {
    statusKey = 'cancelled';
    statusLabel = 'Annullata';
  } else if (past) {
    statusKey = 'past';
    statusLabel = 'Conclusa';
  } else {
    statusKey = 'active';
    statusLabel = 'Confermata';
  }

  const meta = TYPE_META[b.resource_type];
  return {
    ...b,
    date_label: dt.formatItalianDate(b.start_at),
    start_time: dt.extractTime(b.start_at),
    // end_time può essere "24:00" quando la prenotazione finisce
    // esattamente a mezzanotte (caso normalizzato in DB come
    // <giornoSuccessivo> 00:00). Vedi dt.endTimeDisplay per il
    // ragionamento completo.
    end_time: dt.endTimeDisplay(b.start_at, b.end_at),
    typeLabel: meta ? meta.labelSingular : b.resource_type,
    statusKey,
    statusLabel,
    cancellable: !cancelled && !past,
  };
}

/*
 * Prepara il contesto di disponibilità per il form di prenotazione.
 *
 * Quando l'utente prenota una risorsa, il form deve sapere:
 *   - quali sono i giorni di apertura della risorsa;
 *   - quali slot di inizio sono ammessi nel giorno selezionato;
 *   - quali slot di fine sono ammessi;
 *   - se il giorno selezionato è chiuso.
 *
 * Questa funzione costruisce questi dati partendo dalla disponibilità settimanale
 * salvata nel database.
 *
 * Distingue startSlots ed endSlots perché 24:00 è ammesso solo come ora di fine,
 * non come ora di inizio.
 *
 * availabilityJson viene poi usato dal JavaScript lato client per aggiornare
 * dinamicamente il form quando l'utente cambia data.
 */
function buildAvailabilityContext(resource, isoDate) {
  const availabilityRows = availabilityRepo.findByResourceId(resource.id);
  const availability = availabilityRows.map((r) => ({
    weekday: r.weekday,
    dayName: dt.weekdayNameLong(r.weekday),
    is_open: r.is_open === 1,
    opens_at: r.opens_at,
    closes_at: r.closes_at,
  }));

  let dayAvailability = null;
  if (isoDate && dt.isValidIsoDate(isoDate)) {
    const wd = dt.weekdayFromIsoDate(isoDate);
    dayAvailability = availabilityRows.find((r) => r.weekday === wd) || null;
  }
  // Distinguere "slot inizio" da "slot fine" è il prerequisito per
  // rendere 24:00 un'opzione di fine sostenibile in tutta l'app:
  // il select start non lo include mai, il select end sì se la
  // risorsa chiude alle 24:00.
  const startSlots = dayAvailability && dayAvailability.is_open === 1
    ? dt.generateStartSlots(dayAvailability.opens_at, dayAvailability.closes_at)
    : [];
  const endSlots = dayAvailability && dayAvailability.is_open === 1
    ? dt.generateEndSlots(dayAvailability.opens_at, dayAvailability.closes_at)
    : [];
  const closedMessage = dayAvailability && dayAvailability.is_open !== 1
    ? `Risorsa chiusa di ${dt.weekdayNameLong(dayAvailability.weekday).toLowerCase()}.`
    : '';

  return { availability, startSlots, endSlots, closedMessage };
}

/* 
 * GET /bookings/new
 *
 * Mostra il form per creare una nuova prenotazione.
 *
 * La rotta riceve l'id della risorsa tramite query string:
 *
 *   /bookings/new?resourceId=3
 *
 * Prima controlla che l'id sia valido, poi verifica che la risorsa esista e sia
 * attiva. Se la risorsa non è valida o non è prenotabile, l'utente viene
 * rimandato all'elenco delle risorse con un messaggio flash.
 *
 * Se tutto è corretto, la rotta prepara disponibilità, slot orari, data minima,
 * regole della risorsa e renderizza il template del form.
 */
router.get('/bookings/new', (req, res) => {
  const resourceId = Number.parseInt(req.query.resourceId, 10);
  if (!Number.isInteger(resourceId) || resourceId < 1) {
    req.flash('error', 'Risorsa non specificata o non valida.');
    return res.redirect('/resources');
  }

  const resource = resourceRepo.findById(resourceId);
  if (!resource || resource.active !== 1) {
    req.flash('error', 'Risorsa non disponibile per la prenotazione.');
    return res.redirect('/resources');
  }

  const meta = TYPE_META[resource.type];
  const today = dt.todayIsoDate();
  const { availability, startSlots, endSlots, closedMessage } = buildAvailabilityContext(resource, today);

  res.render('pages/bookings/new', {
    title: `Prenota · ${resource.name} · UniBook`,
    resource,
    typeLabel: meta ? meta.labelSingular : resource.type,
    availability,
    availabilityJson: JSON.stringify(availability),
    startSlots,
    endSlots,
    closedMessage,
    minDate: today,
    values: { date: today },
    errors: {},
    rules: buildRulesNote(resource),
  });
});

/* 
 * POST /bookings
 *
 * Gestisce l'invio del form di prenotazione.
 *
 * Questa rotta fa le validazioni di forma:
 *   - id risorsa valido;
 *   - data presente e valida;
 *   - ora di inizio presente e su slot corretto;
 *   - ora di fine presente e su slot corretto;
 *   - ora fine successiva all'ora inizio;
 *   - prenotazione collocata nel futuro.
 *
 * Le regole applicative più complesse non vengono gestite qui, ma nel
 * bookingService:
 *   - disponibilità del giorno;
 *   - finestra di apertura;
 *   - durata massima;
 *   - limiti utente;
 *   - sovrapposizioni;
 *   - capienza;
 *   - transazione BEGIN IMMEDIATE.
 *
 * Se la creazione riesce, l'utente viene reindirizzato a /bookings/mine con
 * un messaggio flash di successo.
 *
 * Se ci sono errori, il form viene mostrato di nuovo con i valori già inseriti
 * e i messaggi di errore.
 */
router.post('/bookings', (req, res) => {
  const resourceId = Number.parseInt(req.body.resourceId, 10);
  const date = (req.body.date || '').trim();
  const startTime = (req.body.startTime || '').trim();
  const endTime = (req.body.endTime || '').trim();

  if (!Number.isInteger(resourceId) || resourceId < 1) {
    req.flash('error', 'Risorsa non specificata o non valida.');
    return res.redirect('/resources');
  }

  const resource = resourceRepo.findById(resourceId);
  if (!resource || resource.active !== 1) {
    req.flash('error', 'Risorsa non disponibile per la prenotazione.');
    return res.redirect('/resources');
  }

  const errors = {};
  let generalError = null;

  if (!date) {
    errors.date = 'La data è obbligatoria.';
  } else if (!dt.isValidIsoDate(date)) {
    errors.date = 'Data non valida.';
  }

  if (!startTime) {
    errors.startTime = 'L\'ora di inizio è obbligatoria.';
  } else if (!dt.isValidStartSlot(startTime)) {
    // isValidStartSlot esclude 24:00 by design: 24:00 è solo "ora
    // fine giornata". Lo segnaliamo con un messaggio specifico per
    // accompagnare l'utente.
    errors.startTime = startTime === '24:00'
      ? '24:00 non è ammesso come ora di inizio.'
      : 'L\'ora di inizio deve cadere su uno slot di 30 minuti (HH:00 o HH:30, fra 00:00 e 23:30).';
  }
  if (!endTime) {
    errors.endTime = 'L\'ora di fine è obbligatoria.';
  } else if (!dt.isValidEndSlot(endTime)) {
    errors.endTime = 'L\'ora di fine deve cadere su uno slot di 30 minuti (HH:00, HH:30 o 24:00).';
  }

  // Ordine cronologico e futuro: il resto (durata massima, finestra
  // del giorno specifico, capacity, overlap utente, limiti per
  // utente) è demandato al service.
  if (!errors.date && !errors.startTime && !errors.endTime) {
    // Confronto in minuti del giorno: 24:00 (1440) è correttamente
    // maggiore di qualunque ora di inizio.
    if (dt.timeToMinutes(endTime) <= dt.timeToMinutes(startTime)) {
      errors.endTime = 'L\'ora di fine deve essere successiva all\'ora di inizio.';
    } else {
      const startAt = dt.combineDateTime(date, startTime);
      // endTime = "24:00" viene normalizzato in <giornoSuccessivo>
      // 00:00 per non rompere l'ordinamento lessicografico nel DB.
      const endAt = dt.normalizeBookingEndAt(date, endTime);
      if (startAt <= dt.currentLocalIsoMinute()) {
        errors.date = 'La prenotazione deve essere collocata nel futuro.';
      } else {
        try {
          const result = bookingService.createBookingWithConflictCheck({
            user_id: res.locals.currentUser.id,
            resource_id: resource.id,
            start_at: startAt,
            end_at: endAt,
          });

          req.flash(
            'success',
            `Hai prenotato ${result.resource.name} il ${dt.formatItalianDateShort(startAt)} dalle ${startTime} alle ${endTime}.`
          );
          return res.redirect('/bookings/mine');
        } catch (err) {
          if (err && err.code) {
            // Errori semantici tipizzati dal service. Se il service
            // associa l'errore a un campo specifico ('date',
            // 'startTime', 'endTime') lo mostriamo inline, altrimenti
            // resta come messaggio generale sopra il form.
            if (err.field && ['date', 'startTime', 'endTime'].includes(err.field)) {
              errors[err.field] = err.message;
            } else {
              generalError = err.message;
            }
          } else {
            throw err;
          }
        }
      }
    }
  }

  const meta = TYPE_META[resource.type];
  const { availability, startSlots, endSlots, closedMessage } = buildAvailabilityContext(resource, date);

  return res.status(400).render('pages/bookings/new', {
    title: `Prenota · ${resource.name} · UniBook`,
    resource,
    typeLabel: meta ? meta.labelSingular : resource.type,
    availability,
    availabilityJson: JSON.stringify(availability),
    startSlots,
    endSlots,
    closedMessage,
    minDate: dt.todayIsoDate(),
    values: { date, startTime, endTime },
    errors,
    generalError,
    rules: buildRulesNote(resource),
  });
});

/* 
 * GET /bookings/mine
 *
 * Mostra l'area personale delle prenotazioni dell'utente autenticato.
 *
 * La pagina può essere visualizzata in tre modalità:
 *   - upcoming: prossime prenotazioni future confermate;
 *   - history: prenotazioni passate o annullate;
 *   - calendar: prossime prenotazioni organizzate in calendario settimanale.
 *
 * La rotta recupera solo le prenotazioni dell'utente corrente, usando l'id
 * salvato in res.locals.currentUser.
 *
 * Le prenotazioni vengono decorate con decorateBooking(), così il template riceve
 * già date, orari, etichette di stato e informazione sulla cancellabilità.
 */
router.get('/bookings/mine', (req, res) => {
  const userId = res.locals.currentUser.id;
  const nowIso = dt.currentLocalIsoMinute();

  // Tre viste mutuamente esclusive, codificate in ?view=
  //   - 'upcoming'  (default): lista delle prossime prenotazioni;
  //   - 'calendar'           : prossime prenotazioni in vista
  //                            settimanale con navigazione;
  //   - 'history'            : storico (passate o annullate).
  const viewInput = req.query.view;
  const view = ['upcoming', 'calendar', 'history'].includes(viewInput)
    ? viewInput
    : 'upcoming';

  const upcoming = bookingRepo.findUpcomingByUser(userId).map((b) => decorateBooking(b, nowIso));
  const history = bookingRepo.findHistoryByUser(userId).map((b) => decorateBooking(b, nowIso));

  // La vista calendario lavora solo sulle prossime: lo storico
  // resta nella sua tab dedicata. La settimana mostrata può
  // essere navigata con ?week=YYYY-MM-DD; in mancanza usiamo la
  // settimana corrente.
  let calendar = null;
  if (view === 'calendar') {
    const weekParam = (req.query.week || '').trim();
    const anchor = weekParam && dt.isValidIsoDate(weekParam) ? weekParam : dt.todayIsoDate();
    const monday = dt.mondayOfWeek(anchor);
    const sundayPlusOne = dt.addDaysToIsoDate(monday, 7);
    const days = dt.weekDayList(monday);

    // Indicizziamo le prossime prenotazioni per giorno (ISO date di
    // start_at) e poi distribuiamo sui sette giorni della settimana
    // mostrata. La query findUpcomingByUser è già limitata alle
    // future confermate.
    const byDay = new Map();
    for (const d of days) byDay.set(d.iso, []);
    for (const b of upcoming) {
      const iso = b.start_at.substring(0, 10);
      if (iso >= monday && iso < sundayPlusOne && byDay.has(iso)) {
        byDay.get(iso).push(b);
      }
    }
    const calendarDays = days.map((d) => ({
      ...d,
      isToday: d.iso === dt.todayIsoDate(),
      items: byDay.get(d.iso) || [],
    }));

    calendar = {
      weekLabel: `${days[0].labelFull} – ${days[6].labelFull}`,
      days: calendarDays,
      prevWeekUrl: `/bookings/mine?view=calendar&week=${dt.addDaysToIsoDate(monday, -7)}`,
      todayWeekUrl: `/bookings/mine?view=calendar&week=${dt.todayIsoDate()}`,
      nextWeekUrl: `/bookings/mine?view=calendar&week=${dt.addDaysToIsoDate(monday, 7)}`,
    };
  }

  res.render('pages/bookings/mine', {
    title: 'Le mie prenotazioni · UniBook',
    view,
    upcoming,
    history,
    upcomingCount: upcoming.length,
    historyCount: history.length,
    calendar,
  });
});

/* 
 * POST /bookings/:id/cancel
 *
 * Annulla una prenotazione dell'utente autenticato.
 *
 * La rotta esegue controlli progressivi:
 *   - id della prenotazione valido;
 *   - prenotazione esistente;
 *   - prenotazione appartenente all'utente corrente;
 *   - prenotazione ancora confirmed;
 *   - prenotazione non ancora iniziata.
 *
 * Se tutti i controlli passano, la prenotazione non viene eliminata fisicamente:
 * viene aggiornata con status = 'cancelled'.
 *
 * Questa scelta conserva lo storico e libera lo slot, perché i controlli di
 * conflitto considerano solo prenotazioni confirmed.
 */
router.post('/bookings/:id/cancel', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    req.flash('error', 'Identificativo prenotazione non valido.');
    return res.redirect('/bookings/mine');
  }

  const booking = bookingRepo.findById(id);
  if (!booking) {
    req.flash('error', 'Prenotazione non trovata.');
    return res.redirect('/bookings/mine');
  }

  if (booking.user_id !== res.locals.currentUser.id) {
    req.flash('error', 'Non puoi annullare prenotazioni di altri utenti.');
    return res.redirect('/bookings/mine');
  }

  if (booking.status !== 'confirmed') {
    req.flash('info', 'Questa prenotazione è già stata annullata.');
    return res.redirect('/bookings/mine');
  }

  if (booking.start_at <= dt.currentLocalIsoMinute()) {
    req.flash('error', 'Non puoi annullare una prenotazione già iniziata o conclusa.');
    return res.redirect('/bookings/mine');
  }

  bookingRepo.cancel(id);
  req.flash(
    'success',
    `Prenotazione di ${booking.resource_name} del ${dt.formatItalianDateShort(booking.start_at)} annullata.`
  );
  res.redirect('/bookings/mine');
});

/* 
 * GET /bookings/:id/ics
 *
 * Esporta una prenotazione in formato iCalendar .ics.
 *
 * Questa è la funzionalità di Livello 3: permette all'utente di scaricare un
 * file calendario e aggiungere la prenotazione a Google Calendar, Apple Calendar,
 * Outlook o altri client compatibili.
 *
 * L'export è consentito solo se:
 *   - l'id è valido;
 *   - la prenotazione esiste;
 *   - la prenotazione appartiene all'utente corrente;
 *   - la prenotazione è confirmed;
 *   - la prenotazione è futura.
 *
 * Non permettiamo l'export di prenotazioni cancellate o passate, perché non ha
 * senso aggiungerle come nuovo evento al calendario.
 *
 * Dopo i controlli, la rotta recupera la risorsa completa, genera il contenuto
 * .ics tramite icsService.buildIcsForBooking(), genera il nome file e invia la
 * risposta con header adatti al download.
 */
router.get('/bookings/:id/ics', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    req.flash('error', 'Identificativo prenotazione non valido.');
    return res.redirect('/bookings/mine');
  }

  const booking = bookingRepo.findById(id);
  if (!booking) {
    req.flash('error', 'Prenotazione non trovata.');
    return res.redirect('/bookings/mine');
  }

  // Solo il proprietario: lato admin non esponiamo questo flusso
  // (vedi commento in cima alla rotta). Manteniamo il backend
  // coerente con la UI.
  if (booking.user_id !== res.locals.currentUser.id) {
    req.flash('error', 'Non puoi scaricare il calendario di prenotazioni di altri utenti.');
    return res.redirect('/bookings/mine');
  }

  if (booking.status !== 'confirmed') {
    req.flash('info', 'Le prenotazioni annullate non possono essere aggiunte al calendario.');
    return res.redirect('/bookings/mine');
  }

  // Il confronto stringa funziona perché entrambi i valori sono nel
  // formato "YYYY-MM-DD HH:MM" zero-padded: l'ordinamento
  // lessicografico coincide con quello cronologico.
  if (booking.start_at <= dt.currentLocalIsoMinute()) {
    req.flash('info', 'Le prenotazioni passate non possono essere aggiunte al calendario.');
    return res.redirect('/bookings/mine');
  }

  // findById restituisce già resource_name ma non gli altri campi
  // della risorsa: per generare un evento ICS utile (location,
  // categoria, capienza, descrizione) ricaviamo l'intero record.
  const resource = resourceRepo.findById(booking.resource_id);
  if (!resource) {
    req.flash('error', 'Risorsa associata alla prenotazione non trovata.');
    return res.redirect('/bookings/mine');
  }

  const ics = icsService.buildIcsForBooking(booking, resource);
  const filename = icsService.fileNameForBooking(booking);

  // Le risposte text/calendar non vengono mai messe in cache:
  // contengono un DTSTAMP fresco a ogni richiesta e potrebbero
  // diventare obsolete se nel frattempo la prenotazione viene
  // annullata o modificata.
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.set('Cache-Control', 'no-store');
  return res.send(ics);
});

/*
 * Esportazione del router delle prenotazioni.
 *
 * server.js importa questo router e lo monta nell'app Express, rendendo attive
 * tutte le rotte definite in questo file.
 */
module.exports = router;
