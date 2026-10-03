# CosaFare - Pannello di Controllo Amministratore (Web)

Pannello di controllo web riservato agli **amministratori** di CosaFare.
Permette di monitorare l'attività dell'applicazione, gestire le segnalazioni e i bug, e comunicare in tempo reale con gli utenti e gli enti organizzatori tramite il sistema di chat collegato all'app mobile.

---

## 🚀 Avvio Rapido

### Metodo 1: Doppio Clic su `start.bat` (Consigliato per Windows)
Basta fare doppio clic sul file [`start.bat`](file:///C:/Users/matte/OneDrive/Desktop/UNI/@3%20ANNO/Sviluppo%20App%20Mobili/_Progetto/PannelloControllo/start.bat).
Il file avvierà automaticamente il server locale su `http://localhost:3000` e aprirà il browser predefinito.

### Metodo 2: Con Python
```bash
python -m http.server 3000
```
Apri poi il browser all'indirizzo `http://localhost:3000`.

### Metodo 3: Con Vite (Node.js)
```bash
npm install
npm run dev
```

---

## 🔐 Accesso Esclusivo con Google per Amministratori

L'autenticazione è effettuata **esclusivamente tramite Google Sign-In**.

Il pannello verifica i permessi di amministrazione interrogando il nodo `/admins` di **Firebase Realtime Database** europe-west1:
1. **Accesso Google**: L'amministratore accede con il popup ufficiale Google OAuth.
2. **Verifica Privilegi in `/admins`**:
   - Controlla se l'UID dell'account Google è presente in `/admins/{uid}`.
   - Controlla se l'email Google è presente tra i record autorizzati in `/admins`.
3. Se l'account Google non è registrato tra gli amministratori in `/admins`, l'accesso viene bloccato e l'utente viene disconnesso immediatamente con avviso di sicurezza.

### 🔑 Inizializzazione Primo Amministratore
Se il database è appena stato configurato e non è ancora presente alcun record in `/admins`:
- Clicca sul link *"Non sei ancora abilitato in /admins? Clicca qui"* nella schermata di accesso.
- Inserisci l'email del tuo account Google e la chiave di configurazione master (`COSAFARE2026`).
- Verrà creato il record `/admins/{safeKey}` abilitando immediatamente il tuo account Google.

---

## 📊 Funzionalità Incluse

### 1. Analytics & Statistiche App
- **KPI in tempo reale**:
  - Utenti Registrati (conteggio live da `/utenti`).
  - Visitatori Ospite / Sessioni senza account.
  - Catalogo Eventi Attivi.
  - Media schede eventi visionate per sessione nella Home Feed.
- **Grafici Interattivi (Chart.js)**:
  - **Frequenza Schede**: Aperture di Home, Mappa, Social, Messaggi e Profilo.
  - **Rapporto Utenti**: Registrati vs Ospiti anonimi.
  - **Profondità Scroll Home**: Andamento medio degli eventi visualizzati per sessione negli ultimi 7 giorni.
  - **Categorie Eventi**: Distribuzione live per categoria (Musica, Teatro, Sagre, Arte, Sport, ecc.).
  - **Copertura per Provincia**: Distribuzione degli eventi nelle 10 province toscane (Arezzo, Firenze, Grosseto, Livorno, Lucca, Massa-Carrara, Pisa, Pistoia, Prato, Siena).

### 2. Segnalazioni & Bug Report
- **Segnalazioni Eventi** (`/reports/events`):
  - Visualizzazione segnalazioni inviate dagli utenti su eventi specifici (informazioni errate, evento annullato, spam, ecc.).
  - Filtri per stato (`IN_ATTESA`, `IN_REVISIONE`, `RISOLTO`, `RESPINTO`).
  - Azioni rapide: Risolvi, Respingi o **Elimina Evento dal Database**.
- **Bug Report App** (`/reports/bugs`):
  - Monitoraggio anomalie tecniche e crash dell'app mobile con indicazione di versione app, dispositivo/OS e livello di gravità (`CRITICA`, `ALTA`, `MEDIA`, `BASSA`).
  - Aggiornamento stato di lavorazione.
- **Generatore Report di Prova**: Modale integrata per generare segnalazioni di test.

### 3. Centro Messaggistica Live (Chat App)
- **Sincronizzazione Bidirezionale RTDB con l'App**:
  - Collegato direttamente al nodo `/chats` di Firebase.
  - Lista chat divisa tra **Supporto Organizzatore** (`ADMIN_ORGANIZZATORE`) e **Chat Eventi** (`EVENTO`).
  - Interfaccia conversazionale a due colonne (stile Telegram / WhatsApp Web).
  - Invio messaggi con ruolo `ADMIN` ("Amministrazione CosaFare") che appaiono istantaneamente nell'app mobile dell'organizzatore.
  - Pulsante per avviare una nuova chat diretta di assistenza con qualsiasi ente registrato.

### 4. Richieste Abilitazione Enti Organizzatori
- Specchio web del `PannelloAdminActivity` Android.
- Permette di esaminare i dati dell'ente richiedente (referente, email, telefono, sede, descrizione).
- Approvazione immediata (crea la voce in `/enti/{uid}` e abilita l'utente come organizzatore).

### 5. Catalogo Eventi Database
- Tabella interattiva con ricerca per titolo, ente o comune.
- Visualizzazione valutazione media, numero recensioni e data.
- Possibilità di rimozione diretta di eventi non conformi.

### 6. Lista Organizzatori & Biografie
- Visualizzazione di tutti gli enti organizzatori registrati nel database (`/enti`).
- Scheda per ogni organizzatore con contatti (referente, email, telefono, comune e provincia).
- Visualizzazione della **biografia / chi siamo** dell'organizzatore.
- Conteggio degli eventi attivi creati dall'organizzatore.
- Pulsante per avviare una chat di supporto diretta.
- **Pulsante di Eliminazione Organizzatore**: permette di revocare i privilegi di organizzatore, eliminare la scheda ente dal database e aggiornare il profilo utente con richiesta di conferma di sicurezza.
