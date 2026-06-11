/*
 * Rotte amministrative per la gestione delle risorse.
 *
 * Questo file contiene tutte le operazioni che l'amministratore può fare sulle
 * risorse prenotabili: consultazione, creazione, modifica, disattivazione,
 * riattivazione ed eliminazione definitiva.
 *
 * L'intero router è protetto da requireAdmin, quindi solo un utente autenticato
 * con ruolo admin può accedere a queste rotte.
 *
 * A differenza delle pagine utente, qui vengono mostrate anche le risorse
 * disattivate, perché l'admin deve poterle controllare, riattivare o eliminare.
 *
 * Le operazioni più delicate usano un meccanismo di conferma intelligente:
 * se un'azione può impattare prenotazioni future confermate, viene mostrata una
 * pagina intermedia di conferma; se invece non ci sono prenotazioni coinvolte,
 * l'azione viene eseguita subito.
 *
 * Questo vale soprattutto per:
 *   - modifica della categoria o disponibilità della risorsa;
 *   - disattivazione;
 *   - eliminazione definitiva.
 *
 * Le modifiche che coinvolgono più tabelle vengono eseguite dentro transazioni,
 * così il database non resta mai in uno stato parziale.
 */

const express = require('express');

const db = require('../db/connection');
const requireAdmin = require('../middleware/requireAdmin');
const resourceRepo = require('../repositories/resourceRepo');
const bookingRepo = require('../repositories/bookingRepo');
const { TYPE_KEYS, TYPE_META, RESOURCE_TYPES, MAX_CAPACITY } = require('../constants');
const dt = require('../helpers/dateTime');
const availabilityRepo = require('../repositories/resourceAvailabilityRepo');
const availabilityService = require('../services/resourceAvailabilityService');
const { buildAdminCategoryStats } = require('../helpers/categoryStats');

const router = express.Router();

/*
 * Protezione delle rotte amministrative sulle risorse.
 *
 * Tutti gli URL che iniziano con /admin/resources richiedono un utente admin.
 * Se un utente non autenticato o non amministratore prova ad accedere, viene
 * bloccato dal middleware requireAdmin.
 */
router.use('/admin/resources', requireAdmin);

/*
 * Costruisce le opzioni del select delle categorie.
 *
 * Viene usata nei form admin di creazione e modifica risorsa.
 * Per ogni categoria definita in RESOURCE_TYPES crea una voce selezionabile,
 * marcando come selected quella attualmente scelta.
 */
function buildTypeOptions(selectedType) {
  return RESOURCE_TYPES.map((meta) => ({
    type: meta.type,
    labelSingular: meta.labelSingular,
    selected: meta.type === selectedType,
  }));
}

/*
 * Valida i campi principali di una risorsa.
 *
 * Questa funzione viene riutilizzata sia nella creazione sia nella modifica.
 *
 * Controlla:
 *   - nome obbligatorio e con lunghezza minima;
 *   - categoria obbligatoria e tra quelle ammesse;
 *   - capienza obbligatoria, intera e compresa tra 1 e MAX_CAPACITY;
 *   - posizione obbligatoria.
 *
 * La descrizione resta libera e non obbligatoria.
 *
 * La disponibilità settimanale non viene validata qui, ma nel service dedicato
 * resourceAvailabilityService.
 */
function validateResourcePayload({ name, type, capacity, location }) {
  const errors = {};

  if (!name || !name.trim()) {
    errors.name = 'Il nome è obbligatorio.';
  } else if (name.trim().length < 3) {
    errors.name = 'Il nome deve avere almeno 3 caratteri.';
  }

  if (!type) {
    errors.type = 'La categoria è obbligatoria.';
  } else if (!TYPE_KEYS.includes(type)) {
    errors.type = 'Categoria non valida.';
  }

  const capacityNum = Number.parseInt(capacity, 10);
  if (capacity === undefined || capacity === null || capacity === '') {
    errors.capacity = 'La capienza è obbligatoria.';
  } else if (
    !Number.isInteger(capacityNum) ||
    capacityNum < 1 ||
    capacityNum > MAX_CAPACITY
  ) {
    errors.capacity = `La capienza deve essere compresa tra 1 e ${MAX_CAPACITY} posti.`;
  }

  if (!location || !location.trim()) {
    errors.location = 'La posizione è obbligatoria.';
  }

  return errors;
}

/*
 * Prepara le righe di disponibilità settimanale per i template.
 *
 * Il database salva valori tecnici, per esempio is_open come 0 o 1.
 * Il template, invece, ha bisogno di dati già ordinati e leggibili:
 * giorno della settimana, nome del giorno, stato aperto/chiuso e orari.
 *
 * Questa funzione ordina le righe da lunedì a domenica e aggiunge dayName.
 */
function decorateAvailability(rows) {
  return rows
    .slice()
    .sort((a, b) => a.weekday - b.weekday)
    .map((r) => ({
      weekday: r.weekday,
      dayName: dt.weekdayNameLong(r.weekday),
      is_open: r.is_open ? 1 : 0,
      opens_at: r.opens_at || '',
      closes_at: r.closes_at || '',
    }));
}

/*
 * Prepara le prenotazioni da mostrare nelle pagine di conferma admin.
 *
 * Quando una modifica, disattivazione o eliminazione impatta prenotazioni future,
 * l'admin deve vedere quali prenotazioni saranno annullate.
 *
 * Questa funzione trasforma i record tecnici in dati leggibili:
 * data italiana, orario di inizio, orario di fine e motivo dell'incompatibilità.
 */
function decorateBookingsForConfirm(bookings) {
  return bookings.map((b) => ({
    id: b.id,
    user_username: b.user_username,
    date_label: dt.formatItalianDate(b.start_at),
    start_time: dt.extractTime(b.start_at),
    end_time: dt.endTimeDisplay(b.start_at, b.end_at),
    reasonLabel: b.reason === 'day_closed'
      ? 'giorno chiuso nella nuova disponibilità'
      : b.reason === 'out_of_window'
        ? 'fuori dalla nuova finestra oraria'
        : '',
  }));
}

/* 
 * GET /admin/resources
 *
 * Mostra l'area amministrativa delle risorse.
 *
 * Se non viene indicata una categoria, mostra le card di riepilogo per tutte
 * le tipologie di risorsa.
 *
 * Se invece arriva una query string type, per esempio:
 *
 *   /admin/resources?type=aula
 *
 * mostra l'elenco completo delle risorse di quella categoria, incluse quelle
 * disattivate.
 *
 * Per ogni risorsa viene aggiunto anche un riassunto della disponibilità
 * settimanale, così l'admin vede rapidamente quando la risorsa è aperta.
 */
router.get('/admin/resources', (req, res) => {
  const type = req.query.type;

  if (type) {
    if (!TYPE_KEYS.includes(type)) {
      req.flash('error', 'Categoria di risorse non valida.');
      return res.redirect('/admin/resources');
    }
    const meta = TYPE_META[type];
    const resources = resourceRepo.findAllByType(type);
    const activeCount = resources.filter((r) => r.active === 1).length;
    const inactiveCount = resources.length - activeCount;

    const decorated = resources.map((r) => {
      const availability = availabilityRepo.findByResourceId(r.id);
      return {
        ...r,
        availabilitySummary: dt.summarizeWeeklyAvailability(availability),
      };
    });

    return res.render('pages/admin/resources/list', {
      title: `Gestione · ${meta.labelPlural} · UniBook`,
      type,
      categoryLabel: meta.labelPlural,
      resources: decorated,
      stats: {
        total: resources.length,
        active: activeCount,
        inactive: inactiveCount,
      },
    });
  }

  const categories = buildAdminCategoryStats();
  return res.render('pages/admin/resources/categories', {
    title: 'Gestione risorse · UniBook',
    categories,
  });
});

/* 
 * GET /admin/resources/new
 *
 * Mostra il form per creare una nuova risorsa.
 *
 * Il form viene inizializzato con:
 *   - categoria selezionata;
 *   - disponibilità settimanale di default;
 *   - slot validi di inizio e fine;
 *   - oggetto errors vuoto.
 *
 * La disponibilità di default permette all'admin di partire da una settimana
 * già compilata e poi modificarla.
 */
router.get('/admin/resources/new', (req, res) => {
  const desiredType = TYPE_KEYS.includes(req.query.type)
    ? req.query.type
    : RESOURCE_TYPES[0].type;

  res.render('pages/admin/resources/new', {
    title: 'Nuova risorsa · UniBook',
    values: { type: desiredType },
    errors: {},
    typeOptions: buildTypeOptions(desiredType),
    currentType: desiredType,
    availability: decorateAvailability(availabilityService.buildDefaultWeek()),
    startSlots: dt.allStartSlots(),
      endSlots: dt.allEndSlots(),
  });
});

/* 
 * POST /admin/resources
 *
 * Gestisce la creazione di una nuova risorsa.
 *
 * La rotta legge i dati del form, valida i campi principali della risorsa e
 * valida anche la disponibilità settimanale.
 *
 * Se ci sono errori, il form viene mostrato di nuovo con i valori già inseriti.
 *
 * Se tutto è valido:
 *   - crea la risorsa nella tabella resources;
 *   - inserisce le sette righe di disponibilità settimanale;
 *   - mostra un messaggio flash di successo;
 *   - reindirizza l'admin alla categoria della nuova risorsa.
 *
 * Gli orari legacy opens_at e closes_at vengono ricavati dal primo giorno aperto
 * della settimana, per mantenere compatibilità con i campi ancora presenti nella
 * tabella resources.
 */
router.post('/admin/resources', (req, res) => {
  const name = (req.body.name || '').trim();
  const type = (req.body.type || '').trim();
  const capacity = req.body.capacity;
  const location = (req.body.location || '').trim();
  const description = (req.body.description || '').trim();

  const errors = validateResourcePayload({ name, type, capacity, location });
  const weekRows = availabilityService.parseWeeklyAvailabilityFromBody(req.body);
  const weekErrors = availabilityService.validateWeeklyAvailability(weekRows);
  Object.assign(errors, weekErrors);

  if (Object.keys(errors).length > 0) {
    return res.status(400).render('pages/admin/resources/new', {
      title: 'Nuova risorsa · UniBook',
      values: { name, type, capacity, location, description },
      errors,
      typeOptions: buildTypeOptions(type),
      currentType: TYPE_KEYS.includes(type) ? type : RESOURCE_TYPES[0].type,
      availability: decorateAvailability(weekRows),
      startSlots: dt.allStartSlots(),
      endSlots: dt.allEndSlots(),
      generalError: errors._general,
    });
  }

  const fallbackOpen = weekRows.find((r) => r.is_open);
  const legacyOpens = fallbackOpen ? fallbackOpen.opens_at : '08:00';
  const legacyCloses = fallbackOpen ? fallbackOpen.closes_at : '22:00';

  const newId = resourceRepo.create({
    name,
    type,
    capacity: Number.parseInt(capacity, 10),
    location,
    description,
    opens_at: legacyOpens,
    closes_at: legacyCloses,
  });
  availabilityRepo.replaceForResource(newId, availabilityService.toRepositoryRows(weekRows));

  req.flash('success', `Risorsa "${name}" creata correttamente.`);
  res.redirect(`/admin/resources?type=${encodeURIComponent(type)}`);
});

/* 
 * GET /admin/resources/:id/edit
 *
 * Mostra il form di modifica di una risorsa esistente.
 *
 * La rotta controlla che l'id sia valido e che la risorsa esista.
 * Poi recupera la disponibilità settimanale dal database.
 *
 * Se la risorsa ha già sette righe di disponibilità, vengono usate quelle.
 * Se invece per qualche motivo mancano, viene costruita una settimana di default.
 *
 * Il template riceve dati della risorsa, opzioni di categoria, disponibilità e
 * slot orari per permettere all'admin di modificare tutto dal form.
 */
router.get('/admin/resources/:id/edit', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    req.flash('error', 'Identificativo risorsa non valido.');
    return res.redirect('/admin/resources');
  }

  const resource = resourceRepo.findById(id);
  if (!resource) {
    req.flash('error', 'Risorsa non trovata.');
    return res.redirect('/admin/resources');
  }

  const dbRows = availabilityRepo.findByResourceId(resource.id);
  const formRows = dbRows.length === 7
    ? dbRows.map((r) => ({
        weekday: r.weekday,
        is_open: r.is_open === 1,
        opens_at: r.opens_at || '',
        closes_at: r.closes_at || '',
      }))
    : availabilityService.buildDefaultWeek();

  res.render('pages/admin/resources/edit', {
    title: `Modifica · ${resource.name} · UniBook`,
    resource,
    values: resource,
    errors: {},
    typeOptions: buildTypeOptions(resource.type),
    currentType: resource.type,
    availability: decorateAvailability(formRows),
    startSlots: dt.allStartSlots(),
      endSlots: dt.allEndSlots(),
  });
});

/* 
 * POST /admin/resources/:id/edit
 *
 * Gestisce la modifica di una risorsa esistente.
 *
 * Questa è una delle rotte più delicate del file, perché cambiare categoria o
 * disponibilità può rendere incompatibili prenotazioni future già confermate.
 *
 * La rotta esegue questi passaggi:
 *   1. valida id e presenza della risorsa;
 *   2. legge i dati del form;
 *   3. valida campi principali e disponibilità settimanale;
 *   4. calcola l'impatto sulle prenotazioni future;
 *   5. se serve, mostra una pagina intermedia di conferma;
 *   6. se l'admin conferma, aggiorna risorsa, disponibilità e prenotazioni
 *      coinvolte dentro una transazione.
 *
 * La conferma intermedia compare solo se esistono prenotazioni future che
 * verrebbero annullate dalla modifica.
 *
 * Se cambia la categoria, tutte le prenotazioni future della risorsa vengono
 * considerate impattate, perché cambiano i vincoli applicativi.
 *
 * Se invece cambia solo la disponibilità, vengono annullate solo le prenotazioni
 * future che cadono in giorni chiusi o fuori dalla nuova finestra oraria.
 */
router.post('/admin/resources/:id/edit', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    req.flash('error', 'Identificativo risorsa non valido.');
    return res.redirect('/admin/resources');
  }

  const existing = resourceRepo.findById(id);
  if (!existing) {
    req.flash('error', 'Risorsa non trovata.');
    return res.redirect('/admin/resources');
  }

  const name = (req.body.name || '').trim();
  const type = (req.body.type || '').trim();
  const capacity = req.body.capacity;
  const location = (req.body.location || '').trim();
  const description = (req.body.description || '').trim();
  const confirmed = (req.body && req.body.confirmed) === '1';

  const errors = validateResourcePayload({ name, type, capacity, location });
  const weekRows = availabilityService.parseWeeklyAvailabilityFromBody(req.body);
  const weekErrors = availabilityService.validateWeeklyAvailability(weekRows);
  Object.assign(errors, weekErrors);

  if (Object.keys(errors).length > 0) {
    return res.status(400).render('pages/admin/resources/edit', {
      title: `Modifica · ${existing.name} · UniBook`,
      resource: existing,
      values: { name, type, capacity, location, description },
      errors,
      typeOptions: buildTypeOptions(type),
      currentType: TYPE_KEYS.includes(type) ? type : existing.type,
      availability: decorateAvailability(weekRows),
      startSlots: dt.allStartSlots(),
      endSlots: dt.allEndSlots(),
      generalError: errors._general,
    });
  }

  // Calcolo dell'impatto sulle prenotazioni future. La precedenza è
  // del cambio di tipo: se il tipo cambia E ci sono prenotazioni
  // future confermate, vanno tutte annullate (nuova categoria,
  // nuove regole). Altrimenti si valuta soltanto l'incompatibilità
  // con la nuova disponibilità.
  const typeChanged = existing.type !== type;
  const futureBookings = bookingRepo.findFutureConfirmedByResource(existing.id);

  let confirmReason = null;
  let bookingsToCancel = [];
  if (typeChanged && futureBookings.length > 0) {
    confirmReason = 'type';
    bookingsToCancel = futureBookings;
  } else {
    const incompatibles = availabilityService.findIncompatibleFutureBookings(existing.id, weekRows);
    if (incompatibles.length > 0) {
      confirmReason = 'availability';
      bookingsToCancel = incompatibles;
    }
  }

  if (confirmReason && !confirmed) {
    // Render della pagina di conferma. Tutti i campi del form
    // vengono ripropagati come hidden così che la POST successiva
    // (con confirmed=1) ripeta esattamente la stessa intenzione.
    // weekRows è serializzato in un array di campi day{n}_open,
    // day{n}_opens_at, day{n}_closes_at per simmetria col body
    // originale.
    return res.render('pages/admin/resources/confirm-update', {
      title: `Conferma modifica · ${existing.name} · UniBook`,
      resource: existing,
      newType: type,
      newTypeLabel: TYPE_META[type] ? TYPE_META[type].labelSingular : type,
      oldTypeLabel: TYPE_META[existing.type] ? TYPE_META[existing.type].labelSingular : existing.type,
      confirmReason,
      bookingsToCancel: decorateBookingsForConfirm(bookingsToCancel),
      bookingsCount: bookingsToCancel.length,
      formValues: { name, type, capacity, location, description },
      weekRowsForm: weekRows.map((r) => ({
        weekday: r.weekday,
        is_open: r.is_open ? '1' : '',
        opens_at: r.opens_at || '',
        closes_at: r.closes_at || '',
      })),
    });
  }

  // Esecuzione atomica: update risorsa + replace availability +
  // cancellazione delle prenotazioni impattate (se presenti).
  const fallbackOpen = weekRows.find((r) => r.is_open);
  const legacyOpens = fallbackOpen ? fallbackOpen.opens_at : '08:00';
  const legacyCloses = fallbackOpen ? fallbackOpen.closes_at : '22:00';
  const idsToCancel = bookingsToCancel.map((b) => b.id);

  const apply = db.transaction(() => {
    resourceRepo.update(existing.id, {
      name,
      type,
      capacity: Number.parseInt(capacity, 10),
      location,
      description,
      opens_at: legacyOpens,
      closes_at: legacyCloses,
    });
    availabilityRepo.replaceForResource(
      existing.id,
      availabilityService.toRepositoryRows(weekRows)
    );
    if (idsToCancel.length > 0) {
      bookingRepo.cancelManyByIds(idsToCancel);
    }
  });
  apply();

  let message = `Risorsa "${name}" aggiornata correttamente.`;
  if (idsToCancel.length === 1) {
    message += ' 1 prenotazione futura annullata.';
  } else if (idsToCancel.length > 1) {
    message += ` ${idsToCancel.length} prenotazioni future annullate.`;
  }
  req.flash('success', message);
  res.redirect(`/admin/resources?type=${encodeURIComponent(type)}`);
});

/*
 * Carica una risorsa dall'id dell'URL oppure gestisce il redirect.
 *
 * Questa funzione evita di ripetere lo stesso controllo in più rotte admin.
 *
 * Controlla:
 *   - id numerico e positivo;
 *   - risorsa esistente nel database.
 *
 * Se qualcosa non va, mostra un messaggio flash, reindirizza alla gestione
 * risorse e restituisce null.
 *
 * Se la risorsa esiste, la restituisce al chiamante.
 */
function loadResourceOrRedirect(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    req.flash('error', 'Identificativo risorsa non valido.');
    res.redirect('/admin/resources');
    return null;
  }
  const resource = resourceRepo.findById(id);
  if (!resource) {
    req.flash('error', 'Risorsa non trovata.');
    res.redirect('/admin/resources');
    return null;
  }
  return resource;
}

/* 
 * POST /admin/resources/:id/deactivate
 *
 * Disattiva una risorsa.
 *
 * Disattivare significa impostare active = 0: la risorsa resta nel database,
 * ma non viene più mostrata agli utenti standard e non deve essere prenotabile.
 *
 * Se la risorsa non ha prenotazioni future confermate, viene disattivata subito.
 *
 * Se invece ha prenotazioni future confermate, viene prima mostrata una pagina
 * di conferma che informa l'admin che quelle prenotazioni saranno annullate.
 *
 * L'operazione finale viene eseguita dentro una transazione:
 *   - disattiva la risorsa;
 *   - annulla le prenotazioni future confermate.
 */
router.post('/admin/resources/:id/deactivate', (req, res) => {
  const resource = loadResourceOrRedirect(req, res);
  if (!resource) return;

  if (resource.active !== 1) {
    req.flash('info', 'La risorsa è già disattivata.');
    return res.redirect(`/admin/resources?type=${encodeURIComponent(resource.type)}`);
  }

  const confirmed = (req.body && req.body.confirmed) === '1';
  const futureBookings = bookingRepo.findFutureConfirmedByResource(resource.id);

  if (futureBookings.length > 0 && !confirmed) {
    const meta = TYPE_META[resource.type];
    return res.render('pages/admin/resources/confirm-deactivate', {
      title: `Disattivazione · ${resource.name} · UniBook`,
      resource,
      typeLabel: meta ? meta.labelSingular : resource.type,
      futureBookings: decorateBookingsForConfirm(futureBookings),
      futureCount: futureBookings.length,
    });
  }

  const deactivate = db.transaction((rid) => {
    resourceRepo.setActive(rid, 0);
    return bookingRepo.cancelFutureByResource(rid);
  });
  const cancelled = deactivate(resource.id);

  let message;
  if (cancelled === 0) {
    message = `Risorsa "${resource.name}" disattivata correttamente.`;
  } else if (cancelled === 1) {
    message = `Risorsa "${resource.name}" disattivata. 1 prenotazione futura annullata.`;
  } else {
    message = `Risorsa "${resource.name}" disattivata. ${cancelled} prenotazioni future annullate.`;
  }
  req.flash('success', message);
  res.redirect(`/admin/resources?type=${encodeURIComponent(resource.type)}`);
});

/* 
 * POST /admin/resources/:id/reactivate
 *
 * Riattiva una risorsa disattivata.
 *
 * Riattivare significa impostare active = 1: la risorsa torna visibile e
 * potenzialmente prenotabile dagli utenti, secondo la sua disponibilità.
 *
 * Se la risorsa è già attiva, viene mostrato solo un messaggio informativo.
 *
 * Questa operazione non ricrea prenotazioni annullate in passato: riattiva solo
 * la risorsa.
 */
router.post('/admin/resources/:id/reactivate', (req, res) => {
  const resource = loadResourceOrRedirect(req, res);
  if (!resource) return;

  if (resource.active === 1) {
    req.flash('info', 'La risorsa è già attiva.');
    return res.redirect(`/admin/resources?type=${encodeURIComponent(resource.type)}`);
  }

  resourceRepo.setActive(resource.id, 1);
  req.flash('success', `Risorsa "${resource.name}" riattivata correttamente.`);
  res.redirect(`/admin/resources?type=${encodeURIComponent(resource.type)}`);
});

/* 
 * POST /admin/resources/:id/delete
 *
 * Elimina definitivamente una risorsa.
 *
 * Questa operazione è diversa dalla disattivazione:
 *   - disattivare mantiene la risorsa nel database;
 *   - eliminare cancella fisicamente la risorsa.
 *
 * Prima dell'eliminazione vengono valutate le prenotazioni future confermate.
 * Se esistono, l'admin vede una pagina di conferma intermedia.
 *
 * L'eliminazione reale avviene dentro una transazione:
 *   - prima vengono eliminate tutte le prenotazioni collegate alla risorsa;
 *   - poi viene eliminata la risorsa.
 *
 * Questo ordine è necessario perché la tabella bookings contiene una foreign key
 * verso resources: se esistessero ancora prenotazioni collegate, il database
 * potrebbe impedire la cancellazione della risorsa.
 *
 * È un'azione irreversibile e va distinta chiaramente dal soft delete ottenuto
 * con active = 0.
 */
router.post('/admin/resources/:id/delete', (req, res) => {
  const resource = loadResourceOrRedirect(req, res);
  if (!resource) return;

  const confirmed = (req.body && req.body.confirmed) === '1';
  const futureBookings = bookingRepo.findFutureConfirmedByResource(resource.id);

  if (futureBookings.length > 0 && !confirmed) {
    const meta = TYPE_META[resource.type];
    return res.render('pages/admin/resources/confirm-delete', {
      title: `Eliminazione · ${resource.name} · UniBook`,
      resource,
      typeLabel: meta ? meta.labelSingular : resource.type,
      futureBookings: decorateBookingsForConfirm(futureBookings),
      futureCount: futureBookings.length,
    });
  }

  const remove = db.transaction((rid) => {
    const removedBookings = bookingRepo.deleteAllByResource(rid);
    const removedResource = resourceRepo.remove(rid);
    return { removedBookings, removedResource };
  });

  const result = remove(resource.id);

  if (result.removedResource === 0) {
    req.flash('error', 'Impossibile completare l\'eliminazione: la risorsa non esiste più.');
    return res.redirect('/admin/resources');
  }

  let message = `Risorsa "${resource.name}" eliminata definitivamente.`;
  if (futureBookings.length === 1) {
    message += ' 1 prenotazione futura annullata.';
  } else if (futureBookings.length > 1) {
    message += ` ${futureBookings.length} prenotazioni future annullate.`;
  }
  req.flash('success', message);
  res.redirect(`/admin/resources?type=${encodeURIComponent(resource.type)}`);
});

/*
 * Esportazione del router amministrativo delle risorse.
 *
 * server.js importa questo router e lo monta nell'app Express, rendendo attive
 * tutte le rotte admin definite in questo file.
 */
module.exports = router;
