/*
 * Middleware globale che carica l'utente corrente.
 *
 * In Express un middleware è una funzione intermedia che viene eseguita
 * durante il percorso di una richiesta HTTP, prima che la richiesta arrivi
 * alla rotta finale oppure prima che venga inviata la risposta al browser.
 *
 * In pratica, quando il browser chiede una pagina, la richiesta attraversa
 * una catena di funzioni. Ogni middleware può leggere la richiesta, aggiungere
 * informazioni utili, bloccarla oppure lasciarla proseguire chiamando next().
 *
 * Questo middleware viene usato per collegare la sessione dell'utente al resto
 * dell'applicazione. Dopo il login, infatti, nella sessione non viene salvato
 * tutto l'utente, ma solo il suo identificativo:
 *
 *   req.session.userId
 *
 * Questo id permette al server di ricordare quale utente ha effettuato il login,
 * ma da solo non basta per costruire le pagine o applicare controlli sui ruoli.
 * Per esempio, il progetto deve sapere se l'utente è standard o amministratore,
 * deve poter mostrare il suo nome nella navbar e deve poter decidere quali link
 * o pulsanti mostrare.
 *
 * A ogni richiesta, quindi, questo middleware controlla se nella sessione esiste
 * un userId. Se esiste, usa userRepo.findById() per recuperare dal database il
 * record completo dell'utente.
 *
 * Il record trovato viene salvato in:
 *
 *   res.locals.currentUser
 *
 * res.locals è un oggetto messo a disposizione da Express. I valori salvati lì
 * rimangono disponibili per tutta la durata della richiesta e possono essere
 * usati sia dalle rotte successive sia dai template Handlebars renderizzati con
 * res.render().
 *
 * Grazie a questo meccanismo, ogni pagina può sapere se esiste un currentUser
 * senza dover ripetere manualmente la stessa query in ogni singola rotta.
 *
 * Se invece nella sessione c'è un userId che non corrisponde più a nessun utente,
 * per esempio perché il database è stato cancellato e ricreato, il riferimento
 * viene azzerato impostando req.session.userId = null. In questo modo la sessione
 * non resta incoerente e l'applicazione tratta la richiesta come anonima.
 *
 * Alla fine viene chiamato next(), che lascia proseguire la richiesta verso il
 * middleware o la rotta successiva. Senza next(), Express resterebbe fermo qui e
 * il browser non riceverebbe nessuna risposta.
 */

const userRepo = require('../repositories/userRepo');

module.exports = function loadCurrentUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = userRepo.findById(req.session.userId);
    if (user) {
      res.locals.currentUser = user;
    } else {
      req.session.userId = null;
    }
  }
  next();
};
