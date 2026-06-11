/*
 * Protezione delle rotte riservate agli amministratori.
 *
 * Questo controllo viene usato davanti alle pagine e alle azioni admin,
 * cioè quelle che permettono di gestire risorse e prenotazioni a livello
 * globale. Un utente standard non deve poter creare, modificare,
 * disattivare o eliminare risorse, perché queste operazioni hanno effetto
 * sull'intero sistema.
 *
 * Il controllo si basa su res.locals.currentUser, preparato prima da
 * currentUser.js. Se currentUser non esiste, significa che la richiesta
 * arriva da un utente anonimo o da una sessione non più valida: in questo
 * caso viene mostrato un messaggio flash e il browser viene reindirizzato
 * alla pagina di login.
 *
 * Se invece l'utente esiste ma il suo ruolo non è "admin", la richiesta
 * viene bloccata comunque: l'utente è autenticato, ma non autorizzato.
 * In questo caso viene mandato alla dashboard con un messaggio di errore.
 *
 * Distinguere questi due casi è importante:
 *   - chi non è loggato deve prima autenticarsi;
 *   - chi è loggato ma non è admin deve sapere che non ha i permessi.
 *
 * Se entrambi i controlli sono superati, next() lascia proseguire la
 * richiesta verso la rotta amministrativa richiesta.
 *
 * Questo controllo è server-side: non basta nascondere i link admin
 * nell'interfaccia, perché un utente potrebbe provare a scrivere l'URL
 * manualmente nel browser. La protezione vera deve quindi stare qui.
 */

module.exports = function requireAdmin(req, res, next) {
  const user = res.locals.currentUser;

  if (!user) {
    req.flash('error', 'Devi effettuare l\'accesso per visualizzare questa pagina.');
    return res.redirect('/login');
  }

  if (user.role !== 'admin') {
    req.flash('error', 'Questa sezione è riservata agli amministratori.');
    return res.redirect('/dashboard');
  }

  next();
};
