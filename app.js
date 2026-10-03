/**
 * CosaFare - Admin Web Dashboard
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
  signOut 
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
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ==========================================================================
// 2. Global State
// ==========================================================================

let currentAdminUser = null;
let activeChatId = null;
let chatRoomsData = {};
let activeChatListenerUnsub = null;
let rawEventsData = {};
let rawOrganizersData = {};
let rawUsersData = {};

// Chart Instances
let tabChartInstance = null;
let userRatioChartInstance = null;
let scrollTrendChartInstance = null;
let categoryChartInstance = null;
let provinceChartInstance = null;

// ==========================================================================
// 3. UI Selectors
// ==========================================================================

const authOverlay = document.getElementById('authOverlay');
const authAlert = document.getElementById('authAlert');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const adminNameDisplay = document.getElementById('adminName');
const adminEmailDisplay = document.getElementById('adminEmailDisplay');
const adminAvatar = document.getElementById('adminAvatar');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const refreshDataBtn = document.getElementById('refreshDataBtn');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const contentViews = document.querySelectorAll('.content-view');

// Chat UI
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

// Modals
const modalNewChat = document.getElementById('modalNewChat');
const modalTestReport = document.getElementById('modalTestReport');
const selectOrganizerForChat = document.getElementById('selectOrganizerForChat');
const btnConfirmStartChat = document.getElementById('btnConfirmStartChat');
const btnNewTestReport = document.getElementById('btnNewTestReport');
const btnSubmitTestReport = document.getElementById('btnSubmitTestReport');

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

// ==========================================================================
// 5. Admin Authentication & Gatekeeper
// ==========================================================================

async function verifyIsAdmin(uid, email) {
  try {
    const adminsSnapshot = await get(ref(db, 'admins'));
    if (!adminsSnapshot.exists()) {
      return false;
    }

    // 1. Direct check by UID in /admins/{uid}
    if (adminsSnapshot.hasChild(uid)) {
      const val = adminsSnapshot.child(uid).val();
      if (val === true || (typeof val === 'string' && val.toLowerCase() === 'true') || typeof val === 'object') {
        return true;
      }
    }

    // 2. Check by Email across children
    if (email) {
      const emailTrim = email.trim().toLowerCase();
      let found = false;
      adminsSnapshot.forEach((child) => {
        const childVal = child.val();
        if (typeof childVal === 'string' && childVal.trim().toLowerCase() === emailTrim) {
          found = true;
        } else if (childVal && childVal.email && childVal.email.trim().toLowerCase() === emailTrim) {
          found = true;
        }
      });
      if (found) return true;
    }

    return false;
  } catch (error) {
    console.error('Errore durante la verifica privilegi admin:', error);
    return false;
  }
}

// Monitor Auth State
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isAdmin = await verifyIsAdmin(user.uid, user.email);

    if (isAdmin) {
      currentAdminUser = user;
      authOverlay.classList.remove('active');
      hideAuthAlert();

      adminNameDisplay.textContent = user.displayName || 'Amministratore';
      adminEmailDisplay.textContent = user.email || user.uid;
      adminAvatar.textContent = (user.displayName || user.email || 'A').charAt(0).toUpperCase();

      showToast(`Benvenuto, ${user.displayName || user.email}!`, 'success');
      initializeLiveListeners();
    } else {
      // User is logged in with Firebase Auth, but NOT listed in /admins
      const userIdentifier = user.email || user.uid;
      showAuthAlert(`Accesso negato, ${userIdentifier} non è un amministratore`, 'error');
      showToast(`Accesso negato, ${userIdentifier} non è un amministratore`, 'error');
      // Sign out to prevent unauthorized access
      await signOut(auth);
      currentAdminUser = null;
      authOverlay.classList.add('active');
    }
  } else {
    currentAdminUser = null;
    authOverlay.classList.add('active');
  }
});

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

// Check redirect result on startup if returning from signInWithRedirect
getRedirectResult(auth).catch((error) => {
  console.error('[Auth] Errore Redirect Result:', error);
  showAuthAlert(formatAuthErrorMessage(error), 'error');
});

// Google Login
googleLoginBtn.addEventListener('click', async () => {
  console.log('[Auth] Cliccato Accedi con Google');
  hideAuthAlert();

  // Verifica protocollo di apertura
  if (window.location.protocol === 'file:') {
    showAuthAlert("Attenzione: Non puoi effettuare il login aprendo index.html direttamente dal file system (file://). Avvia 'start.bat' e accedi da http://localhost:3000", "error");
    return;
  }

  // Verifica hostname
  if (window.location.hostname === '127.0.0.1') {
    showAuthAlert("Attenzione: Firebase autorizza 'localhost' di default, ma non '127.0.0.1'. Ricarica la pagina su http://localhost:3000", "error");
    return;
  }

  const originalHtml = googleLoginBtn.innerHTML;
  googleLoginBtn.disabled = true;
  googleLoginBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Apertura finestra Google...`;

  try {
    showToast('Apertura finestra di autenticazione Google...', 'info');
    await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Popup completato con successo');
  } catch (error) {
    console.error('[Auth] Errore Google Sign-In con popup:', error);

    // Se il popup è stato bloccato dal browser, effettua il fallback con reindirizzamento completo
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

// Logout
logoutBtn.addEventListener('click', async () => {
  if (confirm('Vuoi davvero uscire dal Pannello di Controllo?')) {
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
  }
};

navItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');

    navItems.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    contentViews.forEach((view) => {
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
  });
});

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
