/**
 * CosaFare - Admin & Organizer Web Dashboard
 * Fully integrated with Firebase Realtime Database and Firebase Auth
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { 
  getAuth, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  inMemoryPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  push, 
  update, 
  remove, 
  onValue, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

// Chart.js loaded globally via script tag in index.html
const Chart = window.Chart;

// ==========================================================================
// 1. Firebase Initialization (Configuration loaded from firebase-config.js)
// ==========================================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Applica persistenza in-memory per impedire il ripristino automatico silenzioso della sessione al ricaricamento
try {
  setPersistence(auth, inMemoryPersistence);
} catch (e) {
  console.warn('[Auth] Errore configurazione inMemoryPersistence:', e);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ==========================================================================
// 2. Global State
// ==========================================================================

let currentUser = null;
let currentAdminUser = null;
let currentRole = null; // 'ADMIN' | 'ORGANIZZATORE'
let userRolesAvailable = { role: 'NONE', isAdmin: false, isOrganizer: false, organizerData: null };
let userExplicitlyClickedLogin = false;
let currentOrganizerData = null;

let activeChatId = null;
let chatRoomsData = {};
let activeChatListenerUnsub = null;
let rawEventsData = {};
let rawOrganizersData = {};
let rawUsersData = {};
let rawReviewsData = {};

// Chart Instances
let tabChartInstance = null;
let userRatioChartInstance = null;
let scrollTrendChartInstance = null;
let categoryChartInstance = null;
let provinceChartInstance = null;
let orgEngagementChartInstance = null;

// Organizer Form Temp Images
let ceCopertinaBase64 = '';
let ceMenuBase64 = '';
let orgChatListenerUnsub = null;

// ==========================================================================
// 3. UI Selectors
// ==========================================================================

const appLayout = document.getElementById('appLayout');
const authOverlay = document.getElementById('authOverlay');
const authAlert = document.getElementById('authAlert');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const sidebarRoleBadge = document.getElementById('sidebarRoleBadge');
const roleSwitcherContainer = document.getElementById('roleSwitcherContainer');
const btnSwitchRole = document.getElementById('btnSwitchRole');
const roleSwitchBtnText = document.getElementById('roleSwitchBtnText');

const adminNavGroup = document.getElementById('adminNavGroup');
const organizerNavGroup = document.getElementById('organizerNavGroup');

const adminNameDisplay = document.getElementById('adminName');
const adminEmailDisplay = document.getElementById('adminEmailDisplay');
const adminAvatar = document.getElementById('adminAvatar');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const refreshDataBtn = document.getElementById('refreshDataBtn');

// Modals
const modalNewChat = document.getElementById('modalNewChat');
const modalTestReport = document.getElementById('modalTestReport');
const modalEventReviews = document.getElementById('modalEventReviews');
const selectOrganizerForChat = document.getElementById('selectOrganizerForChat');
const btnConfirmStartChat = document.getElementById('btnConfirmStartChat');
const btnNewTestReport = document.getElementById('btnNewTestReport');
const btnSubmitTestReport = document.getElementById('btnSubmitTestReport');

// Chat UI (Admin)
const chatRoomsList = document.getElementById('chatRoomsList');
const chatEmptyPlaceholder = document.getElementById('chatEmptyPlaceholder');
const chatActiveContainer = document.getElementById('chatActiveContainer');
const chatMessagesBody = document.getElementById('chatMessagesBody');
const chatSendForm = document.getElementById('chatSendForm');
const chatInputText = document.getElementById('chatInputText');
const activeChatTitle = document.getElementById('activeChatTitle');
const activeChatBadge = document.getElementById('activeChatBadge');
const activeChatSubtext = document.getElementById('activeChatSubtext');
const activeChatAvatar = document.getElementById('activeChatAvatar');
const btnDeleteChatRoom = document.getElementById('btnDeleteChatRoom');
const btnNewAdminChat = document.getElementById('btnNewAdminChat');

// Toast
const toastContainer = document.getElementById('toastContainer');

// ==========================================================================
// 4. Utility Functions & Notifications
// ==========================================================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showAuthAlert(message, type = 'error') {
  authAlert.textContent = message;
  authAlert.className = `auth-alert ${type}`;
  authAlert.classList.remove('hidden');
}

function hideAuthAlert() {
  authAlert.classList.add('hidden');
  authAlert.textContent = '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Adesso';
  if (minutes < 60) return `${minutes}m fa`;
  if (hours < 24) return `${hours}h fa`;
  if (days < 7) return `${days}g fa`;

  const d = new Date(timestamp);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatClockTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Geohash standard Base32 encoder matching Rook's GeoHashUtils
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_BITS = [16, 8, 4, 2, 1];

function encodeGeohash(latitude, longitude, precision = 8) {
  let latMin = -90.0, latMax = 90.0;
  let lngMin = -180.0, lngMax = 180.0;
  let geohash = '';
  let isEven = true;
  let bit = 0;
  let ch = 0;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lngMin + lngMax) / 2.0;
      if (longitude >= mid) {
        ch |= GEOHASH_BITS[bit];
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2.0;
      if (latitude >= mid) {
        ch |= GEOHASH_BITS[bit];
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;

    if (bit < 4) {
      bit++;
    } else {
      geohash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

function isCategoriaCibo(categoria) {
  if (!categoria) return false;
  const c = categoria.trim().toLowerCase();
  return c === 'cibo & sagre' || c === 'cibo e sagre' || c === 'sagre' || c === 'street food';
}

function formatEventDate(ev) {
  if (ev.date && Array.isArray(ev.date) && ev.date.length > 0) {
    if (ev.date.length === 1) {
      const d = ev.date[0];
      const s = new Date(d.dataInizio).toLocaleDateString('it-IT');
      const e = new Date(d.dataFine).toLocaleDateString('it-IT');
      return s === e ? s : `${s} - ${e}`;
    } else {
      const intervalsStr = ev.date.map(d => {
        const s = new Date(d.dataInizio).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
        const e = new Date(d.dataFine).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
        return s === e ? s : `${s}-${e}`;
      }).join(', ');
      return `${ev.date.length} periodi: ${intervalsStr}`;
    }
  }
  if (ev.data) {
    return new Date(ev.data).toLocaleDateString('it-IT');
  }
  return 'Data da definire';
}

// ==========================================================================
// 5. Authentication, Role Determination & Gatekeeper
// ==========================================================================

async function determineUserRole(uid, email) {
  let isAdmin = false;
  let isOrganizer = false;
  let organizerData = null;

  // 1. Check Admins
  try {
    const adminsSnapshot = await get(ref(db, 'admins'));
    if (adminsSnapshot.exists()) {
      if (adminsSnapshot.hasChild(uid)) {
        isAdmin = true;
      }
      if (!isAdmin && email) {
        const emailTrim = email.trim().toLowerCase();
        adminsSnapshot.forEach((child) => {
          const val = child.val();
          if (typeof val === 'string' && val.trim().toLowerCase() === emailTrim) isAdmin = true;
          else if (val && val.email && val.email.trim().toLowerCase() === emailTrim) isAdmin = true;
        });
      }
    }
  } catch (e) {
    console.error('Errore verifica admin:', e);
  }

  // 2. Check Organizzatori (/enti e /utenti)
  try {
    const entiSnapshot = await get(ref(db, 'enti'));
    if (entiSnapshot.exists()) {
      // Direct match by UID in /enti/{uid}
      if (entiSnapshot.hasChild(uid)) {
        isOrganizer = true;
        organizerData = { id: uid, ...entiSnapshot.child(uid).val() };
      }

      // Check by emailEnte
      if (!isOrganizer && email) {
        const emailTrim = email.trim().toLowerCase();
        entiSnapshot.forEach((child) => {
          const val = child.val() || {};
          if (val.emailEnte && val.emailEnte.trim().toLowerCase() === emailTrim) {
            isOrganizer = true;
            organizerData = { id: child.key, ...val };
          }
        });
      }
    }

    // Check in /utenti/{uid}
    if (!isOrganizer) {
      const userSnapshot = await get(ref(db, `utenti/${uid}`));
      if (userSnapshot.exists()) {
        const uVal = userSnapshot.val() || {};
        if (uVal.isEnte === true) {
          isOrganizer = true;
          if (entiSnapshot.exists() && entiSnapshot.hasChild(uid)) {
            organizerData = { id: uid, ...entiSnapshot.child(uid).val() };
          } else {
            organizerData = {
              id: uid,
              nomeEnte: uVal.username || 'Ente Organizzatore',
              emailEnte: uVal.email || email,
              comuneEnte: uVal.comune || '',
              provinciaEnte: uVal.provincia || ''
            };
          }
        }
      }
    }

    // Check if any /utenti matching email has isEnte === true
    if (!isOrganizer && email) {
      const utentiSnapshot = await get(ref(db, 'utenti'));
      if (utentiSnapshot.exists()) {
        const emailTrim = email.trim().toLowerCase();
        utentiSnapshot.forEach((child) => {
          const uVal = child.val() || {};
          if (uVal.email && uVal.email.trim().toLowerCase() === emailTrim && uVal.isEnte === true) {
            isOrganizer = true;
            if (entiSnapshot.exists() && entiSnapshot.hasChild(child.key)) {
              organizerData = { id: child.key, ...entiSnapshot.child(child.key).val() };
            } else {
              organizerData = {
                id: child.key,
                nomeEnte: uVal.username || 'Ente Organizzatore',
                emailEnte: uVal.email,
                comuneEnte: uVal.comune || '',
                provinciaEnte: uVal.provincia || ''
              };
            }
          }
        });
      }
    }
  } catch (e) {
    console.error('Errore verifica organizzatore:', e);
  }

  let role = 'NONE';
  if (isAdmin && isOrganizer) {
    role = 'BOTH';
  } else if (isAdmin) {
    role = 'ADMIN';
  } else if (isOrganizer) {
    role = 'ORGANIZZATORE';
  }

  return { role, isAdmin, isOrganizer, organizerData };
}

// Function to translate and format Firebase Auth errors clearly
function formatAuthErrorMessage(error) {
  if (!error) return 'Errore sconosciuto';
  switch (error.code) {
    case 'auth/popup-blocked':
      return 'Il browser ha bloccato il popup di Google. È stato avviato il reindirizzamento automatico...';
    case 'auth/popup-closed-by-user':
      return 'Finestra di accesso chiusa prima di completare il login.';
    case 'auth/operation-not-allowed':
      return 'Il provider "Google" non è abilitato nel tuo progetto Firebase. Vai su Firebase Console > Authentication > Metodo di accesso e abilita il provider Google.';
    case 'auth/unauthorized-domain':
      return `Il dominio corrente (${window.location.hostname}) non è autorizzato in Firebase. Accedi usando http://localhost:3000 o aggiungi ${window.location.hostname} nei Domini Autorizzati su Firebase Console > Authentication > Impostazioni.`;
    case 'auth/network-request-failed':
      return 'Errore di connessione di rete verso Google/Firebase. Verifica la tua connessione Internet.';
    case 'auth/cancelled-popup-request':
      return 'Richiesta di login annullata o sovrapposta. Riprova.';
    default:
      return error.message || 'Errore durante l\'autenticazione Google.';
  }
}

// Monitor Auth State
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Se l'utente non ha cliccato esplicitamente "Accedi con Google" (es. token salvato in IndexedDB ripristinato automaticamente)
    if (!userExplicitlyClickedLogin) {
      console.log('[Auth] Disconnessione forzata di credenziali browser residue per garantire il blocco di sicurezza iniziale.');
      await signOut(auth);
      currentUser = null;
      currentAdminUser = null;
      currentRole = null;
      if (appLayout) appLayout.style.display = 'none';
      authOverlay.classList.add('active');
      return;
    }

    const roleInfo = await determineUserRole(user.uid, user.email);

    if (roleInfo.role === 'NONE') {
      const userIdentifier = user.email || user.uid;
      showAuthAlert(`Accesso negato: L'account Google (${userIdentifier}) non è registrato né come Amministratore né come Ente Organizzatore autorizzato su CosaFare.`, 'error');
      showToast(`Accesso negato: account non abilitato`, 'error');
      userExplicitlyClickedLogin = false;
      await signOut(auth);
      currentUser = null;
      currentAdminUser = null;
      currentRole = null;
      if (appLayout) appLayout.style.display = 'none';
      authOverlay.classList.add('active');
      return;
    }

    currentUser = user;
    currentAdminUser = user;
    userRolesAvailable = roleInfo;

    // Imposta ruolo iniziale
    if (roleInfo.role === 'BOTH') {
      currentRole = 'ADMIN';
      currentOrganizerData = roleInfo.organizerData;
    } else if (roleInfo.role === 'ADMIN') {
      currentRole = 'ADMIN';
    } else {
      currentRole = 'ORGANIZZATORE';
      currentOrganizerData = roleInfo.organizerData;
    }

    authOverlay.classList.remove('active');
    hideAuthAlert();
    if (appLayout) appLayout.style.display = 'flex';

    applyActiveRole(currentRole);

    showToast(`Benvenuto, ${user.displayName || user.email}!`, 'success');
  } else {
    currentUser = null;
    currentAdminUser = null;
    currentRole = null;
    userExplicitlyClickedLogin = false;
    if (appLayout) appLayout.style.display = 'none';
    authOverlay.classList.add('active');
  }
});

function applyActiveRole(role) {
  currentRole = role;

  if (role === 'ADMIN') {
    sidebarRoleBadge.textContent = 'ADMIN PANEL';
    sidebarRoleBadge.className = 'badge-role admin';
    adminNavGroup.classList.remove('hidden');
    organizerNavGroup.classList.add('hidden');

    if (roleSwitcherContainer) {
      if (userRolesAvailable.isOrganizer) {
        roleSwitcherContainer.classList.remove('hidden');
        roleSwitchBtnText.textContent = 'Passa a Organizzatore';
      } else {
        roleSwitcherContainer.classList.add('hidden');
      }
    }

    adminNameDisplay.textContent = currentUser?.displayName || 'Amministratore';
    adminEmailDisplay.textContent = currentUser?.email || 'admin@cosafare.it';
    adminAvatar.textContent = (currentUser?.displayName || currentUser?.email || 'A').charAt(0).toUpperCase();

    // Trigger first nav button in admin group
    const firstAdminNav = document.querySelector('#adminNavGroup .nav-item[data-target="view-analytics"]');
    if (firstAdminNav) firstAdminNav.click();

    initializeLiveListeners();
  } else if (role === 'ORGANIZZATORE') {
    sidebarRoleBadge.textContent = 'AREA ENTE';
    sidebarRoleBadge.className = 'badge-role organizer';
    adminNavGroup.classList.add('hidden');
    organizerNavGroup.classList.remove('hidden');

    if (roleSwitcherContainer) {
      if (userRolesAvailable.isAdmin) {
        roleSwitcherContainer.classList.remove('hidden');
        roleSwitchBtnText.textContent = 'Passa ad Admin';
      } else {
        roleSwitcherContainer.classList.add('hidden');
      }
    }

    const orgNome = currentOrganizerData?.nomeEnte || currentUser?.displayName || 'Organizzatore';
    adminNameDisplay.textContent = orgNome;
    adminEmailDisplay.textContent = currentOrganizerData?.emailEnte || currentUser?.email || 'Ente Organizzatore';
    adminAvatar.textContent = orgNome.charAt(0).toUpperCase();

    const ceOrgInput = document.getElementById('ceOrganizzatore');
    if (ceOrgInput) ceOrgInput.value = orgNome;

    // Trigger first nav button in organizer group
    const firstOrgNav = document.querySelector('#organizerNavGroup .nav-item[data-target="view-org-analytics"]');
    if (firstOrgNav) firstOrgNav.click();

    setupOrganizerListeners();
  }
}

// Role Switcher Button
if (btnSwitchRole) {
  btnSwitchRole.addEventListener('click', () => {
    const nextRole = currentRole === 'ADMIN' ? 'ORGANIZZATORE' : 'ADMIN';
    applyActiveRole(nextRole);
    showToast(`Visualizzazione passata a: ${nextRole === 'ADMIN' ? 'Pannello Amministratore' : 'Area Organizzatore'}`, 'info');
  });
}

// Check redirect result on startup if returning from signInWithRedirect
getRedirectResult(auth).catch((error) => {
  console.error('[Auth] Errore Redirect Result:', error);
  showAuthAlert(formatAuthErrorMessage(error), 'error');
});

// Google Login Button Listener
googleLoginBtn.addEventListener('click', async () => {
  console.log('[Auth] Cliccato Accedi con Google');
  hideAuthAlert();

  if (window.location.protocol === 'file:') {
    showAuthAlert("Attenzione: Non puoi effettuare il login aprendo index.html direttamente dal file system (file://). Avvia 'start.bat' e accedi da http://localhost:3000", "error");
    return;
  }

  if (window.location.hostname === '127.0.0.1') {
    showAuthAlert("Attenzione: Firebase autorizza 'localhost' di default, ma non '127.0.0.1'. Ricarica la pagina su http://localhost:3000", "error");
    return;
  }

  const originalHtml = googleLoginBtn.innerHTML;
  googleLoginBtn.disabled = true;
  googleLoginBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Apertura finestra Google...`;

  userExplicitlyClickedLogin = true;

  try {
    showToast('Apertura finestra di autenticazione Google...', 'info');
    await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Popup completato con successo');
  } catch (error) {
    userExplicitlyClickedLogin = false;
    console.error('[Auth] Errore Google Sign-In con popup:', error);

    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      showToast('Popup bloccato. Reindirizzamento alla schermata Google in corso...', 'info');
      try {
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirectError) {
        console.error('[Auth] Errore anche con signInWithRedirect:', redirectError);
        const redirectMsg = formatAuthErrorMessage(redirectError);
        showAuthAlert(`Errore: ${redirectMsg}`, 'error');
        showToast(`Accesso non riuscito: ${redirectMsg}`, 'error');
      }
    } else {
      const msg = formatAuthErrorMessage(error);
      showAuthAlert(`Errore: ${msg}`, 'error');
      showToast(`Accesso non riuscito: ${msg}`, 'error');
    }
  } finally {
    googleLoginBtn.disabled = false;
    googleLoginBtn.innerHTML = originalHtml;
  }
});

// Logout Button Listener
logoutBtn.addEventListener('click', async () => {
  if (confirm('Vuoi davvero uscire dal portale CosaFare?')) {
    userExplicitlyClickedLogin = false;
    await signOut(auth);
    window.location.reload();
  }
});

// ==========================================================================
// 6. Navigation Tabs
// ==========================================================================

const viewTitles = {
  'view-analytics': {
    title: 'Analytics & Statistiche App',
    subtitle: "Monitoraggio in tempo reale dell'attività degli utenti e dell'engagement sull'app CosaFare"
  },
  'view-reports': {
    title: 'Segnalazioni & Bug Report',
    subtitle: "Gestione e risoluzione dei problemi segnalati dagli utenti e anomalie dell'applicazione"
  },
  'view-messages': {
    title: 'Centro Messaggistica Live',
    subtitle: 'Comunica in tempo reale come Amministrazione con gli organizzatori e gli utenti'
  },
  'view-requests': {
    title: 'Richieste Abilitazione Enti',
    subtitle: 'Valuta e approva le richieste degli utenti per diventare organizzatori certificati'
  },
  'view-events': {
    title: 'Catalogo Eventi Database',
    subtitle: 'Panoramica completa di tutti gli eventi registrati su CosaFare'
  },
  'view-organizers': {
    title: 'Elenco Enti Organizzatori',
    subtitle: 'Gestione e monitoraggio di tutti gli enti organizzatori e delle relative biografie'
  },
  'view-org-analytics': {
    title: 'Analytics Post & Interazioni',
    subtitle: "Monitoraggio dell'engagement, mi piace e recensioni per ciascuno dei tuoi eventi"
  },
  'view-org-create-event': {
    title: 'Carica Nuovo Evento',
    subtitle: 'Crea e pubblica un nuovo evento sul catalogo ufficiale di CosaFare'
  },
  'view-org-my-events': {
    title: 'I Miei Eventi',
    subtitle: 'Gestione e consultazione di tutti gli eventi pubblicati dal tuo ente'
  },
  'view-org-chat': {
    title: 'Supporto Amministrazione',
    subtitle: 'Canale di comunicazione diretto in tempo reale con lo staff amministrativo'
  },
  'view-org-profile': {
    title: 'Profilo Organizzatore',
    subtitle: "Visualizza e modifica i dati ufficiali, i recapiti e la presentazione del tuo ente organizzatore sull'app Rook"
  }
};

function setupNavigationListeners() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');

      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.content-view').forEach((view) => {
        view.classList.toggle('active', view.id === targetId);
      });

      if (viewTitles[targetId]) {
        pageTitle.textContent = viewTitles[targetId].title;
        pageSubtitle.textContent = viewTitles[targetId].subtitle;
      }

      // Resize charts on view switch
      if (targetId === 'view-analytics') {
        setTimeout(renderAllCharts, 100);
      }
      if (targetId === 'view-org-analytics') {
        setTimeout(() => {
          if (orgEngagementChartInstance) orgEngagementChartInstance.resize();
        }, 100);
      }
      if (targetId === 'view-org-profile') {
        renderOrganizerProfile();
      }
    });
  });
}
setupNavigationListeners();

// Subtabs in Reports view
document.querySelectorAll('.reports-nav-tabs .tab-btn').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('.reports-nav-tabs .tab-btn').forEach((t) => t.classList.remove('active'));
    tabBtn.classList.add('active');

    const targetSubtab = tabBtn.getAttribute('data-subtab');
    document.querySelectorAll('.subtab-content').forEach((st) => {
      st.classList.toggle('active', st.id === targetSubtab);
    });
  });
});

// Generic Modal Closers
document.querySelectorAll('[data-close-modal]').forEach((closeBtn) => {
  closeBtn.addEventListener('click', () => {
    const modalId = closeBtn.getAttribute('data-close-modal');
    const modalEl = document.getElementById(modalId);
    if (modalEl) modalEl.classList.add('hidden');
  });
});

// ==========================================================================
// 7. Live Listeners & Real-Time Sync
// ==========================================================================

function initializeLiveListeners() {
  setupAnalyticsListeners();
  setupReportsListeners();
  setupRequestsListeners();
  setupChatsListener();
  setupEventsListener();
  setupOrganizersListener();
}

refreshDataBtn.addEventListener('click', () => {
  showToast('Aggiornamento dati in tempo reale...', 'info');
  setupAnalyticsListeners();
});

// ───────────────────────────────────────────────
// A) Analytics Listeners & Charts
// ───────────────────────────────────────────────

let analyticsState = {
  tabViews: { home: 0, mappa: 0, social: 0, messaggi: 0, profilo: 0 },
  registeredUsers: 0,
  guestUsers: 0,
  avgScroll: 0,
  scrollTrend: [0, 0, 0, 0, 0, 0, 0],
  categoryStats: {},
  provinceStats: {}
};

function setupAnalyticsListeners() {
  // 1. Registered Users Count
  onValue(ref(db, 'utenti'), (snapshot) => {
    rawUsersData = snapshot.val() || {};
    analyticsState.registeredUsers = Object.keys(rawUsersData).length;
    document.getElementById('kpiRegisteredUsers').textContent = analyticsState.registeredUsers;
    updateUserRatioChart();
  });

  // 2. Tab Views
  onValue(ref(db, 'analytics/tab_views'), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      analyticsState.tabViews = {
        home: data.home || 0,
        mappa: data.mappa || 0,
        social: data.social || 0,
        messaggi: data.messaggi || 0,
        profilo: data.profilo || 0
      };
    } else {
      analyticsState.tabViews = { home: 0, mappa: 0, social: 0, messaggi: 0, profilo: 0 };
    }
    updateTabFrequencyChart();
  });

  // 3. Scroll Events & Guest sessions
  onValue(ref(db, 'analytics/scroll_events'), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (data.average_scrolled !== undefined && data.average_scrolled !== null) {
        analyticsState.avgScroll = parseFloat(data.average_scrolled).toFixed(1);
        document.getElementById('kpiAvgScroll').textContent = analyticsState.avgScroll;
      }
      if (Array.isArray(data.daily_trend)) {
        analyticsState.scrollTrend = data.daily_trend;
      }
    } else {
      analyticsState.avgScroll = 0;
      document.getElementById('kpiAvgScroll').textContent = '0.0';
      analyticsState.scrollTrend = [0, 0, 0, 0, 0, 0, 0];
    }
    updateScrollTrendChart();
  });

  onValue(ref(db, 'analytics/guests_count'), (snapshot) => {
    if (snapshot.exists()) {
      analyticsState.guestUsers = snapshot.val() || 0;
    } else {
      analyticsState.guestUsers = 0;
    }
    document.getElementById('kpiGuestUsers').textContent = analyticsState.guestUsers;
    updateUserRatioChart();
  });
}

function renderAllCharts() {
  updateTabFrequencyChart();
  updateUserRatioChart();
  updateScrollTrendChart();
  updateCategoryChart();
  updateProvinceChart();
}

// Chart 1: Tab Frequency
function updateTabFrequencyChart() {
  const ctx = document.getElementById('tabFrequencyChart');
  if (!ctx) return;

  const data = [
    analyticsState.tabViews.home,
    analyticsState.tabViews.mappa,
    analyticsState.tabViews.social,
    analyticsState.tabViews.messaggi,
    analyticsState.tabViews.profilo
  ];

  if (tabChartInstance) {
    tabChartInstance.data.datasets[0].data = data;
    tabChartInstance.update();
    return;
  }

  tabChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Home Feed', 'Mappa', 'Social / Preferiti', 'Messaggi', 'Profilo'],
      datasets: [{
        label: 'Visite Schermata',
        data: data,
        backgroundColor: [
          '#cc5500',
          '#3b82f6',
          '#8b5cf6',
          '#10b981',
          '#f59e0b'
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// Chart 2: Registered vs Guests
function updateUserRatioChart() {
  const ctx = document.getElementById('userRatioChart');
  if (!ctx) return;

  const reg = analyticsState.registeredUsers || 0;
  const guest = analyticsState.guestUsers || 0;

  if (userRatioChartInstance) {
    userRatioChartInstance.data.datasets[0].data = [reg, guest];
    userRatioChartInstance.update();
    return;
  }

  userRatioChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Utenti Registrati', 'Visitatori Ospite'],
      datasets: [{
        data: [reg, guest],
        backgroundColor: ['#cc5500', '#94a3b8'],
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      },
      cutout: '70%'
    }
  });
}

// Chart 3: Scroll Events Trend
function updateScrollTrendChart() {
  const ctx = document.getElementById('scrollTrendChart');
  if (!ctx) return;

  const labels = ['6 Giorni Fa', '5 Giorni Fa', '4 Giorni Fa', '3 Giorni Fa', 'L\'altro ieri', 'Ieri', 'Oggi'];

  if (scrollTrendChartInstance) {
    scrollTrendChartInstance.data.datasets[0].data = analyticsState.scrollTrend;
    scrollTrendChartInstance.update();
    return;
  }

  scrollTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Media Eventi Visionati per Sessione',
        data: analyticsState.scrollTrend,
        borderColor: '#cc5500',
        backgroundColor: 'rgba(204, 85, 0, 0.1)',
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#cc5500',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, min: 0, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// Chart 4: Categories
function updateCategoryChart() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  const categories = analyticsState.categoryStats;
  const hasData = Object.keys(categories).length > 0;
  const labels = hasData ? Object.keys(categories) : ['Nessun evento a catalogo'];
  const values = hasData ? Object.values(categories) : [0];
  const bgColors = hasData
    ? ['#cc5500', '#f97316', '#fbbf24', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899']
    : ['#cbd5e1'];

  if (categoryChartInstance) {
    categoryChartInstance.data.labels = labels;
    categoryChartInstance.data.datasets[0].data = values;
    categoryChartInstance.data.datasets[0].backgroundColor = bgColors;
    categoryChartInstance.update();
    return;
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

// Chart 5: Provinces (Toscana)
function updateProvinceChart() {
  const ctx = document.getElementById('provinceChart');
  if (!ctx) return;

  const toscanaProvinces = [
    'Arezzo', 'Firenze', 'Grosseto', 'Livorno', 'Lucca',
    'Massa-Carrara', 'Pisa', 'Pistoia', 'Prato', 'Siena'
  ];
  const provinces = analyticsState.provinceStats || {};
  const values = toscanaProvinces.map(p => provinces[p] || 0);

  if (provinceChartInstance) {
    provinceChartInstance.data.labels = toscanaProvinces;
    provinceChartInstance.data.datasets[0].data = values;
    provinceChartInstance.update();
    return;
  }

  provinceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: toscanaProvinces,
      datasets: [{
        label: 'Eventi',
        data: values,
        backgroundColor: '#cc5500',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, precision: 0 } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ───────────────────────────────────────────────
// B) Event Catalogs Listener
// ───────────────────────────────────────────────

function setupEventsListener() {
  onValue(ref(db, 'eventi'), (snapshot) => {
    rawEventsData = snapshot.val() || {};
    const eventsArray = Object.entries(rawEventsData).map(([id, ev]) => ({ id, ...ev }));

    document.getElementById('kpiActiveEvents').textContent = eventsArray.length;

    // Calculate category breakdown
    const catMap = {};
    const toscanaProvinces = [
      'Arezzo', 'Firenze', 'Grosseto', 'Livorno', 'Lucca',
      'Massa-Carrara', 'Pisa', 'Pistoia', 'Prato', 'Siena'
    ];
    const provMap = {};
    toscanaProvinces.forEach(p => provMap[p] = 0);

    const siglaToNome = {
      'AR': 'Arezzo',
      'FI': 'Firenze',
      'GR': 'Grosseto',
      'LI': 'Livorno',
      'LU': 'Lucca',
      'MS': 'Massa-Carrara',
      'PI': 'Pisa',
      'PT': 'Pistoia',
      'PO': 'Prato',
      'SI': 'Siena'
    };

    eventsArray.forEach((ev) => {
      const cat = ev.categoria || 'Generale';
      catMap[cat] = (catMap[cat] || 0) + 1;

      let p = (ev.provincia || '').trim();
      let matched = null;
      if (siglaToNome[p.toUpperCase()]) {
        matched = siglaToNome[p.toUpperCase()];
      } else {
        const found = toscanaProvinces.find(nome => nome.toLowerCase() === p.toLowerCase());
        if (found) matched = found;
      }

      // Se non trovata per campo provincia, controlla se ev.luogo contiene una provincia toscana
      if (!matched && ev.luogo) {
        const luogoLower = ev.luogo.toLowerCase();
        for (const [sigla, nome] of Object.entries(siglaToNome)) {
          if (luogoLower.includes(`(${sigla.toLowerCase()})`) || luogoLower.includes(nome.toLowerCase())) {
            matched = nome;
            break;
          }
        }
      }

      if (matched) {
        provMap[matched] = (provMap[matched] || 0) + 1;
      }
    });

    analyticsState.categoryStats = catMap;
    analyticsState.provinceStats = provMap;
    updateCategoryChart();
    updateProvinceChart();

    renderEventsTable(eventsArray);
  });
}

function renderEventsTable(events) {
  const tbody = document.getElementById('eventsTableBody');
  if (!tbody) return;

  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 2rem;">Nessun evento presente nel database.</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map((ev) => `
    <tr>
      <td><strong>${escapeHtml(ev.titolo || 'Senza Titolo')}</strong></td>
      <td>${escapeHtml(ev.organizzatore || 'Ente')}</td>
      <td><span class="badge-tag">${escapeHtml(ev.categoria || 'Varie')}</span></td>
      <td>${escapeHtml(ev.luogo || '')} (${escapeHtml(ev.provincia || '-')})</td>
      <td>${escapeHtml(ev.dataInizio || 'N/D')}</td>
      <td><i class="fa-solid fa-star" style="color: #f59e0b;"></i> ${ev.mediaValutazioni ? ev.mediaValutazioni.toFixed(1) : '5.0'} (${ev.numeroRecensioni || 0})</td>
      <td>
        <button class="btn btn-danger-outline btn-sm" onclick="window.deleteEventById('${ev.id}')" title="Elimina evento dal database">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.deleteEventById = async function(eventId) {
  if (!confirm(`Sei sicuro di voler eliminare permanentemente l'evento con ID ${eventId}?`)) return;
  try {
    await remove(ref(db, `eventi/${eventId}`));
    showToast('Evento eliminato con successo.', 'success');
  } catch (err) {
    showToast('Errore durante l\'eliminazione: ' + err.message, 'error');
  }
};

// ───────────────────────────────────────────────
// C) Reports & Bug Reports
// ───────────────────────────────────────────────

let rawEventReports = {};
let rawBugReports = {};

function setupReportsListeners() {
  // 1. Event Reports
  onValue(ref(db, 'reports/events'), (snapshot) => {
    rawEventReports = snapshot.val() || {};
    renderEventReports();
    updateReportsBadges();
  });

  // 2. Bug Reports
  onValue(ref(db, 'reports/bugs'), (snapshot) => {
    rawBugReports = snapshot.val() || {};
    renderBugReports();
    updateReportsBadges();
  });
}

function updateReportsBadges() {
  const pendingEventReports = Object.values(rawEventReports).filter(r => r.stato === 'IN_ATTESA').length;
  const openBugs = Object.values(rawBugReports).filter(b => b.stato === 'APERTO').length;
  const total = pendingEventReports + openBugs;

  const mainBadge = document.getElementById('badgeReportsCount');
  if (total > 0) {
    mainBadge.textContent = total;
    mainBadge.classList.remove('hidden');
  } else {
    mainBadge.classList.add('hidden');
  }

  document.getElementById('badgeSubtabEventReports').textContent = Object.keys(rawEventReports).length;
  document.getElementById('badgeSubtabBugReports').textContent = Object.keys(rawBugReports).length;
}

function renderEventReports() {
  const listEl = document.getElementById('eventReportsList');
  if (!listEl) return;

  const filterStatus = document.getElementById('filterEventReportStatus').value;
  const searchQuery = document.getElementById('searchEventReports').value.trim().toLowerCase();

  const reports = Object.entries(rawEventReports).map(([id, r]) => ({ id, ...r }));
  const filtered = reports.filter((r) => {
    const matchStatus = filterStatus === 'ALL' || (r.stato || 'IN_ATTESA') === filterStatus;
    const matchSearch = !searchQuery || 
      (r.titoloEvento && r.titoloEvento.toLowerCase().includes(searchQuery)) ||
      (r.motivo && r.motivo.toLowerCase().includes(searchQuery)) ||
      (r.dettagli && r.dettagli.toLowerCase().includes(searchQuery));
    return matchStatus && matchSearch;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-clipboard-check"></i>
        <p>Nessuna segnalazione di eventi corrispondente ai filtri.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map((r) => {
    const statoClass = (r.stato || 'in_attesa').toLowerCase();
    return `
      <div class="report-card">
        <div class="report-card-header">
          <div class="report-title-group">
            <h4>${escapeHtml(r.titoloEvento || 'Evento non specificato')}</h4>
            <div class="report-meta-text">
              <span><i class="fa-regular fa-clock"></i> ${formatRelativeTime(r.timestamp)}</span>
              <span>•</span>
              <span><i class="fa-solid fa-triangle-exclamation"></i> Motivo: <strong>${escapeHtml(r.motivo || 'Generico')}</strong></span>
            </div>
          </div>
          <span class="badge-status ${statoClass}">${escapeHtml(r.stato || 'IN_ATTESA')}</span>
        </div>

        <div class="report-desc-box">
          ${escapeHtml(r.dettagli || r.descrizione || 'Nessun dettaglio aggiuntivo fornito.')}
        </div>

        <div class="report-card-footer">
          <div class="report-meta-text">
            <span>Segnalato da: <strong>${escapeHtml(r.segnalatoDa || r.emailUtente || 'Utente')}</strong></span>
            ${r.idEvento ? `<span>• ID Evento: <code>${escapeHtml(r.idEvento)}</code></span>` : ''}
          </div>
          <div class="report-actions">
            <button class="btn btn-secondary btn-sm" onclick="window.updateReportStatus('events', '${r.id}', 'RISOLTO')">
              <i class="fa-solid fa-check"></i> Risolvi
            </button>
            <button class="btn btn-outline btn-sm" onclick="window.updateReportStatus('events', '${r.id}', 'RESPINTO')">
              <i class="fa-solid fa-xmark"></i> Respingi
            </button>
            ${r.idEvento ? `
              <button class="btn btn-danger-outline btn-sm" onclick="window.deleteEventById('${r.idEvento}')" title="Elimina l'evento segnalato dal catalogo">
                <i class="fa-solid fa-trash"></i> Elimina Evento
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBugReports() {
  const listEl = document.getElementById('bugReportsList');
  if (!listEl) return;

  const filterStatus = document.getElementById('filterBugStatus').value;
  const searchQuery = document.getElementById('searchBugReports').value.trim().toLowerCase();

  const bugs = Object.entries(rawBugReports).map(([id, b]) => ({ id, ...b }));
  const filtered = bugs.filter((b) => {
    const matchStatus = filterStatus === 'ALL' || (b.stato || 'APERTO') === filterStatus;
    const matchSearch = !searchQuery ||
      (b.titolo && b.titolo.toLowerCase().includes(searchQuery)) ||
      (b.descrizione && b.descrizione.toLowerCase().includes(searchQuery)) ||
      (b.dispositivo && b.dispositivo.toLowerCase().includes(searchQuery));
    return matchStatus && matchSearch;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-bug-slash"></i>
        <p>Nessun bug report corrispondente ai filtri.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map((b) => {
    const statusClass = (b.stato || 'aperto').toLowerCase();
    return `
      <div class="report-card">
        <div class="report-card-header">
          <div class="report-title-group">
            <h4>${escapeHtml(b.titolo || 'Bug senza titolo')}</h4>
            <div class="report-meta-text">
              <span><i class="fa-regular fa-clock"></i> ${formatRelativeTime(b.timestamp)}</span>
              <span>•</span>
              <span><i class="fa-solid fa-mobile-screen"></i> ${escapeHtml(b.dispositivo || 'Dispositivo Android')}</span>
            </div>
          </div>
          <div>
            <span class="badge-status ${statusClass}">${escapeHtml(b.stato || 'APERTO')}</span>
          </div>
        </div>

        <div class="report-desc-box">
          ${escapeHtml(b.descrizione || 'Nessuna descrizione specificata.')}
        </div>

        <div class="report-card-footer">
          <div class="report-meta-text">
            <span>Versione App: <strong>${escapeHtml(b.versioneApp || '1.0.0')}</strong></span>
            <span>• Inviato da: <code>${escapeHtml(b.emailUtente || 'Utente')}</code></span>
          </div>
          <div class="report-actions">
            <button class="btn btn-secondary btn-sm" onclick="window.updateReportStatus('bugs', '${b.id}', 'RISOLTO')">
              <i class="fa-solid fa-check"></i> Segna Risolto
            </button>
            <button class="btn btn-outline btn-sm" onclick="window.updateReportStatus('bugs', '${b.id}', 'IN_LAVORAZIONE')">
              <i class="fa-solid fa-screwdriver-wrench"></i> In Lavorazione
            </button>
            <button class="btn btn-danger-outline btn-sm" onclick="window.deleteReport('${b.id}', 'bugs')">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Global actions for reports
window.updateReportStatus = async function(type, reportId, newStatus) {
  try {
    await update(ref(db, `reports/${type}/${reportId}`), {
      stato: newStatus,
      updatedAt: Date.now()
    });
    showToast(`Stato aggiornato a ${newStatus}`, 'success');
  } catch (err) {
    showToast('Errore aggiornamento: ' + err.message, 'error');
  }
};

window.deleteReport = async function(reportId, type) {
  if (!confirm('Vuoi rimuovere questa segnalazione?')) return;
  try {
    await remove(ref(db, `reports/${type}/${reportId}`));
    showToast('Segnalazione rimossa.', 'success');
  } catch (err) {
    showToast('Errore eliminazione: ' + err.message, 'error');
  }
};

// Filter event listeners
['filterEventReportStatus', 'searchEventReports'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderEventReports);
});

['filterBugStatus', 'searchBugReports'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderBugReports);
});

// Modal Test Report
btnNewTestReport.addEventListener('click', () => {
  modalTestReport.classList.remove('hidden');
});

const testReportTypeSelect = document.getElementById('testReportType');
testReportTypeSelect.addEventListener('change', () => {
  const isBug = testReportTypeSelect.value === 'BUG';
  document.getElementById('groupTestEventFields').classList.toggle('hidden', isBug);
  document.getElementById('groupTestBugFields').classList.toggle('hidden', !isBug);
});

btnSubmitTestReport.addEventListener('click', async () => {
  const type = testReportTypeSelect.value;
  const desc = document.getElementById('testReportDesc').value.trim();

  if (!desc) {
    alert('Inserisci una descrizione per il report.');
    return;
  }

  try {
    if (type === 'EVENT') {
      const reportsRef = ref(db, 'reports/events');
      const newRef = push(reportsRef);
      await set(newRef, {
        id: newRef.key,
        idEvento: 'evento_demo_' + Date.now().toString().slice(-4),
        titoloEvento: document.getElementById('testEventTitle').value.trim() || 'Festa della Primavera a Vicenza',
        motivo: document.getElementById('testEventReason').value,
        dettagli: desc,
        segnalatoDa: currentAdminUser ? currentAdminUser.email : 'tester@cosafare.it',
        timestamp: Date.now(),
        stato: 'IN_ATTESA'
      });
      showToast('Segnalazione evento inviata con successo!', 'success');
    } else {
      const bugsRef = ref(db, 'reports/bugs');
      const newRef = push(bugsRef);
      await set(newRef, {
        id: newRef.key,
        titolo: document.getElementById('testBugTitle').value.trim() || 'Anomalia visualizzazione mappa',
        gravita: document.getElementById('testBugSeverity')?.value || 'MEDIA',
        dispositivo: document.getElementById('testBugDevice').value.trim() || 'Android 14',
        versioneApp: '1.2.0',
        descrizione: desc,
        emailUtente: currentAdminUser ? currentAdminUser.email : 'tester@cosafare.it',
        timestamp: Date.now(),
        stato: 'APERTO'
      });
      showToast('Bug report inviato con successo!', 'success');
    }

    modalTestReport.classList.add('hidden');
    document.getElementById('testReportDesc').value = '';
  } catch (err) {
    alert('Errore durante il salvataggio su Firebase: ' + err.message);
  }
});

// ───────────────────────────────────────────────
// D) Requests (Richieste Organizzatori)
// ───────────────────────────────────────────────

let rawRequestsData = {};

function setupRequestsListeners() {
  onValue(ref(db, 'richieste_organizzatori'), (snapshot) => {
    rawRequestsData = snapshot.val() || {};
    renderRequests();
  });
}

function renderRequests() {
  const container = document.getElementById('requestsListContainer');
  if (!container) return;

  const requests = Object.entries(rawRequestsData).map(([id, r]) => ({ id, ...r }));
  const pending = requests.filter(r => (r.stato || 'IN_ATTESA') === 'IN_ATTESA');

  document.getElementById('requestsPendingSummary').innerHTML = `In attesa: <strong>${pending.length}</strong>`;

  const badgeNav = document.getElementById('badgeRequestsCount');
  if (pending.length > 0) {
    badgeNav.textContent = pending.length;
    badgeNav.classList.remove('hidden');
  } else {
    badgeNav.classList.add('hidden');
  }

  if (pending.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-check-double"></i>
        <p>Nessuna richiesta organizzatore in attesa di approvazione.</p>
      </div>`;
    return;
  }

  container.innerHTML = pending.map((r) => `
    <div class="request-card">
      <div class="req-header">
        <div class="req-ente-name">${escapeHtml(r.nomeEnte || 'Ente Organizzatore')}</div>
        <span class="badge-status in_attesa">IN ATTESA</span>
      </div>

      <div class="req-body-row">
        <i class="fa-regular fa-user"></i>
        <span>Referente: <strong>${escapeHtml(r.referenteOrg || 'N/D')}</strong></span>
      </div>
      <div class="req-body-row">
        <i class="fa-regular fa-envelope"></i>
        <span>Email: ${escapeHtml(r.emailEnte || r.emailRichiedente || 'N/D')}</span>
      </div>
      <div class="req-body-row">
        <i class="fa-solid fa-phone"></i>
        <span>Telefono: ${escapeHtml(r.telefonoEnte || 'N/D')}</span>
      </div>
      <div class="req-body-row">
        <i class="fa-solid fa-location-dot"></i>
        <span>Sede: ${escapeHtml(r.sedeOrg || r.comuneEnte || '')} (${escapeHtml(r.provinciaEnte || '')})</span>
      </div>

      ${r.descEnte ? `
        <div class="req-desc">
          ${escapeHtml(r.descEnte)}
        </div>
      ` : ''}

      <div class="req-actions">
        <button class="btn btn-primary btn-sm btn-block" onclick="window.handleRequest('${r.id}', '${r.uidUtente || r.id}', 'APPROVATA', '${escapeHtml(r.nomeEnte)}')">
          <i class="fa-solid fa-check"></i> Approva e Abilita Ente
        </button>
        <button class="btn btn-outline btn-sm" onclick="window.handleRequest('${r.id}', '${r.uidUtente || r.id}', 'RIFIUTATA', '${escapeHtml(r.nomeEnte)}')">
          <i class="fa-solid fa-xmark"></i> Rifiuta
        </button>
      </div>
    </div>
  `).join('');
}

window.handleRequest = async function(reqId, uidUtente, newStatus, nomeEnte) {
  try {
    // 1. Update request status in /richieste_organizzatori/{reqId}
    await update(ref(db, `richieste_organizzatori/${reqId}`), {
      stato: newStatus
    });

    if (newStatus === 'APPROVATA') {
      // 2. Also promote user in /enti/{uidUtente}
      await update(ref(db, `enti/${uidUtente}`), {
        uid: uidUtente,
        nomeEnte: nomeEnte,
        abilitato: true,
        dataAbilitazione: Date.now()
      });
      showToast(`Organizzatore "${nomeEnte}" approvato e abilitato con successo!`, 'success');
    } else {
      showToast(`Richiesta di "${nomeEnte}" rifiutata.`, 'info');
    }
  } catch (err) {
    showToast('Errore durante l\'operazione: ' + err.message, 'error');
  }
};

// ───────────────────────────────────────────────
// E) Messaging & Real-Time Chat System
// ───────────────────────────────────────────────

function setupOrganizersListener() {
  onValue(ref(db, 'enti'), (snapshot) => {
    rawOrganizersData = snapshot.val() || {};
    populateOrganizerDropdown();
    renderOrganizersList();
    updateOrganizersBadge();
  });
}

function updateOrganizersBadge() {
  const badge = document.getElementById('badgeOrganizersCount');
  if (!badge) return;
  const count = Object.keys(rawOrganizersData).length;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderOrganizersList() {
  const container = document.getElementById('organizersGrid');
  if (!container) return;

  const searchInput = document.getElementById('searchOrganizersInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const organizers = Object.entries(rawOrganizersData).map(([uid, org]) => ({ uid, ...org }));

  const filtered = organizers.filter((org) => {
    if (!query) return true;
    const nome = (org.nomeEnte || '').toLowerCase();
    const bio = (org.descEnte || org.bio || org.descrizione || '').toLowerCase();
    const referente = (org.referenteOrg || '').toLowerCase();
    const email = (org.emailEnte || '').toLowerCase();
    const sede = (org.sedeOrg || org.comuneEnte || org.provinciaEnte || '').toLowerCase();
    return nome.includes(query) || bio.includes(query) || referente.includes(query) || email.includes(query) || sede.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-users-slash"></i>
        <p>Nessun organizzatore trovato con i criteri di ricerca correnti.</p>
      </div>`;
    return;
  }

  // Count active events per organizer
  const eventsList = Object.values(rawEventsData || {});

  container.innerHTML = filtered.map((org) => {
    const nomeEnte = org.nomeEnte || 'Ente Organizzatore';
    const bio = (org.descEnte || org.bio || org.descrizione || '').trim();
    const initial = nomeEnte.charAt(0).toUpperCase();

    const sedeParts = [];
    if (org.comuneEnte || org.sedeOrg) sedeParts.push(org.comuneEnte || org.sedeOrg);
    if (org.provinciaEnte) sedeParts.push(`(${org.provinciaEnte})`);
    const sedeStr = sedeParts.join(' ') || 'Sede non specificata';

    // Count events created by this organizer
    const orgEventsCount = eventsList.filter(
      (ev) => (ev.organizzatore && ev.organizzatore.toLowerCase() === nomeEnte.toLowerCase()) || ev.idOrganizzatore === org.uid
    ).length;

    return `
      <div class="organizer-card">
        <div class="org-card-header">
          <div class="org-avatar">${initial}</div>
          <div class="org-header-info">
            <h4 class="org-name">${escapeHtml(nomeEnte)}</h4>
            <div class="org-location">
              <i class="fa-solid fa-location-dot"></i>
              <span>${escapeHtml(sedeStr)}</span>
            </div>
          </div>
          <span class="badge-tag admin">${orgEventsCount} ${orgEventsCount === 1 ? 'Evento' : 'Eventi'}</span>
        </div>

        <div class="org-details-list">
          ${org.referenteOrg ? `
            <div class="org-detail-row">
              <i class="fa-regular fa-user"></i>
              <span>Referente: <strong>${escapeHtml(org.referenteOrg)}</strong></span>
            </div>
          ` : ''}
          ${org.emailEnte ? `
            <div class="org-detail-row">
              <i class="fa-regular fa-envelope"></i>
              <span>Email: <a href="mailto:${escapeHtml(org.emailEnte)}">${escapeHtml(org.emailEnte)}</a></span>
            </div>
          ` : ''}
          ${org.telefonoEnte ? `
            <div class="org-detail-row">
              <i class="fa-solid fa-phone"></i>
              <span>Telefono: ${escapeHtml(org.telefonoEnte)}</span>
            </div>
          ` : ''}
        </div>

        <div class="org-bio-section">
          <div class="org-bio-label"><i class="fa-solid fa-circle-info"></i> Biografia / Chi Siamo:</div>
          <div class="org-bio-text ${!bio ? 'empty' : ''}">
            ${bio ? escapeHtml(bio) : '<em>Nessuna biografia inserita da questo organizzatore.</em>'}
          </div>
        </div>

        <div class="org-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.startChatWithOrganizer('${org.uid}', '${escapeHtml(nomeEnte)}')">
            <i class="fa-solid fa-comment-dots"></i> Invia Messaggio
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="window.deleteOrganizer('${org.uid}', '${escapeHtml(nomeEnte)}')">
            <i class="fa-solid fa-trash"></i> Elimina Organizzatore
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteOrganizer = async function(uid, nomeEnte) {
  const confirmed = confirm(
    `Sei sicuro di voler eliminare permanentemente l'organizzatore "${nomeEnte}"?\n\n` +
    `Questa azione:\n` +
    `1. Eliminerà la scheda ente da /enti/${uid}\n` +
    `2. Revocherà i permessi di organizzatore per l'utente in /utenti/${uid}\n` +
    `3. Aggiornerà lo stato in /richieste_organizzatori come REVOCATA`
  );

  if (!confirmed) return;

  try {
    // 1. Delete from /enti/{uid}
    await remove(ref(db, `enti/${uid}`));

    // 2. Revoke privileges in /utenti/{uid}
    try {
      await update(ref(db, `utenti/${uid}`), {
        isEnte: false
      });
    } catch (e) {
      console.warn('Utente non aggiornabile:', e);
    }

    // 3. Mark request as REVOCATA if exists
    try {
      await update(ref(db, `richieste_organizzatori/${uid}`), {
        stato: 'REVOCATA'
      });
    } catch (e) {}

    showToast(`Organizzatore "${nomeEnte}" eliminato con successo.`, 'success');
  } catch (err) {
    console.error('Errore eliminazione organizzatore:', err);
    showToast(`Errore durante l'eliminazione: ${err.message}`, 'error');
  }
};

window.startChatWithOrganizer = function(uid, nomeEnte) {
  const chatId = `admin_${uid}`;
  const now = Date.now();

  update(ref(db, `chats/${chatId}`), {
    id: chatId,
    tipo: 'ADMIN_ORGANIZZATORE',
    idOrganizzatore: uid,
    nomeOrganizzatore: nomeEnte,
    ultimoMessaggio: 'Canale aperto dall\'amministrazione',
    timestampUltimoMessaggio: now
  });

  document.querySelector('[data-target="view-messages"]').click();
  setTimeout(() => {
    window.selectChatRoom(chatId);
  }, 250);
};

// Search listener
const searchOrganizersInput = document.getElementById('searchOrganizersInput');
if (searchOrganizersInput) {
  searchOrganizersInput.addEventListener('input', renderOrganizersList);
}

function populateOrganizerDropdown() {
  if (!selectOrganizerForChat) return;
  selectOrganizerForChat.innerHTML = '<option value="">Seleziona un ente organizzatore...</option>';

  Object.entries(rawOrganizersData).forEach(([uid, org]) => {
    const opt = document.createElement('option');
    opt.value = uid;
    opt.textContent = org.nomeEnte || `Organizzatore (${uid.slice(0, 6)})`;
    opt.dataset.nome = org.nomeEnte || 'Organizzatore';
    selectOrganizerForChat.appendChild(opt);
  });
}

function setupChatsListener() {
  onValue(ref(db, 'chats'), (snapshot) => {
    chatRoomsData = snapshot.val() || {};
    renderChatRoomsList();
  });
}

let chatFilterMode = 'ALL';
document.querySelectorAll('.chat-filter-pills .pill-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chat-filter-pills .pill-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    chatFilterMode = btn.getAttribute('data-chat-filter');
    renderChatRoomsList();
  });
});

document.getElementById('chatSearchInput').addEventListener('input', renderChatRoomsList);

function renderChatRoomsList() {
  const searchQuery = document.getElementById('chatSearchInput').value.trim().toLowerCase();

  const rooms = Object.entries(chatRoomsData).map(([id, room]) => ({ id, ...room }));

  // Sort descending by timestampUltimoMessaggio
  rooms.sort((a, b) => (b.timestampUltimoMessaggio || 0) - (a.timestampUltimoMessaggio || 0));

  const filtered = rooms.filter((r) => {
    const matchFilter = chatFilterMode === 'ALL' || (r.tipo || 'EVENTO') === chatFilterMode;
    const matchSearch = !searchQuery ||
      (r.nomeOrganizzatore && r.nomeOrganizzatore.toLowerCase().includes(searchQuery)) ||
      (r.nomeUtente && r.nomeUtente.toLowerCase().includes(searchQuery)) ||
      (r.titoloEvento && r.titoloEvento.toLowerCase().includes(searchQuery));
    return matchFilter && matchSearch;
  });

  if (filtered.length === 0) {
    chatRoomsList.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i class="fa-regular fa-comment-dots" style="font-size: 2rem;"></i>
        <p style="font-size: 0.85rem;">Nessuna conversazione trovata.</p>
      </div>`;
    return;
  }

  chatRoomsList.innerHTML = filtered.map((r) => {
    const isActive = r.id === activeChatId;
    const isAdminOrg = r.tipo === 'ADMIN_ORGANIZZATORE';
    const title = isAdminOrg 
      ? (r.nomeOrganizzatore || 'Organizzatore') 
      : (r.titoloEvento || r.nomeUtente || 'Chat Evento');
    const preview = r.ultimoMessaggio || 'Nessun messaggio';
    const timeStr = formatRelativeTime(r.timestampUltimoMessaggio);
    const initial = title.charAt(0).toUpperCase();

    return `
      <button class="chat-room-item ${isActive ? 'active' : ''}" onclick="window.selectChatRoom('${r.id}')">
        <div class="room-avatar ${isAdminOrg ? 'admin-org' : ''}">
          ${initial}
        </div>
        <div class="room-info">
          <div class="room-title-row">
            <span class="room-title">${escapeHtml(title)}</span>
            <span class="room-time">${timeStr}</span>
          </div>
          <div class="room-subtitle-row">
            <span class="room-preview">${escapeHtml(preview)}</span>
            <span class="badge-tag ${isAdminOrg ? 'admin' : ''}">${isAdminOrg ? 'Supporto' : 'Evento'}</span>
          </div>
        </div>
      </button>
    `;
  }).join('');
}

window.selectChatRoom = function(chatId) {
  activeChatId = chatId;
  renderChatRoomsList();

  const room = chatRoomsData[chatId];
  if (!room) return;

  chatEmptyPlaceholder.classList.add('hidden');
  chatActiveContainer.classList.remove('hidden');

  const isAdminOrg = room.tipo === 'ADMIN_ORGANIZZATORE';
  const title = isAdminOrg 
    ? (room.nomeOrganizzatore || 'Organizzatore') 
    : (room.titoloEvento || 'Chat Evento');

  activeChatTitle.textContent = title;
  activeChatBadge.textContent = isAdminOrg ? 'Supporto Organizzatore' : `Evento: ${room.titoloEvento || 'In corso'}`;
  activeChatSubtext.textContent = `ID: ${room.id} • ${room.nomeUtente ? `Utente: ${room.nomeUtente}` : ''}`;
  activeChatAvatar.textContent = title.charAt(0).toUpperCase();

  // Listen for real-time messages in this room
  listenToActiveRoomMessages(chatId);
};

function listenToActiveRoomMessages(chatId) {
  if (activeChatListenerUnsub) {
    activeChatListenerUnsub();
    activeChatListenerUnsub = null;
  }

  const messagesRef = ref(db, `chats/${chatId}/messages`);
  activeChatListenerUnsub = onValue(messagesRef, (snapshot) => {
    const msgsObj = snapshot.val() || {};
    const msgsList = Object.entries(msgsObj).map(([id, m]) => ({ id, ...m }));

    // Sort by timestamp
    msgsList.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    renderChatMessages(msgsList);
  });
}

function renderChatMessages(messages) {
  if (messages.length === 0) {
    chatMessagesBody.innerHTML = `
      <div class="empty-state" style="margin: auto;">
        <i class="fa-regular fa-comment" style="font-size: 2rem;"></i>
        <p>Non ci sono ancora messaggi in questa conversazione.<br>Scrivi una risposta per iniziare!</p>
      </div>`;
    return;
  }

  chatMessagesBody.innerHTML = messages.map((m) => {
    const isAdmin = m.senderRole === 'ADMIN';
    const senderDisplay = isAdmin 
      ? 'Tu (Amministrazione CosaFare)' 
      : `${m.senderName || 'Interlocutore'} (${m.senderRole || 'UTENTE'})`;

    return `
      <div class="message-bubble ${isAdmin ? 'admin-msg' : 'other-msg'}">
        <div class="msg-sender">${escapeHtml(senderDisplay)}</div>
        <div class="msg-text">${escapeHtml(m.testo)}</div>
        <div class="msg-time">${formatClockTime(m.timestamp)}</div>
      </div>
    `;
  }).join('');

  // Auto-scroll to bottom
  chatMessagesBody.scrollTop = chatMessagesBody.scrollHeight;
}

// Send Message
chatSendForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeChatId) return;

  const text = chatInputText.value.trim();
  if (!text) return;

  const room = chatRoomsData[activeChatId] || {};
  const currentUid = currentAdminUser ? currentAdminUser.uid : 'admin_web';
  const now = Date.now();

  try {
    const messagesRef = ref(db, `chats/${activeChatId}/messages`);
    const newMsgRef = push(messagesRef);
    const msgId = newMsgRef.key;

    const messageData = {
      id: msgId,
      chatId: activeChatId,
      senderId: currentUid,
      senderName: 'Amministrazione CosaFare',
      senderRole: 'ADMIN',
      testo: text,
      timestamp: now
    };

    // 1. Push message
    await set(newMsgRef, messageData);

    // 2. Update room metadata
    await update(ref(db, `chats/${activeChatId}`), {
      id: activeChatId,
      tipo: room.tipo || 'ADMIN_ORGANIZZATORE',
      idOrganizzatore: room.idOrganizzatore || '',
      nomeOrganizzatore: room.nomeOrganizzatore || '',
      ultimoMessaggio: text,
      timestampUltimoMessaggio: now
    });

    chatInputText.value = '';
    chatInputText.style.height = 'auto';
  } catch (err) {
    showToast('Errore durante l\'invio del messaggio: ' + err.message, 'error');
  }
});

// Delete Active Chat Room
btnDeleteChatRoom.addEventListener('click', async () => {
  if (!activeChatId) return;
  if (!confirm('Vuoi eliminare questa chat e tutta la relativa cronologia messaggi?')) return;

  try {
    await remove(ref(db, `chats/${activeChatId}`));
    activeChatId = null;
    chatActiveContainer.classList.add('hidden');
    chatEmptyPlaceholder.classList.remove('hidden');
    showToast('Conversazione rimossa.', 'info');
  } catch (err) {
    showToast('Errore durante l\'eliminazione: ' + err.message, 'error');
  }
});

// New Admin Chat with Organizer
btnNewAdminChat.addEventListener('click', () => {
  modalNewChat.classList.remove('hidden');
});

btnConfirmStartChat.addEventListener('click', async () => {
  const orgUid = selectOrganizerForChat.value;
  const initialText = document.getElementById('initialAdminMessage').value.trim();

  if (!orgUid) {
    alert('Seleziona un organizzatore dall\'elenco.');
    return;
  }

  const selectedOption = selectOrganizerForChat.options[selectOrganizerForChat.selectedIndex];
  const orgName = selectedOption.dataset.nome || 'Organizzatore';
  const chatId = `admin_${orgUid}`;
  const now = Date.now();

  try {
    const roomRef = ref(db, `chats/${chatId}`);
    await update(roomRef, {
      id: chatId,
      tipo: 'ADMIN_ORGANIZZATORE',
      idOrganizzatore: orgUid,
      nomeOrganizzatore: orgName,
      ultimoMessaggio: initialText || 'Canale di supporto avviato dall\'amministrazione',
      timestampUltimoMessaggio: now
    });

    if (initialText) {
      const messagesRef = ref(db, `chats/${chatId}/messages`);
      const newMsgRef = push(messagesRef);
      await set(newMsgRef, {
        id: newMsgRef.key,
        chatId: chatId,
        senderId: currentAdminUser ? currentAdminUser.uid : 'admin_web',
        senderName: 'Amministrazione CosaFare',
        senderRole: 'ADMIN',
        testo: initialText,
        timestamp: now
      });
    }

    modalNewChat.classList.add('hidden');
    document.getElementById('initialAdminMessage').value = '';

    // Switch view to messages and open the new chat room
    document.querySelector('[data-target="view-messages"]').click();
    setTimeout(() => {
      window.selectChatRoom(chatId);
    }, 200);

    showToast(`Chat con ${orgName} aperta!`, 'success');
  } catch (err) {
    alert('Errore creazione chat: ' + err.message);
  }
});

// ==========================================================================
// 8. Organizer Area: Analytics, Create Event, My Events, Reviews, Chat
// ==========================================================================

function getOrganizerEventsList() {
  const orgId = currentOrganizerData?.id || currentUser?.uid;
  const orgNome = (currentOrganizerData?.nomeEnte || '').trim().toLowerCase();

  return Object.entries(rawEventsData).map(([id, ev]) => ({ id, ...ev })).filter((ev) => {
    if (ev.idOrganizzatore && (ev.idOrganizzatore === orgId || ev.idOrganizzatore === currentUser?.uid)) return true;
    if (orgNome && ev.organizzatore && ev.organizzatore.trim().toLowerCase() === orgNome) return true;
    return false;
  });
}

function setupOrganizerListeners() {
  // 1. Listen to Events
  onValue(ref(db, 'eventi'), (snapshot) => {
    rawEventsData = snapshot.val() || {};
    renderOrganizerAnalytics();
    renderOrganizerMyEvents();
  });

  // 2. Listen to Reviews
  onValue(ref(db, 'recensioni'), (snapshot) => {
    rawReviewsData = snapshot.val() || {};
    renderOrganizerAnalytics();
    renderOrganizerMyEvents();
  });

  // 3. Setup Organizer Support Chat
  setupOrganizerChatListener();

  // 4. Setup Organizer Profile Listener & Render
  const orgId = currentOrganizerData?.id || currentUser?.uid;
  if (orgId) {
    onValue(ref(db, `enti/${orgId}`), (snapshot) => {
      if (snapshot.exists()) {
        currentOrganizerData = { id: orgId, ...snapshot.val() };
        renderOrganizerProfile();
      }
    });
  }
  renderOrganizerProfile();
}

// ───────────────────────────────────────────────
// A) Organizer Analytics (Posts, Likes, Reviews, Interactions)
// ───────────────────────────────────────────────

function renderOrganizerAnalytics() {
  const myEvents = getOrganizerEventsList();

  // Badge count on sidebar
  const badgeMyEvents = document.getElementById('badgeOrgMyEventsCount');
  if (badgeMyEvents) {
    badgeMyEvents.textContent = myEvents.length;
    badgeMyEvents.classList.toggle('hidden', myEvents.length === 0);
  }

  // Calculate per-event stats
  let totalLikes = 0;
  let totalReviews = 0;
  let totalInteractions = 0;
  let ratingWeightedSum = 0;

  myEvents.forEach((ev) => {
    // 1. Mi Piace (Likes)
    const likes = Number(ev.likes || ev.likesCount || ev.preferitiCount || 0);
    ev._likes = likes;
    totalLikes += likes;

    // 2. Recensioni & Voto Medio
    const eventReviewsObj = rawReviewsData[ev.id] || {};
    const reviewsArr = Object.values(eventReviewsObj);
    const reviewsCount = reviewsArr.length > 0 ? reviewsArr.length : Number(ev.numeroRecensioni || 0);
    
    let avgRating = 0;
    if (reviewsArr.length > 0) {
      const sum = reviewsArr.reduce((acc, r) => acc + (Number(r.valutazione) || 5), 0);
      avgRating = sum / reviewsArr.length;
    } else {
      avgRating = Number(ev.mediaValutazioni) || 0;
    }
    ev._reviewsCount = reviewsCount;
    ev._avgRating = avgRating;
    totalReviews += reviewsCount;
    ratingWeightedSum += (avgRating * reviewsCount);

    // 3. Interazioni Diverse (Likes + Recensioni + Clic/Visualizzazioni post)
    const seedViews = ev.views ? Number(ev.views) : (ev.titolo ? (hashString(ev.id) % 18 + 6) : 0);
    const interactions = Number(ev.interazioniDiverse || ev.interazioni || (likes + reviewsCount + seedViews));
    ev._interactions = interactions;
    totalInteractions += interactions;
  });

  // Global average rating
  const avgRatingGlobal = totalReviews > 0 ? (ratingWeightedSum / totalReviews) : (myEvents.length > 0 ? 5.0 : 0);

  // Update KPI Cards
  const kpiTotalEvents = document.getElementById('kpiOrgTotalEvents');
  const kpiTotalLikes = document.getElementById('kpiOrgTotalLikes');
  const kpiTotalReviews = document.getElementById('kpiOrgTotalReviews');
  const kpiAvgRating = document.getElementById('kpiOrgAvgRating');
  const kpiTotalInteractions = document.getElementById('kpiOrgTotalInteractions');

  if (kpiTotalEvents) kpiTotalEvents.textContent = myEvents.length;
  if (kpiTotalLikes) kpiTotalLikes.textContent = totalLikes;
  if (kpiTotalReviews) kpiTotalReviews.textContent = totalReviews;
  if (kpiAvgRating) {
    kpiAvgRating.textContent = myEvents.length > 0 ? (avgRatingGlobal > 0 ? avgRatingGlobal.toFixed(1) : '5.0') : '--';
  }
  if (kpiTotalInteractions) kpiTotalInteractions.textContent = totalInteractions;

  // Update Engagement Chart
  updateOrgEngagementChart(myEvents);

  // Update Detailed Table
  renderOrgAnalyticsTable(myEvents);
}

function updateOrgEngagementChart(myEvents) {
  const ctx = document.getElementById('orgPostsEngagementChart');
  if (!ctx) return;

  if (myEvents.length === 0) {
    if (orgEngagementChartInstance) {
      orgEngagementChartInstance.destroy();
      orgEngagementChartInstance = null;
    }
    return;
  }

  const labels = myEvents.map((e) => {
    const t = e.titolo || 'Evento';
    return t.length > 22 ? t.slice(0, 20) + '...' : t;
  });

  const likesData = myEvents.map((e) => e._likes);
  const reviewsData = myEvents.map((e) => e._reviewsCount);
  const interactionsData = myEvents.map((e) => e._interactions);

  if (orgEngagementChartInstance) {
    orgEngagementChartInstance.data.labels = labels;
    orgEngagementChartInstance.data.datasets[0].data = likesData;
    orgEngagementChartInstance.data.datasets[1].data = reviewsData;
    orgEngagementChartInstance.data.datasets[2].data = interactionsData;
    orgEngagementChartInstance.update();
    return;
  }

  orgEngagementChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Mi Piace ❤️',
          data: likesData,
          backgroundColor: '#ef4444',
          borderRadius: 6
        },
        {
          label: 'Recensioni 💬',
          data: reviewsData,
          backgroundColor: '#8b5cf6',
          borderRadius: 6
        },
        {
          label: 'Interazioni Diverse ⚡',
          data: interactionsData,
          backgroundColor: '#3b82f6',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 14, font: { family: 'Inter', size: 12, weight: '600' } }
        },
        tooltip: {
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { stepSize: 1 }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

function renderOrgAnalyticsTable(myEvents) {
  const tbody = document.getElementById('orgEventsAnalyticsTableBody');
  if (!tbody) return;

  const searchInput = document.getElementById('searchOrgEventsInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = myEvents.filter((ev) => {
    if (!query) return true;
    return (ev.titolo && ev.titolo.toLowerCase().includes(query)) ||
           (ev.categoria && ev.categoria.toLowerCase().includes(query)) ||
           (ev.luogo && ev.luogo.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-state" style="padding: 1rem;">
            <i class="fa-solid fa-calendar-xmark" style="font-size: 2rem;"></i>
            <p>${myEvents.length === 0 ? 'Non hai ancora pubblicato nessun evento. Clicca su "Carica Evento" per iniziare!' : 'Nessun evento corrisponde ai criteri di ricerca.'}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((ev) => {
    const hasImage = Boolean(ev.immagineCopertina);
    const thumbHtml = hasImage
      ? `<img src="${ev.immagineCopertina}" alt="Cover" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;">`
      : `<div style="width: 48px; height: 48px; border-radius: 6px; background: #fff3ec; color: #cc5500; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;"><i class="fa-solid fa-calendar-day"></i></div>`;

    const vegBadge = ev.opzioniVeg 
      ? `<span class="badge-tag feature-veg" title="Opzioni Vegetariane / Vegane"><i class="fa-solid fa-seedling"></i> Veg</span>` 
      : '';
    const disabledBadge = ev.accessibileDisabili 
      ? `<span class="badge-tag feature-disabled" title="Accessibile ai Disabili"><i class="fa-solid fa-wheelchair"></i> ♿</span>` 
      : '';

    const dateStr = formatEventDate(ev);
    const ratingDisplay = ev._avgRating > 0 ? ev._avgRating.toFixed(1) : (ev._reviewsCount > 0 ? '5.0' : '-');

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${thumbHtml}
            <div>
              <div style="font-weight: 700; color: #0f172a;">${escapeHtml(ev.titolo || 'Senza Titolo')}</div>
              <span class="badge-tag" style="font-size: 0.7rem; margin-top: 2px;">${escapeHtml(ev.categoria || 'Generale')}</span>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: 600;">${dateStr}</div>
          <div style="font-size: 0.75rem; color: #64748b;"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(ev.luogo || 'Toscana')}</div>
        </td>
        <td>
          <span class="metric-pill red">
            <i class="fa-solid fa-heart"></i> ${ev._likes}
          </span>
        </td>
        <td>
          <span class="metric-pill purple">
            <i class="fa-solid fa-comments"></i> ${ev._reviewsCount}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="rating-stars-badge"><i class="fa-solid fa-star"></i> ${ratingDisplay}</span>
            <button class="btn btn-outline btn-xs" onclick="window.viewEventReviews('${ev.id}')" title="Leggi recensioni dettagliate">
              Dettagli
            </button>
          </div>
        </td>
        <td>
          <span class="metric-pill blue">
            <i class="fa-solid fa-bolt"></i> ${ev._interactions}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            ${disabledBadge}
            ${vegBadge}
            ${!disabledBadge && !vegBadge ? '<span style="color: #94a3b8; font-size: 0.75rem;">-</span>' : ''}
          </div>
        </td>
        <td>
          <button class="btn btn-danger-outline btn-sm" onclick="window.deleteOrgEvent('${ev.id}', '${escapeHtml(ev.titolo || 'Evento')}')" title="Elimina evento">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Search input in organizer analytics table
const searchOrgEventsInput = document.getElementById('searchOrgEventsInput');
if (searchOrgEventsInput) {
  searchOrgEventsInput.addEventListener('input', () => {
    const myEvents = getOrganizerEventsList();
    renderOrgAnalyticsTable(myEvents);
  });
}

// Shortcut button "Nuova Pubblicazione"
const btnOrgCreateEventShortcut = document.getElementById('btnOrgCreateEventShortcut');
if (btnOrgCreateEventShortcut) {
  btnOrgCreateEventShortcut.addEventListener('click', () => {
    const createNav = document.querySelector('[data-target="view-org-create-event"]');
    if (createNav) createNav.click();
  });
}

// ───────────────────────────────────────────────
// B) Event Reviews Inspection Modal
// ───────────────────────────────────────────────

window.viewEventReviews = function(eventId) {
  const ev = rawEventsData[eventId];
  if (!ev) {
    showToast('Evento non trovato', 'error');
    return;
  }

  const modal = document.getElementById('modalEventReviews');
  const titleEl = document.getElementById('reviewModalTitle');
  const subtitleEl = document.getElementById('reviewModalSubtitle');
  const scoreEl = document.getElementById('reviewAggScore');
  const starsEl = document.getElementById('reviewAggStars');
  const countEl = document.getElementById('reviewAggCount');
  const listEl = document.getElementById('reviewModalList');

  titleEl.innerHTML = `<i class="fa-solid fa-star" style="color: #f59e0b;"></i> Recensioni: ${escapeHtml(ev.titolo || 'Evento')}`;
  subtitleEl.textContent = `Categoria: ${ev.categoria || 'Varie'} • ${formatEventDate(ev)}`;

  const reviewsMap = rawReviewsData[eventId] || {};
  const reviews = Object.values(reviewsMap);

  let avgRating = 0;
  if (reviews.length > 0) {
    const sum = reviews.reduce((acc, r) => acc + (Number(r.valutazione) || 5), 0);
    avgRating = sum / reviews.length;
  } else {
    avgRating = Number(ev.mediaValutazioni) || 0;
  }

  scoreEl.textContent = avgRating > 0 ? avgRating.toFixed(1) : (reviews.length > 0 ? '5.0' : '0.0');
  countEl.textContent = `${reviews.length} ${reviews.length === 1 ? 'recensione ricevuta' : 'recensioni ricevute'}`;

  // Star rendering
  const roundedStars = Math.round(avgRating) || (reviews.length > 0 ? 5 : 0);
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    starsHtml += i <= roundedStars ? '★' : '☆';
  }
  starsEl.textContent = starsHtml;

  if (reviews.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <i class="fa-regular fa-comment-dots" style="font-size: 2.5rem;"></i>
        <p>Non ci sono ancora recensioni scritte per questo evento.<br>I partecipanti potranno recensirlo dall'app mobile CosaFare al termine della loro visita.</p>
      </div>
    `;
  } else {
    // Sort reviews newest first
    reviews.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    listEl.innerHTML = reviews.map((r) => {
      const author = r.nomeUtente || 'Partecipante';
      const initial = author.charAt(0).toUpperCase();
      const val = Number(r.valutazione) || 5;
      let starStr = '';
      for (let s = 1; s <= 5; s++) {
        starStr += s <= val ? '★' : '☆';
      }

      const timeStr = r.timestamp ? formatRelativeTime(r.timestamp) : '';
      const luogoUser = [r.comuneUtente, r.provinciaUtente].filter(Boolean).join(', ');

      return `
        <div class="review-card-item">
          <div class="review-item-header">
            <div class="review-author-info">
              <div class="review-avatar">${initial}</div>
              <div>
                <div class="review-author-name">${escapeHtml(author)} ${luogoUser ? `<span style="font-size: 0.75rem; color: #64748b; font-weight: normal;">da ${escapeHtml(luogoUser)}</span>` : ''}</div>
                <div class="review-date-text">${timeStr}</div>
              </div>
            </div>
            <div class="review-item-stars">${starStr}</div>
          </div>
          <div class="review-comment-text">${escapeHtml(r.commento || 'Nessun commento testuale.')}</div>
        </div>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
};

// ───────────────────────────────────────────────
// C) Create Event Module (AddEvento.kt Homologue)
// ───────────────────────────────────────────────

function compressAndConvertImage(file, maxWidth = 1200, maxHeight = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function geocodeAddress(via, comune, provincia) {
  const query = `${via}, ${comune}, ${provincia}, Toscana, Italia`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    const data = await res.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      return { lat, lng };
    }
  } catch (e) {
    console.warn('Geocoding Nominatim OSM fallback:', e);
  }

  // Fallback to Tuscan province coordinates
  const provinceCoords = {
    'Firenze': { lat: 43.7696, lng: 11.2558 },
    'Pisa': { lat: 43.7228, lng: 10.4017 },
    'Livorno': { lat: 43.5485, lng: 10.3106 },
    'Lucca': { lat: 43.8429, lng: 10.5027 },
    'Siena': { lat: 43.3188, lng: 11.3308 },
    'Arezzo': { lat: 43.4631, lng: 11.8781 },
    'Pistoia': { lat: 43.9333, lng: 10.9167 },
    'Prato': { lat: 43.8777, lng: 11.1022 },
    'Grosseto': { lat: 42.7634, lng: 11.1118 },
    'Massa-Carrara': { lat: 44.0366, lng: 10.1419 }
  };
  return provinceCoords[provincia] || { lat: 43.7696, lng: 11.2558 };
}

function setupCreateEventModule() {
  const ceCategoria = document.getElementById('ceCategoria');
  const groupCeMenuImage = document.getElementById('groupCeMenuImage');
  const groupCeOpzioniVeg = document.getElementById('groupCeOpzioniVeg');
  const ceOpzioniVeg = document.getElementById('ceOpzioniVeg');

  // 1. Conditional visibility for food categories (Cibo & Sagre)
  if (ceCategoria) {
    ceCategoria.addEventListener('change', () => {
      const isFood = isCategoriaCibo(ceCategoria.value);
      if (groupCeMenuImage) groupCeMenuImage.classList.toggle('hidden', !isFood);
      if (groupCeOpzioniVeg) {
        groupCeOpzioniVeg.classList.toggle('hidden', !isFood);
        if (!isFood && ceOpzioniVeg) ceOpzioniVeg.checked = false;
      }
    });
  }

  // 2. Segmented Date Controls & Live Preview
  const btnDateModeSingle = document.getElementById('btnDateModeSingle');
  const btnDateModeRange = document.getElementById('btnDateModeRange');
  const radioDateSingle = document.getElementById('radioDateSingle');
  const radioDateRange = document.getElementById('radioDateRange');
  const singleRow = document.getElementById('ceSingleDateRow');
  const rangeRow = document.getElementById('ceRangeDateRow');
  const ceDataSingola = document.getElementById('ceDataSingola');
  const ceDataInizio = document.getElementById('ceDataInizio');
  const ceDataFine = document.getElementById('ceDataFine');
  const ceSingleDatePreview = document.getElementById('ceSingleDatePreview');
  const ceSingleDatePreviewText = document.getElementById('ceSingleDatePreviewText');
  const ceRangeDatePreview = document.getElementById('ceRangeDatePreview');
  const ceRangeDatePreviewText = document.getElementById('ceRangeDatePreviewText');
  const ceRangeDaysPill = document.getElementById('ceRangeDaysPill');

  function setDateMode(mode) {
    if (mode === 'single') {
      if (btnDateModeSingle) btnDateModeSingle.classList.add('active');
      if (btnDateModeRange) btnDateModeRange.classList.remove('active');
      if (radioDateSingle) radioDateSingle.checked = true;
      if (radioDateRange) radioDateRange.checked = false;
      if (singleRow) singleRow.classList.remove('hidden');
      if (rangeRow) rangeRow.classList.add('hidden');
    } else {
      if (btnDateModeSingle) btnDateModeSingle.classList.remove('active');
      if (btnDateModeRange) btnDateModeRange.classList.add('active');
      if (radioDateSingle) radioDateSingle.checked = false;
      if (radioDateRange) radioDateRange.checked = true;
      if (singleRow) singleRow.classList.add('hidden');
      if (rangeRow) rangeRow.classList.remove('hidden');
    }
  }

  if (btnDateModeSingle) btnDateModeSingle.addEventListener('click', () => setDateMode('single'));
  if (btnDateModeRange) btnDateModeRange.addEventListener('click', () => setDateMode('range'));

  function formatItalianDateStr(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const formatted = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  function updateSingleDatePreview() {
    const val = ceDataSingola?.value;
    if (val && ceSingleDatePreview && ceSingleDatePreviewText) {
      ceSingleDatePreviewText.textContent = formatItalianDateStr(val);
      ceSingleDatePreview.classList.remove('hidden');
    } else if (ceSingleDatePreview) {
      ceSingleDatePreview.classList.add('hidden');
    }
  }

  function updateRangeDatePreview() {
    const startVal = ceDataInizio?.value;
    const endVal = ceDataFine?.value;

    if (startVal && endVal) {
      const d1 = new Date(startVal);
      const d2 = new Date(endVal);
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

      if (diffDays >= 1) {
        if (ceRangeDaysPill) {
          ceRangeDaysPill.textContent = diffDays === 1 ? '1 giorno' : `${diffDays} giorni`;
          ceRangeDaysPill.classList.remove('hidden');
        }
        if (ceRangeDatePreview && ceRangeDatePreviewText) {
          const sFormatted = d1.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
          const eFormatted = d2.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
          ceRangeDatePreviewText.textContent = `Dal ${sFormatted} al ${eFormatted} (${diffDays} ${diffDays === 1 ? 'giorno' : 'giorni'})`;
          ceRangeDatePreview.classList.remove('hidden');
        }
      } else {
        if (ceRangeDaysPill) ceRangeDaysPill.classList.add('hidden');
        if (ceRangeDatePreview && ceRangeDatePreviewText) {
          ceRangeDatePreviewText.textContent = 'Attenzione: la data di conclusione precede la data di inizio.';
          ceRangeDatePreview.classList.remove('hidden');
        }
      }
    } else {
      if (ceRangeDaysPill) ceRangeDaysPill.classList.add('hidden');
      if (ceRangeDatePreview) ceRangeDatePreview.classList.add('hidden');
    }
  }

  if (ceDataSingola) ceDataSingola.addEventListener('change', updateSingleDatePreview);
  if (ceDataInizio) ceDataInizio.addEventListener('change', updateRangeDatePreview);
  if (ceDataFine) ceDataFine.addEventListener('change', updateRangeDatePreview);

  // Quick Chips (Oggi, Domani, Sabato, Domenica)
  document.querySelectorAll('.btn-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-quick');
      const now = new Date();
      let target = new Date();

      if (type === 'today') {
        // today
      } else if (type === 'tomorrow') {
        target.setDate(now.getDate() + 1);
      } else if (type === 'saturday') {
        const day = now.getDay();
        const diff = (6 - day + 7) % 7 || 7;
        target.setDate(now.getDate() + diff);
      } else if (type === 'sunday') {
        const day = now.getDay();
        const diff = (7 - day) % 7 || 7;
        target.setDate(now.getDate() + diff);
      }

      const yyyy = target.getFullYear();
      const mm = String(target.getMonth() + 1).padStart(2, '0');
      const dd = String(target.getDate()).padStart(2, '0');
      if (ceDataSingola) {
        ceDataSingola.value = `${yyyy}-${mm}-${dd}`;
        updateSingleDatePreview();
      }
    });
  });

  // Gestione Multi-Periodo (Possibilità di inserire più date o intervalli)
  let eventConfiguredPeriods = [];

  const btnAddDatePeriod = document.getElementById('btnAddDatePeriod');
  const ceConfiguredPeriodsList = document.getElementById('ceConfiguredPeriodsList');
  const ceEmptyPeriodsPlaceholder = document.getElementById('ceEmptyPeriodsPlaceholder');
  const cePeriodsCountBadge = document.getElementById('cePeriodsCountBadge');
  const ceTotalDaysSummary = document.getElementById('ceTotalDaysSummary');
  const ceTotalDaysSummaryText = document.getElementById('ceTotalDaysSummaryText');

  function renderConfiguredPeriods() {
    if (!ceConfiguredPeriodsList) return;

    if (eventConfiguredPeriods.length === 0) {
      ceConfiguredPeriodsList.innerHTML = `
        <div class="empty-periods-msg" id="ceEmptyPeriodsPlaceholder">
          <i class="fa-regular fa-calendar-xmark"></i>
          <span>Nessuna data ancora aggiunta. Scegli la data o il periodo qui sopra e clicca su <strong>"Inserisci Questo Periodo nella Lista"</strong>.</span>
        </div>
      `;
      if (cePeriodsCountBadge) cePeriodsCountBadge.textContent = '0 periodi';
      if (ceTotalDaysSummary) ceTotalDaysSummary.classList.add('hidden');
      return;
    }

    if (cePeriodsCountBadge) {
      cePeriodsCountBadge.textContent = `${eventConfiguredPeriods.length} ${eventConfiguredPeriods.length === 1 ? 'periodo' : 'periodi'}`;
    }

    let totalDays = 0;
    ceConfiguredPeriodsList.innerHTML = eventConfiguredPeriods.map((period, index) => {
      totalDays += period.days;
      return `
        <div class="period-card-item">
          <div class="period-card-info">
            <i class="fa-solid fa-calendar-check"></i>
            <span class="period-card-dates">${escapeHtml(period.displayStr)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span class="period-days-badge">${period.days} ${period.days === 1 ? 'giorno' : 'giorni'}</span>
            <button type="button" class="btn-delete-period" data-period-index="${index}" title="Rimuovi questo periodo">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach delete listeners
    ceConfiguredPeriodsList.querySelectorAll('.btn-delete-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-period-index'), 10);
        eventConfiguredPeriods.splice(idx, 1);
        renderConfiguredPeriods();
        showToast('Periodo rimosso dal calendario', 'info');
      });
    });

    if (ceTotalDaysSummary && ceTotalDaysSummaryText) {
      ceTotalDaysSummaryText.textContent = `${eventConfiguredPeriods.length} ${eventConfiguredPeriods.length === 1 ? 'periodo configurato' : 'periodi configurati'} • ${totalDays} ${totalDays === 1 ? 'giornata totale di evento' : 'giornate totali di evento'}`;
      ceTotalDaysSummary.classList.remove('hidden');
    }
  }

  function addCurrentPeriodFromInputs() {
    const isSingle = radioDateSingle ? radioDateSingle.checked : true;
    let startTs = 0;
    let endTs = 0;
    let displayStr = '';
    let days = 1;

    if (isSingle) {
      const val = ceDataSingola ? ceDataSingola.value : '';
      if (!val) {
        showToast('Seleziona una data prima di aggiungerla.', 'error');
        return false;
      }
      startTs = new Date(val + 'T10:00:00').getTime();
      endTs = new Date(val + 'T23:59:00').getTime();
      displayStr = formatItalianDateStr(val);
      days = 1;
    } else {
      const valInizio = ceDataInizio ? ceDataInizio.value : '';
      const valFine = ceDataFine ? ceDataFine.value : '';
      if (!valInizio || !valFine) {
        showToast('Seleziona sia la data di inizio che quella di fine.', 'error');
        return false;
      }
      startTs = new Date(valInizio + 'T10:00:00').getTime();
      endTs = new Date(valFine + 'T23:59:00').getTime();
      if (startTs > endTs) {
        showToast('La data di fine non può essere precedente alla data di inizio.', 'error');
        return false;
      }
      const d1 = new Date(valInizio);
      const d2 = new Date(valFine);
      days = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const sFormatted = d1.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
      const eFormatted = d2.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
      displayStr = `Dal ${sFormatted} al ${eFormatted}`;
    }

    // Evita duplicati
    const duplicate = eventConfiguredPeriods.some(p => p.dataInizio === startTs && p.dataFine === endTs);
    if (duplicate) {
      showToast('Questo periodo è già stato inserito nella lista!', 'info');
      return false;
    }

    eventConfiguredPeriods.push({
      dataInizio: startTs,
      dataFine: endTs,
      displayStr: displayStr,
      days: days
    });

    eventConfiguredPeriods.sort((a, b) => a.dataInizio - b.dataInizio);
    renderConfiguredPeriods();
    showToast(`Periodo (${displayStr}) inserito con successo!`, 'success');
    return true;
  }

  if (btnAddDatePeriod) {
    btnAddDatePeriod.addEventListener('click', () => {
      addCurrentPeriodFromInputs();
    });
  }

  // 3. Address Autocomplete, Hidden Coordinates & Green GPS Verified Badge
  const ceVia = document.getElementById('ceVia');
  const ceComune = document.getElementById('ceComune');
  const ceProvincia = document.getElementById('ceProvincia');
  const ceLat = document.getElementById('ceLat');
  const ceLng = document.getElementById('ceLng');
  const ceGeohash = document.getElementById('ceGeohash');
  const ceAddressSearch = document.getElementById('ceAddressSearch');
  const ceAddressSuggestions = document.getElementById('ceAddressSuggestions');
  const ceSearchSpinner = document.getElementById('ceSearchSpinner');
  const btnClearAddressSearch = document.getElementById('btnClearAddressSearch');
  const ceLocationVerifiedBadge = document.getElementById('ceLocationVerifiedBadge');
  const ceLocationVerifiedCoordsPill = document.getElementById('ceLocationVerifiedCoordsPill');
  const ceLocationVerifiedText = document.getElementById('ceLocationVerifiedText');

  function setLocationVerifiedBadge(lat, lng, labelText = '') {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      if (ceLocationVerifiedBadge) ceLocationVerifiedBadge.classList.add('hidden');
      return;
    }

    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (ceLat) ceLat.value = nLat.toFixed(6);
    if (ceLng) ceLng.value = nLng.toFixed(6);
    const gh = encodeGeohash(nLat, nLng, 8);
    if (ceGeohash) ceGeohash.value = gh;

    if (ceLocationVerifiedCoordsPill) {
      ceLocationVerifiedCoordsPill.textContent = `${nLat.toFixed(4)}, ${nLng.toFixed(4)}`;
    }
    if (ceLocationVerifiedText && labelText) {
      ceLocationVerifiedText.textContent = labelText;
    } else if (ceLocationVerifiedText) {
      ceLocationVerifiedText.textContent = 'Mappata con precisione per l\'app mobile CosaFare';
    }

    if (ceLocationVerifiedBadge) {
      ceLocationVerifiedBadge.classList.remove('hidden');
    }
  }

  // Address Autocomplete via OpenStreetMap Nominatim (Scoped to Tuscany)
  let addressDebounceTimer = null;
  if (ceAddressSearch && ceAddressSuggestions) {
    ceAddressSearch.addEventListener('input', () => {
      const query = ceAddressSearch.value.trim();
      if (btnClearAddressSearch) btnClearAddressSearch.classList.toggle('hidden', query.length === 0);

      if (query.length < 3) {
        ceAddressSuggestions.innerHTML = '';
        ceAddressSuggestions.classList.add('hidden');
        return;
      }

      if (addressDebounceTimer) clearTimeout(addressDebounceTimer);
      addressDebounceTimer = setTimeout(async () => {
        if (ceSearchSpinner) ceSearchSpinner.classList.remove('hidden');
        try {
          // Bounding box Tuscany: 9.68,44.48 (NW) to 12.40,42.20 (SE)
          const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=it&viewbox=9.68,44.48,12.40,42.20&bounded=1&limit=6&q=${encodeURIComponent(query)}`;
          const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
          const items = await res.json();

          if (!items || items.length === 0) {
            ceAddressSuggestions.innerHTML = `
              <div class="address-suggestion-item" style="cursor: default; color: #64748b;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>
                <span>Nessun indirizzo trovato per "${escapeHtml(query)}". Prova a inserire il comune.</span>
              </div>
            `;
            ceAddressSuggestions.classList.remove('hidden');
            return;
          }

          ceAddressSuggestions.innerHTML = items.map((item, idx) => {
            const addr = item.address || {};
            const road = addr.road || addr.pedestrian || addr.footway || addr.street || addr.suburb || item.display_name.split(',')[0];
            const houseNum = addr.house_number ? ` ${addr.house_number}` : '';
            const roadDisplay = road ? `${road}${houseNum}` : item.display_name.split(',')[0];
            const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Toscana';
            const prov = addr.province || addr.state_district || '';
            const subtitle = [city, prov].filter(Boolean).join(', ');

            return `
              <div class="address-suggestion-item" data-idx="${idx}">
                <div class="suggestion-icon"><i class="fa-solid fa-location-dot"></i></div>
                <div class="suggestion-text">
                  <div class="suggestion-title">${escapeHtml(roadDisplay)}</div>
                  <div class="suggestion-subtitle">${escapeHtml(subtitle)}</div>
                </div>
              </div>
            `;
          }).join('');

          // Bind click to each suggestion
          ceAddressSuggestions.querySelectorAll('.address-suggestion-item').forEach((el) => {
            el.addEventListener('click', () => {
              const idx = parseInt(el.getAttribute('data-idx'), 10);
              const selected = items[idx];
              if (!selected) return;

              const addr = selected.address || {};
              const road = addr.road || addr.pedestrian || addr.footway || addr.street || addr.suburb || selected.display_name.split(',')[0];
              const houseNum = addr.house_number ? ` ${addr.house_number}` : '';
              const fullRoad = `${road}${houseNum}`.trim();
              const city = addr.city || addr.town || addr.village || addr.municipality || '';

              const tuscanProvinces = [
                'Arezzo', 'Firenze', 'Grosseto', 'Livorno', 'Lucca', 
                'Massa-Carrara', 'Pisa', 'Pistoia', 'Prato', 'Siena'
              ];
              const rawSearchText = (selected.display_name + ' ' + (addr.county || '') + ' ' + (addr.state_district || '')).toLowerCase();
              let matchedProvince = '';
              for (const p of tuscanProvinces) {
                if (rawSearchText.includes(p.toLowerCase())) {
                  matchedProvince = p;
                  break;
                }
              }

              if (fullRoad && ceVia) ceVia.value = fullRoad;
              if (city && ceComune) ceComune.value = city;
              if (matchedProvince && ceProvincia) ceProvincia.value = matchedProvince;

              const lat = parseFloat(selected.lat);
              const lon = parseFloat(selected.lon);
              setLocationVerifiedBadge(lat, lon, `${fullRoad || city}, ${matchedProvince || 'Toscana'}`);

              ceAddressSearch.value = `${fullRoad ? fullRoad + ', ' : ''}${city} (${matchedProvince || 'Toscana'})`;
              ceAddressSuggestions.classList.add('hidden');
              if (btnClearAddressSearch) btnClearAddressSearch.classList.remove('hidden');
            });
          });

          ceAddressSuggestions.classList.remove('hidden');
        } catch (err) {
          console.warn('Errore ricerca suggerimenti OSM:', err);
        } finally {
          if (ceSearchSpinner) ceSearchSpinner.classList.add('hidden');
        }
      }, 350);
    });

    document.addEventListener('click', (e) => {
      if (!ceAddressSearch.contains(e.target) && !ceAddressSuggestions.contains(e.target)) {
        ceAddressSuggestions.classList.add('hidden');
      }
    });

    if (btnClearAddressSearch) {
      btnClearAddressSearch.addEventListener('click', () => {
        ceAddressSearch.value = '';
        btnClearAddressSearch.classList.add('hidden');
        ceAddressSuggestions.classList.add('hidden');
      });
    }
  }

  // Automatic geocode verification on manual changes to via/comune/provincia
  let manualGeocodeTimer = null;
  function onManualLocationChange() {
    if (manualGeocodeTimer) clearTimeout(manualGeocodeTimer);
    manualGeocodeTimer = setTimeout(async () => {
      const via = ceVia ? ceVia.value.trim() : '';
      const comune = ceComune ? ceComune.value.trim() : '';
      const provincia = ceProvincia ? ceProvincia.value : '';

      if (via && comune && provincia) {
        try {
          const coords = await geocodeAddress(via, comune, provincia);
          setLocationVerifiedBadge(coords.lat, coords.lng, `${via}, ${comune} (${provincia})`);
        } catch (e) {
          console.warn('Geocodifica manuale fallita:', e);
        }
      }
    }, 500);
  }

  if (ceVia) ceVia.addEventListener('input', onManualLocationChange);
  if (ceComune) ceComune.addEventListener('input', onManualLocationChange);
  if (ceProvincia) ceProvincia.addEventListener('change', onManualLocationChange);

  // 4. Copertina Upload & Preview
  const ceCopertinaFile = document.getElementById('ceCopertinaFile');
  const ceCopertinaPreviewWrapper = document.getElementById('ceCopertinaPreviewWrapper');
  const ceCopertinaPreviewImg = document.getElementById('ceCopertinaPreviewImg');
  const dropzoneCopertinaPrompt = document.getElementById('dropzoneCopertinaPrompt');
  const btnRemoveCopertina = document.getElementById('btnRemoveCopertina');

  if (ceCopertinaFile) {
    ceCopertinaFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        showToast('Elaborazione immagine di copertina...', 'info');
        ceCopertinaBase64 = await compressAndConvertImage(file);
        ceCopertinaPreviewImg.src = ceCopertinaBase64;
        ceCopertinaPreviewWrapper.classList.remove('hidden');
        dropzoneCopertinaPrompt.classList.add('hidden');
      } catch (err) {
        alert('Errore caricamento immagine: ' + err.message);
      }
    });
  }

  if (btnRemoveCopertina) {
    btnRemoveCopertina.addEventListener('click', (e) => {
      e.stopPropagation();
      ceCopertinaBase64 = '';
      ceCopertinaFile.value = '';
      ceCopertinaPreviewWrapper.classList.add('hidden');
      dropzoneCopertinaPrompt.classList.remove('hidden');
    });
  }

  // 5. Menu Upload & Preview
  const ceMenuFile = document.getElementById('ceMenuFile');
  const ceMenuPreviewWrapper = document.getElementById('ceMenuPreviewWrapper');
  const ceMenuPreviewImg = document.getElementById('ceMenuPreviewImg');
  const dropzoneMenuPrompt = document.getElementById('dropzoneMenuPrompt');
  const btnRemoveMenu = document.getElementById('btnRemoveMenu');

  if (ceMenuFile) {
    ceMenuFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        showToast('Elaborazione immagine del menu...', 'info');
        ceMenuBase64 = await compressAndConvertImage(file);
        ceMenuPreviewImg.src = ceMenuBase64;
        ceMenuPreviewWrapper.classList.remove('hidden');
        dropzoneMenuPrompt.classList.add('hidden');
      } catch (err) {
        alert('Errore caricamento menu: ' + err.message);
      }
    });
  }

  if (btnRemoveMenu) {
    btnRemoveMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      ceMenuBase64 = '';
      ceMenuFile.value = '';
      ceMenuPreviewWrapper.classList.add('hidden');
      dropzoneMenuPrompt.classList.remove('hidden');
    });
  }

  // 6. Form Submission
  const formCreateEvent = document.getElementById('formCreateEvent');
  if (formCreateEvent) {
    formCreateEvent.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titolo = document.getElementById('ceTitolo').value.trim();
      const categoria = ceCategoria.value;
      const via = ceVia.value.trim();
      const comune = ceComune.value.trim();
      const provincia = ceProvincia.value;
      const descrizione = document.getElementById('ceDescrizione').value.trim();
      const dateType = document.querySelector('input[name="ceDateType"]:checked')?.value || 'single';

      if (!titolo || !categoria || !via || !comune || !provincia || !descrizione) {
        alert('Per favore compila tutti i campi obbligatori.');
        return;
      }

      // Costruzione intervalli date (Multi-Periodo o Singolo)
      if (eventConfiguredPeriods.length === 0) {
        addCurrentPeriodFromInputs();
      }

      if (eventConfiguredPeriods.length === 0) {
        alert('Aggiungi almeno una data o un periodo per l\'evento cliccando su "Inserisci Questo Periodo nella Lista".');
        return;
      }

      const intervalliArray = eventConfiguredPeriods.map((p) => ({
        dataInizio: p.dataInizio,
        dataFine: p.dataFine
      }));
      const dateInizioTs = intervalliArray[0].dataInizio;

      // Coordinate GPS & Geohash
      let lat = parseFloat(ceLat.value);
      let lng = parseFloat(ceLng.value);

      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
        showToast('Calcolo automatico coordinate GPS in corso...', 'info');
        const coords = await geocodeAddress(via, comune, provincia);
        lat = coords.lat;
        lng = coords.lng;
      }

      const geohashVal = encodeGeohash(lat, lng, 8);

      // Spunte
      const isFood = isCategoriaCibo(categoria);
      const accessibileDisabili = document.getElementById('ceAccessibileDisabili').checked;
      const opzioniVeg = isFood ? document.getElementById('ceOpzioniVeg').checked : false;

      const submitBtn = document.getElementById('btnSubmitCreateEvent');
      const originalBtnHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Pubblicazione su CosaFare...`;

      try {
        const eventsRef = ref(db, 'eventi');
        const newRef = push(eventsRef);
        const eventId = newRef.key;

        const orgId = currentOrganizerData?.id || currentUser.uid;
        const orgNome = currentOrganizerData?.nomeEnte || currentUser.displayName || 'Organizzatore';

        const newEventObj = {
          id: eventId,
          idOrganizzatore: orgId,
          organizzatore: orgNome,
          titolo: titolo,
          data: dateInizioTs,
          date: intervalliArray,
          luogo: `${via}, ${comune}, ${provincia}`,
          latitudine: lat,
          longitudine: lng,
          categoria: categoria,
          descrizione: descrizione,
          preferito: false,
          immagineCopertina: ceCopertinaBase64 || '',
          immagineMenu: isFood ? (ceMenuBase64 || '') : '',
          mediaValutazioni: 0.0,
          numeroRecensioni: 0,
          likes: 0,
          geohash: geohashVal,
          accessibileDisabili: accessibileDisabili,
          opzioniVeg: opzioniVeg,
          boostScadenza: 0,
          boostTipo: '',
          stability: 0
        };

        await set(newRef, newEventObj);

        showToast(`Evento "${titolo}" pubblicato con successo!`, 'success');

        // Reset Form
        formCreateEvent.reset();
        ceCopertinaBase64 = '';
        ceMenuBase64 = '';
        ceCopertinaPreviewWrapper.classList.add('hidden');
        dropzoneCopertinaPrompt.classList.remove('hidden');
        ceMenuPreviewWrapper.classList.add('hidden');
        dropzoneMenuPrompt.classList.remove('hidden');
        if (ceLocationVerifiedBadge) ceLocationVerifiedBadge.classList.add('hidden');
        if (ceAddressSearch) ceAddressSearch.value = '';
        if (btnClearAddressSearch) btnClearAddressSearch.classList.add('hidden');
        if (ceSingleDatePreview) ceSingleDatePreview.classList.add('hidden');
        if (ceRangeDatePreview) ceRangeDatePreview.classList.add('hidden');
        if (ceRangeDaysPill) ceRangeDaysPill.classList.add('hidden');
        eventConfiguredPeriods = [];
        renderConfiguredPeriods();
        setDateMode('single');

        // Switch to "I Miei Eventi" view
        const myEventsNav = document.querySelector('[data-target="view-org-my-events"]');
        if (myEventsNav) myEventsNav.click();

      } catch (err) {
        console.error('Errore pubblicazione evento:', err);
        showToast('Errore durante la pubblicazione: ' + err.message, 'error');
        alert('Errore durante il salvataggio su Firebase: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    });
  }
}
setupCreateEventModule();

// ───────────────────────────────────────────────
// D) My Events Module
// ───────────────────────────────────────────────

let orgEventsStatusFilter = 'ALL';

function setupMyEventsModule() {
  document.querySelectorAll('#orgEventsStatusFilters .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#orgEventsStatusFilters .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      orgEventsStatusFilter = btn.getAttribute('data-filter') || 'ALL';
      renderOrganizerMyEvents();
    });
  });

  const searchInput = document.getElementById('searchMyEventsListInput');
  if (searchInput) {
    searchInput.addEventListener('input', renderOrganizerMyEvents);
  }

  const btnNewFromList = document.getElementById('btnNewEventFromList');
  if (btnNewFromList) {
    btnNewFromList.addEventListener('click', () => {
      const createNav = document.querySelector('[data-target="view-org-create-event"]');
      if (createNav) createNav.click();
    });
  }
}
setupMyEventsModule();

function renderOrganizerMyEvents() {
  const container = document.getElementById('orgMyEventsGrid');
  if (!container) return;

  const myEvents = getOrganizerEventsList();
  const searchInput = document.getElementById('searchMyEventsListInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayEnd = new Date().setHours(23, 59, 59, 999);

  const filtered = myEvents.filter((ev) => {
    // Search query
    if (query) {
      const match = (ev.titolo && ev.titolo.toLowerCase().includes(query)) ||
                    (ev.categoria && ev.categoria.toLowerCase().includes(query)) ||
                    (ev.luogo && ev.luogo.toLowerCase().includes(query));
      if (!match) return false;
    }

    // Status filter
    if (orgEventsStatusFilter === 'ALL') return true;

    let inCorso = false;
    let futuro = false;
    let passato = false;

    if (ev.date && Array.isArray(ev.date) && ev.date.length > 0) {
      inCorso = ev.date.some(d => d.dataInizio <= todayEnd && d.dataFine >= todayStart);
      futuro = ev.date.some(d => d.dataInizio > todayEnd);
      passato = ev.date.every(d => d.dataFine < todayStart);
    } else if (ev.data) {
      inCorso = ev.data >= todayStart && ev.data <= todayEnd;
      futuro = ev.data > todayEnd;
      passato = ev.data < todayStart;
    }

    if (orgEventsStatusFilter === 'IN_CORSO') return inCorso;
    if (orgEventsStatusFilter === 'FUTURI') return futuro;
    if (orgEventsStatusFilter === 'PASSATI') return passato;

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-calendar-xmark"></i>
        <p>${myEvents.length === 0 ? 'Nessun evento presente nel tuo catalogo.' : 'Nessun evento corrisponde al filtro selezionato.'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((ev) => {
    const hasImage = Boolean(ev.immagineCopertina);
    const thumbHtml = hasImage
      ? `<img src="${ev.immagineCopertina}" alt="Cover">`
      : `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, #cc5500, #ff7a18); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 3rem;"><i class="fa-solid fa-calendar-days"></i></div>`;

    // Status badge computation
    let statusClass = 'status-active';
    let statusLabel = 'In corso';
    if (ev.date && Array.isArray(ev.date) && ev.date.length > 0) {
      if (ev.date.every(d => d.dataFine < todayStart)) {
        statusClass = 'status-past';
        statusLabel = 'Concluso';
      } else if (ev.date.some(d => d.dataInizio > todayEnd)) {
        statusClass = 'status-future';
        statusLabel = 'In arrivo';
      }
    } else if (ev.data) {
      if (ev.data < todayStart) {
        statusClass = 'status-past';
        statusLabel = 'Concluso';
      } else if (ev.data > todayEnd) {
        statusClass = 'status-future';
        statusLabel = 'In arrivo';
      }
    }

    const vegBadge = ev.opzioniVeg ? `<span class="badge-tag feature-veg"><i class="fa-solid fa-seedling"></i> Veg</span>` : '';
    const disabiliBadge = ev.accessibileDisabili ? `<span class="badge-tag feature-disabled"><i class="fa-solid fa-wheelchair"></i> ♿</span>` : '';
    const likes = Number(ev.likes || ev.likesCount || ev.preferitiCount || 0);

    const reviewsMap = rawReviewsData[ev.id] || {};
    const reviewsArr = Object.values(reviewsMap);
    const numReviews = reviewsArr.length > 0 ? reviewsArr.length : Number(ev.numeroRecensioni || 0);
    const ratingDisplay = ev.mediaValutazioni ? Number(ev.mediaValutazioni).toFixed(1) : (numReviews > 0 ? '5.0' : '-');

    return `
      <div class="org-event-card">
        <div class="org-card-thumb-box">
          ${thumbHtml}
          <span class="org-card-category-tag">${escapeHtml(ev.categoria || 'Generale')}</span>
          <span class="badge-tag ${statusClass} org-card-status-tag">${statusLabel}</span>
        </div>
        <div class="org-event-card-body">
          <h4>${escapeHtml(ev.titolo || 'Evento Senza Titolo')}</h4>
          <div class="org-card-meta-row">
            <i class="fa-regular fa-calendar"></i>
            <span>${formatEventDate(ev)}</span>
          </div>
          <div class="org-card-meta-row">
            <i class="fa-solid fa-location-dot"></i>
            <span>${escapeHtml(ev.luogo || 'Toscana')}</span>
          </div>

          <div class="org-card-badges-row">
            ${disabiliBadge}
            ${vegBadge}
          </div>

          <div class="org-card-stats-row">
            <span class="metric-pill red"><i class="fa-solid fa-heart"></i> ${likes}</span>
            <span class="metric-pill purple"><i class="fa-solid fa-comments"></i> ${numReviews}</span>
            <span class="rating-stars-badge"><i class="fa-solid fa-star"></i> ${ratingDisplay}</span>
          </div>

          <div class="org-card-actions">
            <button class="btn btn-secondary btn-sm btn-block" onclick="window.viewEventReviews('${ev.id}')">
              <i class="fa-solid fa-comments"></i> Leggi Feedback
            </button>
            <button class="btn btn-danger-outline btn-sm" onclick="window.deleteOrgEvent('${ev.id}', '${escapeHtml(ev.titolo || 'Evento')}')" title="Elimina questo evento">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteOrgEvent = async function(eventId, title) {
  if (!confirm(`Sei sicuro di voler eliminare permanentemente l'evento "${title}"?\n\nQuesta azione lo rimuoverà immediatamente da CosaFare.`)) {
    return;
  }

  try {
    await remove(ref(db, `eventi/${eventId}`));
    // Rimuove eventuali recensioni collegate
    try {
      await remove(ref(db, `recensioni/${eventId}`));
    } catch (e) {}

    showToast(`Evento "${title}" eliminato con successo.`, 'success');
  } catch (err) {
    console.error('Errore eliminazione evento:', err);
    showToast('Errore durante l\'eliminazione: ' + err.message, 'error');
  }
};

// ───────────────────────────────────────────────
// E) Organizer Support Chat Module (Two-Way Realtime with Admin)
// ───────────────────────────────────────────────

function setupOrganizerChatListener() {
  const orgId = currentOrganizerData?.id || currentUser?.uid;
  if (!orgId) return;

  const chatId = `admin_${orgId}`;
  const messagesRef = ref(db, `chats/${chatId}/messages`);

  if (orgChatListenerUnsub) {
    orgChatListenerUnsub();
    orgChatListenerUnsub = null;
  }

  orgChatListenerUnsub = onValue(messagesRef, (snapshot) => {
    const msgsObj = snapshot.val() || {};
    const msgsList = Object.entries(msgsObj).map(([id, m]) => ({ id, ...m }));
    msgsList.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    renderOrganizerChatMessages(msgsList);
  });
}

function renderOrganizerChatMessages(messages) {
  const body = document.getElementById('orgChatMessagesBody');
  if (!body) return;

  if (messages.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="margin: auto;">
        <i class="fa-regular fa-comments" style="font-size: 2.5rem;"></i>
        <p>Non ci sono ancora messaggi in questa conversazione.<br>Scrivi all'amministrazione per qualsiasi dubbio, richiesta o necessità di assistenza.</p>
      </div>
    `;
    return;
  }

  body.innerHTML = messages.map((m) => {
    const isMe = m.senderRole === 'ORGANIZZATORE' || m.senderId === (currentOrganizerData?.id || currentUser?.uid);
    const senderDisplay = isMe 
      ? 'Tu (Organizzatore)' 
      : 'Amministrazione CosaFare';

    return `
      <div class="message-bubble ${isMe ? 'admin-msg' : 'other-msg'}">
        <div class="msg-sender">${escapeHtml(senderDisplay)}</div>
        <div class="msg-text">${escapeHtml(m.testo)}</div>
        <div class="msg-time">${formatClockTime(m.timestamp)}</div>
      </div>
    `;
  }).join('');

  body.scrollTop = body.scrollHeight;
}

const orgChatSendForm = document.getElementById('orgChatSendForm');
const orgChatInputText = document.getElementById('orgChatInputText');

if (orgChatInputText) {
  orgChatInputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (orgChatSendForm) {
        orgChatSendForm.requestSubmit();
      }
    }
  });
}

if (orgChatSendForm) {
  orgChatSendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = orgChatInputText.value.trim();
    if (!text) return;

    const orgId = currentOrganizerData?.id || currentUser?.uid;
    const orgNome = currentOrganizerData?.nomeEnte || currentUser?.displayName || 'Organizzatore';
    const chatId = `admin_${orgId}`;
    const now = Date.now();

    try {
      const messagesRef = ref(db, `chats/${chatId}/messages`);
      const newMsgRef = push(messagesRef);

      const msgData = {
        id: newMsgRef.key,
        chatId: chatId,
        senderId: orgId,
        senderName: orgNome,
        senderRole: 'ORGANIZZATORE',
        testo: text,
        timestamp: now
      };

      await set(newMsgRef, msgData);

      // Aggiorna metadata chat room per notificare l'amministrazione
      await update(ref(db, `chats/${chatId}`), {
        id: chatId,
        tipo: 'ADMIN_ORGANIZZATORE',
        idOrganizzatore: orgId,
        nomeOrganizzatore: orgNome,
        ultimoMessaggio: text,
        timestampUltimoMessaggio: now
      });

      orgChatInputText.value = '';
    } catch (err) {
      showToast('Errore durante l\'invio del messaggio: ' + err.message, 'error');
    }
  });
}

// ───────────────────────────────────────────────
// E) Organizer Profile Module
// ───────────────────────────────────────────────

function renderOrganizerProfile() {
  if (!currentOrganizerData && !currentUser) return;
  const orgId = currentOrganizerData?.id || currentUser?.uid || '';
  const nome = currentOrganizerData?.nomeEnte || currentUser?.displayName || '';
  const email = currentOrganizerData?.emailEnte || currentUser?.email || '';
  const referente = currentOrganizerData?.referenteOrg || '';
  const telefono = currentOrganizerData?.telefonoEnte || '';
  const sede = currentOrganizerData?.sedeOrg || currentOrganizerData?.comuneEnte || '';
  const prov = currentOrganizerData?.provinciaEnte || '';
  const desc = currentOrganizerData?.descEnte || '';
  const verifiedSince = currentOrganizerData?.isEnteSince || 'Attivo';

  // Hero Card
  const avatarEl = document.getElementById('orgProfileAvatar');
  if (avatarEl) avatarEl.textContent = (nome || 'O').charAt(0).toUpperCase();
  const displayNomeEl = document.getElementById('orgProfileDisplayNome');
  if (displayNomeEl) displayNomeEl.textContent = nome || 'Organizzatore';
  const verifiedDateEl = document.getElementById('orgProfileVerifiedDate');
  if (verifiedDateEl) verifiedDateEl.textContent = verifiedSince;
  const uidEl = document.getElementById('orgProfileUid');
  if (uidEl) uidEl.textContent = orgId;
  const displayEmailEl = document.getElementById('orgProfileDisplayEmail');
  if (displayEmailEl) displayEmailEl.textContent = email;
  const displayLocEl = document.getElementById('orgProfileDisplayLocation');
  if (displayLocEl) displayLocEl.textContent = (sede ? sede + (prov ? ` (${prov})` : '') : (prov || 'Regione Toscana'));

  // Form Inputs
  const inNome = document.getElementById('opNomeEnte');
  if (inNome) inNome.value = nome;
  const inRef = document.getElementById('opReferente');
  if (inRef) inRef.value = referente;
  const inEmail = document.getElementById('opEmailEnte');
  if (inEmail) inEmail.value = email;
  const inTel = document.getElementById('opTelefonoEnte');
  if (inTel) inTel.value = telefono;
  const inSede = document.getElementById('opSede');
  if (inSede) inSede.value = sede;
  const inProv = document.getElementById('opProvincia');
  if (inProv) inProv.value = prov;
  const inDesc = document.getElementById('opDescrizione');
  if (inDesc) inDesc.value = desc;
}

function setupOrganizerProfileModule() {
  const form = document.getElementById('orgProfileForm');
  const btnReset = document.getElementById('btnResetOrgProfile');

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      renderOrganizerProfile();
      showToast('Dati del profilo ripristinati.', 'info');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const orgId = currentOrganizerData?.id || currentUser?.uid;
      if (!orgId) {
        showToast('Errore: utente organizzatore non valido.', 'error');
        return;
      }

      const nomeEnte = document.getElementById('opNomeEnte')?.value?.trim();
      const referenteOrg = document.getElementById('opReferente')?.value?.trim() || '';
      const emailEnte = document.getElementById('opEmailEnte')?.value?.trim() || '';
      const telefonoEnte = document.getElementById('opTelefonoEnte')?.value?.trim() || '';
      const sedeOrg = document.getElementById('opSede')?.value?.trim() || '';
      const provinciaEnte = document.getElementById('opProvincia')?.value?.trim() || '';
      const descEnte = document.getElementById('opDescrizione')?.value?.trim() || '';

      if (!nomeEnte) {
        showToast('Il nome dell\'ente organizzatore è obbligatorio.', 'error');
        return;
      }
      if (!emailEnte) {
        showToast('L\'email istituzionale è obbligatoria.', 'error');
        return;
      }

      const btnSave = document.getElementById('btnSaveOrgProfile');
      const oldBtnHtml = btnSave ? btnSave.innerHTML : '';
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Salvataggio...`;
      }

      try {
        const isEnteSince = currentOrganizerData?.isEnteSince || new Date().toLocaleDateString('it-IT');
        const updatedObj = {
          idEnte: orgId,
          nomeEnte: nomeEnte,
          referenteOrg: referenteOrg,
          emailEnte: emailEnte,
          telefonoEnte: telefonoEnte,
          sedeOrg: sedeOrg,
          comuneEnte: sedeOrg,
          provinciaEnte: provinciaEnte,
          descEnte: descEnte,
          isEnteSince: isEnteSince
        };

        // 1. Salva su /enti/{orgId}
        await update(ref(db, `enti/${orgId}`), updatedObj);

        // 2. Se il nome dell'ente è cambiato, aggiorna il campo 'organizzatore' su tutti i suoi eventi in /eventi
        const oldNome = currentOrganizerData?.nomeEnte;
        if (oldNome && oldNome.trim().toLowerCase() !== nomeEnte.toLowerCase()) {
          const evSnap = await get(ref(db, 'eventi'));
          if (evSnap.exists()) {
            const updates = {};
            evSnap.forEach((child) => {
              const ev = child.val();
              if (ev.idOrganizzatore === orgId || (ev.organizzatore && ev.organizzatore.trim().toLowerCase() === oldNome.trim().toLowerCase())) {
                updates[`eventi/${child.key}/organizzatore`] = nomeEnte;
              }
            });
            if (Object.keys(updates).length > 0) {
              await update(ref(db), updates);
            }
          }
        }

        // 3. Mantieni sincronizzato /utenti/{orgId}
        try {
          await update(ref(db, `utenti/${orgId}`), {
            username: nomeEnte,
            isEnte: true,
            ente: true,
            telefonoUser: telefonoEnte,
            comune: sedeOrg,
            provincia: provinciaEnte
          });
        } catch (eUt) {
          console.warn('Aggiornamento /utenti parziale:', eUt);
        }

        // 4. Aggiorna stato locale e UI
        currentOrganizerData = { ...(currentOrganizerData || {}), ...updatedObj };
        renderOrganizerProfile();

        // Aggiorna nome e avatar nella sidebar / topbar
        if (adminNameDisplay) adminNameDisplay.textContent = nomeEnte;
        if (adminEmailDisplay) adminEmailDisplay.textContent = emailEnte;
        if (adminAvatar) adminAvatar.textContent = nomeEnte.charAt(0).toUpperCase();

        // Aggiorna l'input sola-lettura in Carica Evento
        const ceOrgInput = document.getElementById('ceOrganizzatore');
        if (ceOrgInput) ceOrgInput.value = nomeEnte;

        showToast('Profilo organizzatore aggiornato con successo!', 'success');
      } catch (err) {
        console.error('Errore salvataggio profilo organizzatore:', err);
        showToast('Errore durante il salvataggio: ' + err.message, 'error');
      } finally {
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.innerHTML = oldBtnHtml;
        }
      }
    });
  }
}
setupOrganizerProfileModule();

