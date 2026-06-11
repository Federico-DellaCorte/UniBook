/*
 * Middleware per i messaggi flash.
 *
 * I messaggi flash sono notifiche temporanee mostrate all'utente dopo
 * un'azione, per esempio login riuscito, accesso negato, risorsa creata
 * o prenotazione annullata.
 *
 * Servono soprattutto dopo un redirect: una rotta salva il messaggio nella
 * sessione con req.flash(type, message), poi reindirizza l'utente a un'altra
 * pagina, dove il messaggio viene letto e mostrato una sola volta.
 *
 * I messaggi vengono salvati in req.session.flash, divisi per tipo
 * (success, error, info). Poi vengono copiati in res.locals.flash, così i
 * template Handlebars possono mostrarli nella pagina.
 *
 * Subito dopo la copia, req.session.flash viene svuotato: questo evita che lo
 * stesso messaggio ricompaia aggiornando la pagina.
 *
 * Questo meccanismo segue il pattern Post/Redirect/Get: dopo una POST il
 * server salva un messaggio, fa redirect verso una GET, e la pagina finale
 * mostra il messaggio temporaneo.
 */

module.exports = function flash(req, res, next) {
  // Inizializzazione "lazy": se la sessione non ha ancora un
  // contenitore per i flash, lo creiamo qui in modo che le rotte
  // possano chiamare req.flash() senza preoccuparsi del primo uso.
  if (!req.session.flash) {
    req.session.flash = {};
  }

  // Funzione helper esposta sulla request. Accumula i messaggi
  // della stessa tipologia in un array così che più chiamate
  // consecutive non si sovrascrivano.
  //
  // Il primo controllo su req.session.flash è necessario perché
  // alcune operazioni (in particolare req.session.regenerate())
  // sostituiscono completamente l'oggetto session con uno nuovo
  // e vuoto: in quel caso il contenitore dei flash va ricreato qui
  // al primo utilizzo.
  req.flash = function (type, message) {
    if (!req.session.flash) {
      req.session.flash = {};
    }
    if (!req.session.flash[type]) {
      req.session.flash[type] = [];
    }
    req.session.flash[type].push(message);
  };

// Espone ai template i messaggi creati nella richiesta precedente.
  res.locals.flash = req.session.flash;

  // Svuotamento immediato della sessione: dopo questa riga ogni
  // nuovo req.flash() della richiesta corrente alimenta un
  // contenitore vuoto, destinato a essere letto nella prossima
  // richiesta (tipico pattern Post/Redirect/Get).
  req.session.flash = {};

  next();
};
