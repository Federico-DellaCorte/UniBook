/*
 * File principale del backend UniBook.
 *
 * Questo è il punto di ingresso dell'applicazione: quando eseguo
 * npm start, Node.js avvia questo file e costruisce il server Express.
 *
 * Qui non viene scritta tutta la logica del progetto, ma vengono
 * collegate tra loro le parti principali:
 *   - il motore di template Handlebars, che genera le pagine HTML;
 *   - la cartella public, che contiene CSS e JavaScript lato client;
 *   - il parser dei form HTML;
 *   - le sessioni, usate per mantenere l'utente autenticato;
 *   - i middleware globali, come utente corrente e messaggi flash;
 *   - le rotte, cioè gli URL dell'applicazione;
 *   - la gestione degli errori 404 e 500;
 *   - l'avvio del server sulla porta scelta.
 *
 * L'ordine è fondamentale: in Express ogni richiesta attraversa i
 * middleware e le rotte nello stesso ordine in cui sono registrati.
 * Per esempio, le rotte che usano req.session devono essere registrate
 * dopo il middleware di sessione, altrimenti la sessione non esisterebbe.
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const { engine } = require('express-handlebars');

const loadCurrentUser = require('./middleware/currentUser');
const flash = require('./middleware/flash');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth.routes');
const resourcesRoutes = require('./routes/resources.routes');
const adminResourcesRoutes = require('./routes/admin.resources.routes');
const bookingsRoutes = require('./routes/bookings.routes');
const adminBookingsRoutes = require('./routes/admin.bookings.routes');
const apiRoutes = require('./routes/api.routes');

const app = express();

/*
 * Porta su cui viene avviato il server.
 *
 * Se esiste una variabile d'ambiente PORT, viene usata quella.
 * Se invece non è stata configurata nessuna porta esterna, il server
 * parte automaticamente sulla porta 3000.
 *
 * Questa scelta rende il progetto semplice da avviare in locale:
 * non serve creare un file .env o modificare il codice per far partire
 * l'applicazione.
 */
const PORT = process.env.PORT || 3000;

/*
 * Segreto usato da express-session per firmare il cookie di sessione.
 *
 * Il cookie contiene l'identificativo della sessione dell'utente.
 * La firma serve a impedire che il client possa alterarlo liberamente.
 *
 * In un'applicazione reale questo valore andrebbe salvato in una
 * variabile d'ambiente e non scritto nel codice. In questo progetto,
 * che è locale e didattico, resta nel file per permettere l'avvio
 * immediato senza configurazioni aggiuntive.
 */
const SESSION_SECRET = 'unibook-didactic-session-secret-change-in-production';

/*
 * Durata massima della sessione utente.
 *
 * Il valore è espresso in millisecondi e corrisponde a 4 ore.
 * Dopo questo tempo il cookie di sessione scade e l'utente deve
 * effettuare di nuovo il login.
 *
 * Con l'opzione rolling: true, configurata più sotto, la scadenza viene
 * rinnovata a ogni richiesta: quindi la sessione scade dopo 4 ore di
 * inattività, non dopo 4 ore assolute dal login.
 */
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/*
 * Configurazione di Handlebars come motore di template.
 *
 * Handlebars permette a Express di generare pagine HTML dinamiche.
 * Invece di inviare al browser file HTML statici, il server prende un
 * template .hbs, inserisce dentro i dati ricevuti dal backend e produce
 * HTML finale.
 *
 * app.engine('hbs', ...) dice a Express come deve compilare i file .hbs.
 * app.set('view engine', 'hbs') dice che hbs è il motore di template
 * predefinito.
 * app.set('views', ...) indica dove si trova la cartella views.
 *
 * La cartella views è organizzata così:
 *   - layouts/ contiene la struttura comune delle pagine, come main.hbs;
 *   - pages/ contiene le singole pagine dell'applicazione;
 *   - partials/ contiene piccoli componenti riutilizzabili in più pagine.
 *
 * In pratica, quando una rotta chiama res.render('pages/home'), Express
 * cerca views/pages/home.hbs, lo inserisce dentro il layout main.hbs e
 * restituisce al browser la pagina HTML completa.
 */
app.engine(
  'hbs',
  engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, '..', 'views', 'layouts'),
    partialsDir: path.join(__dirname, '..', 'views', 'partials'),
    helpers: {
      /*
      * Helper Handlebars per confrontare due valori.
      *
      * Handlebars è volutamente semplice e non include direttamente operatori
      * come === dentro i template. Questo helper permette di fare confronti
      * nei file .hbs, per esempio per mostrare un contenuto solo se una
      * categoria è uguale a "aula" oppure se un certo stato è "confirmed".
      *
      * Esempio d'uso nel template:
      * {{#if (eq resource.type "aula")}} ... {{/if}}
      */
      eq: function (a, b) {
        return a === b;
      },
      /*
      * Helper Handlebars per concatenare più valori in una stringa.
      *
      * Serve quando nel template devo costruire dinamicamente il nome di una
      * proprietà. Per esempio posso creare chiavi come "day1_opens_at",
      * "day2_opens_at" e così via, partendo dal numero del giorno.
      *
      * L'ultimo argomento passato da Handlebars non è un valore normale, ma
      * un oggetto tecnico chiamato options; per questo viene rimosso prima
      * della concatenazione.
      */
      concat: function (...args) {
        //Rimuovo l'oggetto options aggiunto automaticamente da Handlebars,
        // perché non deve far parte della stringa finale.
        args.pop();
        return args.join('');
      },
    },
  })
);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '..', 'views'));

/*
 * Espone la cartella public al browser.
 *
 * Tutti i file dentro public/ diventano raggiungibili direttamente dal
 * client. Questo è il modo in cui il browser scarica il CSS e il
 * JavaScript lato client.
 *
 * Per esempio:
 *   public/css/styles.css  ->  /css/styles.css
 *   public/js/file.js      ->  /js/file.js
 *
 * Questi file non passano da una rotta specifica e non vengono compilati
 * da Handlebars: sono file statici serviti così come sono.
 */
app.use(express.static(path.join(__dirname, '..', 'public')));

/*
 * Parser dei dati inviati dai form HTML.
 *
 * Quando l'utente invia un form, per esempio login, registrazione o
 * creazione di una risorsa, il browser manda i dati nel body della
 * richiesta HTTP.
 *
 * express.urlencoded legge quel body e lo trasforma in req.body, cioè
 * un oggetto JavaScript accessibile dalle rotte.
 *
 * Senza questo middleware, nelle rotte non potrei leggere dati come:
 * req.body.username, req.body.password, req.body.name.
 *
 * extended: false è sufficiente perché i form del progetto inviano
 * dati semplici, cioè coppie chiave-valore.
 */
app.use(express.urlencoded({ extended: false }));

/*
 * Configurazione delle sessioni utente.
 *
 * HTTP è un protocollo stateless: ogni richiesta è indipendente e il
 * server, da solo, non ricorderebbe chi ha fatto login.
 *
 * express-session risolve questo problema creando una sessione lato
 * server e collegandola al browser tramite un cookie firmato.
 *
 * In UniBook la sessione contiene informazioni come l'id dell'utente
 * autenticato. In questo modo, dopo il login, l'utente resta riconosciuto
 * nelle richieste successive.
 *
 * Opzioni principali:
 *   - name: nome del cookie di sessione;
 *   - secret: valore usato per firmare il cookie;
 *   - resave: false evita salvataggi inutili se la sessione non cambia;
 *   - saveUninitialized: false evita di creare sessioni vuote;
 *   - rolling: true rinnova la scadenza del cookie a ogni richiesta;
 *   - httpOnly: true impedisce a JavaScript lato client di leggere il cookie;
 *   - sameSite: 'lax' riduce il rischio di richieste cross-site indesiderate;
 *   - maxAge: durata massima della sessione.
 *
 * Questo blocco è fondamentale per login, logout, protezione delle rotte
 * e distinzione tra utente anonimo, utente standard e amministratore.
 */
app.use(
  session({
    name: 'unibook.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    },
  })
);

/*
 * Middleware che carica l'utente corrente.
 *
 * Dopo che la sessione è stata inizializzata, questo middleware controlla
 * se nella sessione esiste un userId. Se esiste, recupera l'utente dal
 * database e lo rende disponibile come res.locals.currentUser.
 *
 * res.locals è importante perché i suoi valori sono accessibili sia nelle
 * rotte successive sia nei template Handlebars.
 *
 * In questo modo le pagine possono sapere se l'utente è loggato e quale
 * ruolo ha, senza dover ripetere la stessa query in ogni rotta.
 */
app.use(loadCurrentUser);

/*
 * Middleware per i messaggi flash.
 *
 * I messaggi flash sono notifiche temporanee mostrate all'utente dopo
 * un'azione, per esempio "Login effettuato", "Risorsa creata" oppure
 * "Non hai i permessi per accedere".
 *
 * Di solito vengono salvati nella sessione durante una richiesta e
 * mostrati nella richiesta successiva, dopo un redirect.
 *
 * Questo middleware espone req.flash() alle rotte e rende i messaggi
 * disponibili ai template tramite res.locals.flash.
 */
app.use(flash);

/*
 * Rotta della homepage.
 *
 * Quando il browser richiede GET /, Express renderizza la pagina
 * views/pages/home.hbs usando il layout principale.
 *
 * La homepage può mostrare contenuti diversi in base alla presenza di
 * currentUser: se l'utente non è autenticato mostra accesso e
 * registrazione, se invece è autenticato può indirizzarlo alla dashboard.
 */
app.get('/', (req, res) => {
  res.render('pages/home', {
    title: 'UniBook',
  });
});

/*
 * Monta le rotte di autenticazione.
 *
 * Questo router gestisce le pagine e le azioni legate a:
 *   - registrazione;
 *   - login;
 *   - logout.
 *
 * Viene registrato dopo sessione e flash perché le rotte di autenticazione
 * devono poter creare una sessione, distruggerla e mostrare messaggi
 * temporanei all'utente.
 */
app.use(authRoutes);

/*
 * Rotta della dashboard protetta.
 *
 * Prima dell'handler viene eseguito requireAuth. Questo middleware
 * controlla che l'utente sia autenticato: se non lo è, viene reindirizzato
 * al login.
 *
 * Solo un utente loggato può quindi arrivare al render della dashboard.
 *
 * La variabile isAdmin viene calcolata leggendo il ruolo dell'utente
 * corrente. Il template usa questo valore per mostrare contenuti diversi
 * a seconda che l'utente sia standard oppure amministratore.
 */
app.get('/dashboard', requireAuth, (req, res) => {
  const isAdmin = res.locals.currentUser.role === 'admin';

  res.render('pages/dashboard', {
    title: 'Dashboard · UniBook',
    isAdmin,
  });
});

/*
 * Monta le rotte delle risorse.
 *
 * resourcesRoutes contiene le pagine usate dagli utenti autenticati per
 * consultare le risorse, filtrare, vedere il dettaglio e arrivare alla
 * prenotazione.
 *
 * adminResourcesRoutes contiene invece le funzioni riservate
 * all'amministratore, come creazione, modifica, disattivazione,
 * riattivazione ed eliminazione delle risorse.
 *
 * I controlli di autenticazione e ruolo sono applicati dentro i singoli
 * router, così server.js resta ordinato e non contiene tutta la logica
 * specifica delle risorse.
 */
app.use(resourcesRoutes);
app.use(adminResourcesRoutes);

/*
 * Monta le rotte delle prenotazioni.
 *
 * bookingsRoutes gestisce le funzionalità dell'utente standard:
 * creazione di una prenotazione, visualizzazione delle proprie
 * prenotazioni, cancellazione futura ed export .ics.
 *
 * adminBookingsRoutes gestisce invece la consultazione amministrativa
 * delle prenotazioni, con vista elenco, filtri e calendario.
 *
 * Anche in questo caso server.js si limita a collegare i router: la logica
 * specifica è separata nei file dentro src/routes/.
 */
app.use(bookingsRoutes);
app.use(adminBookingsRoutes);

/*
 * Monta le rotte API usate dal JavaScript lato client.
 *
 * A differenza delle rotte che renderizzano pagine HTML, queste rotte
 * restituiscono dati JSON. Nel progetto vengono usate soprattutto per
 * aggiornare la disponibilità di una risorsa tramite fetch, senza
 * ricaricare tutta la pagina.
 *
 * Le API sono comunque protette: il fatto che una richiesta arrivi da
 * JavaScript nel browser non significa che si possa saltare il controllo
 * server-side.
 */
app.use(apiRoutes);

/*
 * Gestione degli errori 404 e 500.
 *
 * Questi middleware devono stare alla fine del file, dopo tutte le rotte.
 * Se Express arriva qui significa che nessuna rotta precedente ha gestito
 * la richiesta oppure che si è verificato un errore non gestito.
 *
 * Il 404 viene usato quando l'URL richiesto non esiste.
 * Il 500 viene usato quando si verifica un errore interno del server.
 *
 * Il progetto distingue tra richieste normali e richieste API:
 *   - se il percorso inizia con /api/, la risposta è JSON;
 *   - negli altri casi viene renderizzata una pagina HTML.
 *
 * Questa distinzione serve perché le API sono consumate da fetch, mentre
 * le pagine normali sono viste direttamente dall'utente nel browser.
 */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  res.status(404).render('pages/404', {
    title: 'Pagina non trovata · UniBook',
    requestedPath: req.originalUrl,
  });
});

// La firma a quattro parametri (err, req, res, next) è il modo in
// cui Express riconosce un error-handler: l'omissione di 'next'
// trasformerebbe la funzione in un middleware normale e l'errore
// non arriverebbe mai qui. 'next' va dichiarato anche se non viene
// chiamato esplicitamente in questa implementazione.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[UniBook] errore non gestito:', err);
  // Se la risposta è già stata inviata (ad esempio l'errore è
  // stato lanciato dopo res.write/res.send), delegate al gestore
  // di default di Express, che si limita a chiudere la connessione
  // senza tentare nuove scritture sull'header.
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Errore interno del server' });
  }
  res.status(500).render('pages/500', {
    title: 'Errore · UniBook',
  });
});

/*
 * Avvio del server Express.
 *
 * app.listen apre una porta TCP e mette l'applicazione in ascolto.
 * Da questo momento il browser può inviare richieste a localhost sulla
 * porta configurata.
 *
 * Il messaggio in console serve solo allo sviluppatore: conferma che il
 * server è partito e indica l'indirizzo da aprire nel browser.
 */
app.listen(PORT, () => {
  console.log(`UniBook in ascolto su http://localhost:${PORT}`);
});
