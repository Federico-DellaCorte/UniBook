/*
 * Middleware di protezione per le pagine riservate agli utenti autenticati.
 *
 * Questo file serve a impedire che un utente anonimo acceda a pagine che
 * richiedono il login, come dashboard, risorse, prenotazioni o area personale.
 *
 * Il controllo non si basa direttamente su req.session.userId, ma su
 * res.locals.currentUser. Questo valore viene preparato prima dal middleware
 * currentUser.js: se currentUser esiste, significa che nella sessione c'era
 * un userId valido e che l'utente corrispondente è stato trovato nel database.
 *
 * Se currentUser è presente, la richiesta può continuare verso la rotta
 * richiesta tramite next().
 *
 * Se currentUser non è presente, l'utente non è autenticato oppure la sua
 * sessione non è più valida. In questo caso il middleware:
 *   - salva un messaggio flash di errore;
 *   - reindirizza il browser alla pagina di login.
 *
 * Questo controllo è server-side: anche se un utente provasse a scrivere
 * manualmente l'URL nel browser, non potrebbe superare la protezione senza
 * una sessione valida.
 * 
 */

module.exports = function requireAuth(req, res, next) {
  if (res.locals.currentUser) {
    return next();
  }

  req.flash('error', 'Devi effettuare l\'accesso per visualizzare questa pagina.');
  res.redirect('/login');
};
