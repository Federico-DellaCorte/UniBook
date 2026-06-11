/*
 * Rotte di autenticazione di UniBook.
 *
 * Questo file raccoglie tutte le rotte che riguardano l'identità
 * dell'utente: accesso, registrazione e logout.
 *
 * In Express una rotta collega un metodo HTTP e un URL a una funzione.
 * Per esempio, GET /login mostra il form di login, mentre POST /login
 * riceve i dati del form e prova ad autenticare l'utente.
 *
 *   - GET  /login     mostra il modulo di accesso
 *   - POST /login     verifica le credenziali e apre la sessione
 *   - GET  /register  mostra il modulo di registrazione
 *   - POST /register  crea un nuovo utente standard
 *   - POST /logout    rigenera la sessione (logout sicuro)
 *
 *  * Questo file usa:
 *   - userRepo, per leggere e creare utenti nel database;
 *   - bcrypt, per confrontare e generare hash delle password;
 *   - req.session, per salvare l'id dell'utente autenticato;
 *   - req.flash, per mostrare messaggi temporanei dopo redirect.
 * 
 * Mantenere queste rotte in un router dedicato isola la logica di
 * autenticazione dal resto dell'applicazione, semplifica la lettura
 * e tiene il file server.js asciutto.
 */

const express = require('express');
const bcrypt = require('bcrypt');

const userRepo = require('../repositories/userRepo');

const router = express.Router();

/*
 * Costo computazionale usato da bcrypt per generare l'hash delle password.
 *
 * bcrypt non salva mai la password in chiaro: produce un hash, cioè una
 * rappresentazione non reversibile della password.
 *
 * Il cost factor indica quanto deve essere "lento" il calcolo dell'hash.
 * Un valore più alto rende più costosi gli attacchi brute force, ma rende
 * anche più lento login e registrazione. Il valore 10 è una scelta adatta
 * a un progetto didattico perché offre un buon equilibrio tra sicurezza e
 * prestazioni.
 */
const BCRYPT_COST = 10;

/*
 * Espressione regolare di base per il controllo del formato email.
 * Non vuole essere una validazione esaustiva (cosa che richiederebbe
 * una libreria esterna), ma intercetta i casi più comuni: presenza
 * di una sola @, parte locale e dominio non vuoti, e un suffisso
 * dopo l'ultimo punto.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 
 * GET /login
 * 
 *
 * Mostra il form di login.
 *
 * Questa rotta viene usata quando l'utente apre la pagina di accesso dal
 * browser. Non controlla ancora le credenziali: si limita a renderizzare
 * il template views/pages/login.hbs.
 *
 * Se però l'utente è già autenticato, viene reindirizzato direttamente alla
 * dashboard. Questo evita di mostrare di nuovo il form di login a chi ha
 * già una sessione valida.
 */
router.get('/login', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect('/dashboard');
  }
  res.render('pages/login', {
    title: 'Accedi · UniBook',
    values: {},
    errors: {},
  });
});

/* ----------------------------------------------------------------
 * POST /login
 * ----------------------------------------------------------------
 * Verifica le credenziali. La logica è suddivisa in tre fasi:
 *   1. validazione di base dei campi del form;
 *   2. recupero dell'utente dal database e confronto con bcrypt;
 *   3. impostazione della sessione e redirect alla dashboard.
 *
 * In caso di credenziali errate viene mostrato un messaggio
 * generico ("Credenziali non valide.") senza distinguere se è
 * sbagliato lo username o la password: questo evita di rivelare
 * agli aggressori quali account esistano nel sistema.
 */

// Normalizzo i dati ricevuti dal form: trim() elimina spazi inutili
// all'inizio e alla fine di username/email.
router.post('/login', (req, res) => {
  const usernameOrEmail = (req.body.usernameOrEmail || '').trim();
  const password = req.body.password || '';

// Raccolgo gli errori di validazione in un oggetto, così il template
// può mostrare un messaggio vicino al campo specifico.
  const errors = {};
  if (!usernameOrEmail) errors.usernameOrEmail = 'Campo obbligatorio.';
  if (!password) errors.password = 'Campo obbligatorio.';

// Se ci sono errori nei campi obbligatori, il form viene mostrato di nuovo
// con status 400, perché la richiesta contiene dati non validi.  
  if (Object.keys(errors).length > 0) {
    return res.status(400).render('pages/login', {
      title: 'Accedi · UniBook',
      values: { usernameOrEmail },
      errors,
    });
  }

// Cerco l'utente accettando sia username sia email come identificatore.
  const user = userRepo.findByUsernameOrEmail(usernameOrEmail);

// bcrypt.compareSync confronta la password inserita con l'hash salvato.
// La password vera non viene mai recuperata dal database perché non è salvata.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    req.flash('error', 'Credenziali non valide.');
    return res.redirect('/login');
  }

  // Successo: salviamo solo l'id dell'utente in sessione. Il record
  // completo viene ricaricato a ogni richiesta dal middleware
  // loadCurrentUser, in modo che eventuali modifiche al database
  // (cambio ruolo, disattivazione) abbiano effetto immediato senza
  // dover invalidare manualmente la sessione.
  req.session.userId = user.id;
  req.flash('success', 'Accesso effettuato correttamente.');
  res.redirect('/dashboard');
});

/* 
 * GET /register
 *
 * Mostra il form di registrazione.
 *
 * Questa rotta serve agli utenti anonimi che vogliono creare un account.
 * Come per il login, se l'utente è già autenticato non ha senso mostrargli
 * il form di registrazione, quindi viene reindirizzato alla dashboard.
 */
router.get('/register', (req, res) => {
  if (res.locals.currentUser) {
    return res.redirect('/dashboard');
  }
  res.render('pages/register', {
    title: 'Registrati · UniBook',
    values: {},
    errors: {},
  });
});

/* 
 * POST /register
 * Gestisce la creazione di un nuovo account utente.
 *
 * Questa rotta riceve username, email, password e conferma password dal
 * form di registrazione.
 *
 * La procedura è:
 *   1. leggere e normalizzare i dati del form;
 *   2. validare username, email e password;
 *   3. controllare che username ed email non siano già presenti;
 *   4. generare l'hash della password con bcrypt;
 *   5. creare l'utente nel database tramite userRepo;
 *   6. reindirizzare l'utente alla pagina di login con un messaggio flash.
 *
 * Il ruolo dell'utente non viene preso dal form. Un nuovo account creato
 * tramite registrazione è sempre un utente standard. Questo impedisce a un
 * utente di auto-attribuirsi il ruolo admin modificando manualmente la
 * richiesta dal browser.
 */

// Leggo i dati del form. Per username ed email rimuovo gli spazi esterni,
// mentre le password non vengono ripulite con trim per non alterare il valore scelto.
router.post('/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  const passwordConfirm = req.body.passwordConfirm || '';

// Oggetto che raccoglie gli errori dei singoli campi del form.
  const errors = {};

  // Username: presenza e lunghezza minima.
  if (!username) {
    errors.username = 'Campo obbligatorio.';
  } else if (username.length < 3) {
    errors.username = 'Lo username deve avere almeno 3 caratteri.';
  }

  // Email: presenza e formato accettabile.
  if (!email) {
    errors.email = 'Campo obbligatorio.';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Inserisci un indirizzo email valido.';
  }

  // Password: presenza e lunghezza minima.
  if (!password) {
    errors.password = 'Campo obbligatorio.';
  } else if (password.length < 8) {
    errors.password = 'La password deve avere almeno 8 caratteri.';
  }

  // Conferma password: deve essere identica.
  if (!passwordConfirm) {
    errors.passwordConfirm = 'Campo obbligatorio.';
  } else if (password !== passwordConfirm) {
    errors.passwordConfirm = 'Le due password non coincidono.';
  }

  // Unicità: Controllo unicità solo se il campo è già formalmente valido,
  // per non sommare messaggi ridondanti su un campo già errato.
  // I messaggi sono volutamente espliciti e in italiano scorrevole
  // per guidare l'utente verso l'azione corretta.
  if (!errors.username && userRepo.findByUsername(username)) {
    errors.username = 'Questo username è già in uso. Scegline uno diverso.';
  }
  if (!errors.email && userRepo.findByEmail(email)) {
    errors.email = 'Questa email è già associata a un account. Usa un\'altra email oppure accedi.';
  }

  if (Object.keys(errors).length > 0) {
    // Ripresentiamo il modulo con i valori già inseriti (eccetto le
    // password, che non vengono mai rispedite al browser) e gli
    // errori specifici per campo. Lo status code 400 segnala che il
    // server ha rifiutato l'input.
    return res.status(400).render('pages/register', {
      title: 'Registrati · UniBook',
      values: { username, email },
      errors,
    });
  }

  // Hashing della password: bcrypt incorpora un salt casuale
  // nell'hash, quindi a parità di password due utenti avranno hash
  // diversi, neutralizzando le rainbow table.
  const password_hash = bcrypt.hashSync(password, BCRYPT_COST);

  // Creo l'utente nel database. Il repository imposta il ruolo standard.
  userRepo.create({ username, email, password_hash });

  req.flash('success', 'Account creato correttamente. Ora puoi accedere.');
  res.redirect('/login');
});

/*
 * POST /logout
 *
 * Chiude la sessione dell'utente autenticato.
 *
 * Il logout modifica lo stato della sessione, quindi viene gestito con POST
 * e non con GET. Una GET dovrebbe essere usata per operazioni di lettura,
 * mentre il logout è un'azione che cambia lo stato dell'utente.
 *
 * La sessione viene rigenerata con req.session.regenerate(). Questo crea un
 * nuovo identificativo di sessione e rimuove i dati della sessione precedente.
 *
 * Dopo la rigenerazione viene creato un messaggio flash di conferma, così
 * l'utente viene reindirizzato alla homepage e vede il messaggio "Logout
 * effettuato correttamente".
 *
 * Rigenerare la sessione è una misura utile contro la session fixation, cioè
 * il riuso di un identificativo di sessione già noto.
 */
router.post('/logout', (req, res) => {
  req.session.regenerate((err) => {
    if (err) {
      // Anche se la rigenerazione fallisce, riporto comunque l'utente alla homepage
      // invece di lasciarlo bloccato sulla richiesta di logout.
      return res.redirect('/');
    }
    req.flash('success', 'Logout effettuato correttamente.');
    res.redirect('/');
  });
});

module.exports = router;
