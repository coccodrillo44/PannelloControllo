# 🏰 CosaFare & Rook — Portale Web di Controllo (Admin & Organizzatori)

<div align="center">

![Platform](https://img.shields.io/badge/Platform-Web-blue?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/Language-JavaScript%20ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Backend-Firebase%20RTDB-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Version](https://img.shields.io/badge/Release-v1.4-orange?style=for-the-badge)

<br/>

Portale web centralizzato per la piattaforma **CosaFare / Rook**.  
Offre un'interfaccia a doppio ruolo con autenticazione Google unificata:
1. **Pannello di Amministrazione**: per monitorare KPI globali, gestire segnalazioni, approvare nuovi enti e comunicare con gli organizzatori.
2. **Area Riservata Organizzatore**: per gli enti accreditati, con analytics dei propri post, caricamento eventi con periodi multipli, supporto diretto e gestione del profilo pubblico.

</div>

---

## 📌 Indice
- [🚀 Avvio Rapido](#-avvio-rapido)
- [🔐 Autenticazione & Gestione Ruoli (Google OAuth)](#-autenticazione--gestione-ruoli-google-oauth)
- [🛡️ Funzionalità Area Amministratore](#️-funzionalità-area-amministratore)
- [🏢 Funzionalità Area Organizzatore](#-funzionalità-area-organizzatore)
- [📝 Changelog & Novità v1.4](#-changelog--novità-v14)
- [🛠️ Stack Tecnologico](#️-stack-tecnologico)

---

## 🚀 Avvio Rapido

### Metodo 1: Con Vite / Node.js (Consigliato)
```bash
npm install
npm run dev
```
Avvierà il server locale e aprirà la dashboard su `http://localhost:3000`.

### Metodo 2: Con Python HTTP Server
```bash
python -m http.server 3000
```
Apri poi il browser all'indirizzo `http://localhost:3000`.

---

## 🔐 Autenticazione & Gestione Ruoli (Google OAuth)

L'accesso avviene **esclusivamente tramite Google Sign-In** con rilevamento automatico del ruolo:

1. **Amministratore (`ADMIN`)**:
   - Verifica la presenza dell'account nel nodo `/admins` di Firebase Realtime Database.
   - Sblocca l'accesso a statistiche globali, gestione segnalazioni, catalogo completo ed elenco enti.

2. **Organizzatore (`ORGANIZZATORE`)**:
   - Riconosce automaticamente gli enti verificati nel nodo `/enti/{uid}` o gli utenti con privilegio `isEnte: true` in `/utenti/{uid}`.
   - Sblocca la dashboard organizzatore per la gestione autonoma di eventi, analytics e profilo.

3. **Account con Doppio Ruolo**:
   - Se un utente è registrato sia come Admin sia come Ente Organizzatore, compare un pulsante rapido **"Passa a Organizzatore" / "Passa ad Amministratore"** nella sidebar per commutare istantaneamente visualizzazione.

4. **Inizializzazione Primo Amministratore**:
   - Se il database è appena stato configurato: link *"Non sei ancora abilitato in /admins? Clicca qui"* con master key di sicurezza (`COSAFARE2026`).

---

## 🛡️ Funzionalità Area Amministratore

### 1. Analytics & Statistiche App
- **KPI Globali Live**: Utenti Registrati (`/utenti`), Visitatori Ospite, Eventi Attivi, Media schede eventi visionate per sessione.
- **Grafici Interattivi (Chart.js)**:
  - Frequenza di apertura schede dell'app mobile.
  - Rapporto utenti Registrati vs Ospiti.
  - Trend profondità scroll della Home Feed negli ultimi 7 giorni.
  - Distribuzione eventi per categoria e copertura per le 10 province toscane.

### 2. Segnalazioni & Bug Report
- **Segnalazioni Eventi** (`/reports/events`): Filtri per stato (`IN_ATTESA`, `IN_REVISIONE`, `RISOLTO`, `RESPINTO`) e rimozione diretta di eventi contestati.
- **Bug Report App** (`/reports/bugs`): Monitoraggio anomalie e crash dell'app mobile con livello di severità e dettagli del dispositivo.
- **Generatore Report di Test**: Modale per testare il flusso di segnalazione.

### 3. Centro Messaggistica Live (Chat App)
- Chat bidirezionale collegata in tempo reale al nodo `/chats` di Firebase.
- Filtri tra chat con organizzatori (`ADMIN_ORGANIZZATORE`) e chat eventi (`EVENTO`).
- Interfaccia responsive con notifiche badge e avvio di nuove sessioni di supporto.

### 4. Richieste Abilitazione Enti Organizzatori
- Esame delle richieste inviate dall'app con approvazione o rifiuto immediato.
- L'approvazione crea il record in `/enti/{uid}` e assegna il ruolo organizzatore all'utente.

### 5. Catalogo Eventi & Gestione Enti
- Ricerca e cancellazione diretta di eventi non conformi.
- Elenco enti con biografie, contatti, storico post e possibilità di revoca credenziali.

---

## 🏢 Funzionalità Area Organizzatore

### 1. Analytics Post & Interazioni
- **Metriche Real-Time del proprio Ente**:
  - Totale Eventi Pubblicati (attivi e storici).
  - Totale "Mi Piace" ricevuti (sincronizzati con l'app mobile).
  - Recensioni Ricevute e Media Valutazioni (stelle).
- **Grafico Confronto Engagement**: Istogramma comparativo per ciascun post tra likes, recensioni e interazioni.
- **Tabella di Dettaglio Post**: Analisi puntuale per singolo evento con visualizzazione recensioni e feedback degli utenti.

### 2. Caricamento Eventi con Periodi Multipli
- Form omologo a quello dell'applicazione mobile.
- **Supporto Date Flessibile**:
  - Giorno singolo.
  - Intervallo continuo (data inizio - data fine).
  - **Periodi Multipli Configurabili**: possibilità di aggiungere date e orari discontinui (es. weekend consecutivi o date separate).
- **Autocompletamento & Geocoding**: Ricerca guidata dell'indirizzo con calcolo automatico di latitudine e longitudine e spunta verde di conferma.
- **Classificazione**: Macro-categorie, opzioni per disabili, opzioni vegetariane e animali ammessi.

### 3. Gestione "I Miei Eventi"
- Visualizzazione a schede di tutti gli eventi creati dal proprio ente.
- Filtri rapidi per stato: *Tutti gli Eventi, In Corso Oggi, Futuri, Passati*.
- Ricerca istantanea per titolo e cancellazione con pulizia automatica delle recensioni correlate.

### 4. Supporto Diretto Amministrazione
- Canale di assistenza in tempo reale dedicato con lo staff amministrativo di CosaFare / Rook.
- Invio messaggi con tasto Invio rapido e notifiche badge dei nuovi messaggi in arrivo.

### 5. Gestione Profilo Ente
- **Scheda Identità**: Avatar dinamico, ID univoco, recapiti e badge di verifica *"Verificato da [data]"*.
- **Modifica Dati Ufficiali**:
  - Denominazione Ente / Associazione.
  - Referente responsabile.
  - Email istituzionale e recapito telefonico.
  - Sede operativa e provincia toscana.
  - Biografia pubblica di presentazione per l'app Rook.
- **Aggiornamento a Cascata**: Se il nome dell'ente viene modificato, il sistema aggiorna automaticamente il campo `organizzatore` su tutti i suoi eventi pubblicati nel database.
- **Pulsante Ripristina**: Annullamento rapido delle modifiche non salvate.

---

## 📝 Changelog & Novità v1.4

### 🚀 Release v1.4 (Ottobre 2026)
- **Nuova Area Organizzatore Completa**: Portale dedicato accessibile automaticamente tramite login Google per gli enti autorizzati.
- **Sezione Profilo Ente**: Gestione autonoma del profilo organizzatore e sincronizzazione real-time con l'app mobile Rook.
- **Supporto Eventi a Periodi Multipli**: Gestione di date discontinue per sagre, mostre ed eventi su più fine settimana.
- **Tracciamento Real-Time dei Like**: Integrazione atomica dei contatori dei "Mi Piace" sincronizzati tra Firebase, app e pannello.
- **Geocoding Intelligente**: Ricerca indirizzo con geocoding automatico, rimozione coordinate manuali e feedback visivo con spunta verde.
- **UI & Spaziatura Ottimizzata**: Nuove spaziature tra grafici analytics e tabelle post, form suddiviso in sezioni logiche tematiche.

---

## 🛠️ Stack Tecnologico

- **Frontend**: HTML5 Semantico, Vanilla CSS3 (Custom Properties & Design System Material), JavaScript ES6+ Modules.
- **Backend & Database**: Firebase Realtime Database (`europe-west1`), Firebase Authentication (Google OAuth).
- **Librerie Grafiche & Icone**: Font Awesome 6.x, Chart.js.
- **Hosting / Runtime**: Compatibile con qualsiasi server statico (Vite, Python `http.server`, Node.js, Firebase Hosting).
