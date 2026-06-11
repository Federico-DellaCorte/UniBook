/*
 * Endpoint JSON dell'applicazione UniBook.
 *
 * Questo file contiene le rotte API del progetto, cioè rotte che non
 * restituiscono pagine HTML, ma dati in formato JSON.
 *
 * JSON è un formato leggero usato per scambiare dati tra server e browser.
 * In questo caso viene usato dal JavaScript lato client tramite fetch().
 *
 * L'endpoint principale è:
 *
 *   GET /api/availability?resourceId=...&date=YYYY-MM-DD
 *
 * Serve a recuperare l'occupazione giornaliera aggregata di una risorsa:
 * se è aperta, quanti posti sono occupati, quanti restano disponibili e quali
 * slot risultano liberi, parzialmente occupati o pieni.
 *
 * Questa API viene usata nella scheda dettaglio della risorsa: quando l'utente
 * cambia data, il browser può aggiornare la sezione disponibilità senza
 * ricaricare tutta la pagina.
 *
 * Le risposte sono privacy-safe: vengono restituiti solo dati aggregati sulla
 * disponibilità, mai username, email o informazioni personali degli utenti che
 * hanno effettuato prenotazioni.
 *
 * La stessa informazione viene comunque calcolata anche lato server nella pagina
 * HTML, così il progetto funziona anche se JavaScript è disattivato.
 */

const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const resourceRepo = require('../repositories/resourceRepo');
const availabilityService = require('../services/availabilityService');
const dt = require('../helpers/dateTime');

const router = express.Router();

/*
 * Protezione degli endpoint API.
 *
 * Tutte le rotte che iniziano con /api richiedono un utente autenticato.
 *
 * Anche se queste rotte restituiscono JSON e non pagine HTML, devono comunque
 * essere protette lato server: un utente anonimo non deve poter interrogare
 * direttamente gli endpoint digitando l'URL o usando strumenti esterni.
 */
router.use('/api', requireAuth);

/* ----------------------------------------------------------------
 * GET /api/availability
 * ----------------------------------------------------------------
 *
 * Restituisce in JSON la disponibilità giornaliera di una risorsa.
 *
 * La rotta riceve due parametri dalla query string:
 *   - resourceId: id della risorsa;
 *   - date: data nel formato YYYY-MM-DD.
 *
 * Esempio:
 *
 *   /api/availability?resourceId=3&date=2026-06-05
 *
 * La rotta valida i parametri, controlla che la risorsa esista e sia attiva,
 * poi usa availabilityService per calcolare l'occupazione del giorno richiesto.
 *
 * Il risultato viene restituito come JSON, quindi può essere letto facilmente
 * dal JavaScript nel browser.
 *
 * In caso di errore restituisce uno status HTTP adatto:
 *   - 400 se i parametri sono mancanti o non validi;
 *   - 404 se la risorsa non esiste o non è disponibile.
 */
router.get('/api/availability', (req, res) => {
  // Leggo resourceId dalla query string e lo converto in numero intero.
  const resourceId = Number.parseInt(req.query.resourceId, 10);
  if (!Number.isInteger(resourceId) || resourceId < 1) {
    return res.status(400).json({ error: 'resourceId non valido' });
  }
  // Leggo la data richiesta e verifico che sia nel formato ISO usato dal progetto.
  const date = (req.query.date || '').trim();
  if (!date || !dt.isValidIsoDate(date)) {
    return res.status(400).json({ error: 'date non valida (YYYY-MM-DD)' });
  }

  // Recupero la risorsa e controllo che sia attiva: le risorse disattivate
  // non devono essere consultabili dagli utenti standard.
  const resource = resourceRepo.findById(resourceId);
  if (!resource || resource.active !== 1) {
    return res.status(404).json({ error: 'Risorsa non trovata o non disponibile' });
  }

  // Calcolo l'occupazione aggregata della risorsa nel giorno richiesto.
  const day = availabilityService.computeDayOccupancy(resource, date);
  // Raggruppo slot consecutivi con la stessa occupazione per restituire
  // una risposta più compatta e leggibile.
  const grouped = availabilityService.groupConsecutiveSlots(day.slots);

  // Risposta JSON consumata dal frontend tramite fetch().
  return res.json({
    resourceId: resource.id,
    date,
    isOpen: day.isOpen,
    capacity: resource.capacity,
    opensAt: day.opensAt || null,
    closesAt: day.closesAt || null,
    slots: grouped,
  });
});

/*
 * Esportazione del router API.
 *
 * server.js importa questo router e lo monta nell'app Express, rendendo attivi
 * gli endpoint JSON definiti in questo file.
 */
module.exports = router;
