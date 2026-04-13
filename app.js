/* ============================================
   ExpenseFlow — App Logic with Firebase Backend
   ============================================ */

const CATEGORIES = [
    { id: 'food', name: 'Food & Dining', icon: '🍔', color: '#f87171', bg: 'rgba(248,113,113,.15)' },
    { id: 'transport', name: 'Transportation', icon: '🚗', color: '#fbbf24', bg: 'rgba(251,191,36,.15)' },
    { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#f472b6', bg: 'rgba(244,114,182,.15)' },
    { id: 'housing', name: 'Housing', icon: '🏠', color: '#60a5fa', bg: 'rgba(96,165,250,.15)' },
    { id: 'utilities', name: 'Utilities', icon: '💡', color: '#a78bfa', bg: 'rgba(167,139,250,.15)' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎮', color: '#34d399', bg: 'rgba(52,211,153,.15)' },
    { id: 'healthcare', name: 'Healthcare', icon: '💊', color: '#22d3ee', bg: 'rgba(34,211,238,.15)' },
    { id: 'education', name: 'Education', icon: '📚', color: '#c084fc', bg: 'rgba(192,132,252,.15)' },
];

let state = { user: null, expenses: [], currency: '$', theme: 'dark', currentView: 'dashboard', selectedCategory: null, editingExpenseId: null };
let unsubExpenses = null; // Firestore listener

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const getLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const formatCurrency = a => `${state.currency}${Number(a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const formatDateShort = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const getCategoryById = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const getInitials = name => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// ── Firebase Data Layer ──
const DataLayer = {
    async addExpense(expense) {
        if (FIREBASE_ENABLED && state.user) {
            await db.collection('users').doc(state.user.uid).collection('expenses').doc(expense.id).set(expense);
        } else {
            state.expenses.unshift(expense);
            setLS('ef_expenses', state.expenses);
        }
    },
    async updateExpense(id, data) {
        if (FIREBASE_ENABLED && state.user) {
            await db.collection('users').doc(state.user.uid).collection('expenses').doc(id).update(data);
        } else {
            const idx = state.expenses.findIndex(e => e.id === id);
            if (idx >= 0) { state.expenses[idx] = { ...state.expenses[idx], ...data }; setLS('ef_expenses', state.expenses); }
        }
    },
    async deleteExpense(id) {
        if (FIREBASE_ENABLED && state.user) {
            await db.collection('users').doc(state.user.uid).collection('expenses').doc(id).delete();
        } else {
            state.expenses = state.expenses.filter(e => e.id !== id);
            setLS('ef_expenses', state.expenses);
        }
    },
    async clearAllExpenses() {
        if (FIREBASE_ENABLED && state.user) {
            const snap = await db.collection('users').doc(state.user.uid).collection('expenses').get();
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } else { state.expenses = []; setLS('ef_expenses', []); }
    },
    async loadSampleData(expenses) {
        if (FIREBASE_ENABLED && state.user) {
            const ref = db.collection('users').doc(state.user.uid).collection('expenses');
            // Delete existing first
            const snap = await ref.get();
            const batch1 = db.batch();
            snap.forEach(doc => batch1.delete(doc.ref));
            await batch1.commit();
            // Add in batches of 400 (Firestore limit is 500)
            for (let i = 0; i < expenses.length; i += 400) {
                const batch = db.batch();
                expenses.slice(i, i + 400).forEach(e => batch.set(ref.doc(e.id), e));
                await batch.commit();
            }
        } else { state.expenses = expenses; setLS('ef_expenses', expenses); }
    },
    async saveUserProfile(profile) {
        if (FIREBASE_ENABLED && state.user) {
            await db.collection('users').doc(state.user.uid).set(profile, { merge: true });
        }
        setLS('ef_user', profile);
    },
    subscribeToExpenses(callback) {
        if (FIREBASE_ENABLED && state.user) {
            if (unsubExpenses) unsubExpenses();
            unsubExpenses = db.collection('users').doc(state.user.uid).collection('expenses')
                .orderBy('createdAt', 'desc')
                .onSnapshot(snapshot => {
                    state.expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    callback();
                }, err => { console.error('Firestore listen error:', err); });
        } else {
            state.expenses = getLS('ef_expenses', []);
            callback();
        }
    }
};

// ── Toast System ──
function showToast(title, message, type = 'info') {
    const container = $('#toast-container');
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    };
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-icon toast-${type}">${icons[type]}</div><div class="toast-content"><div class="toast-title">${title}</div>${message ? `<div class="toast-message">${message}</div>` : ''}</div><button class="toast-close" onclick="this.closest('.toast').classList.add('removing');setTimeout(()=>this.closest('.toast').remove(),300)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ── Splash Screen ──
function initSplash() {
    const particlesEl = $('#splash-particles');
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'splash-particle';
        p.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 4}s;animation-duration:${3 + Math.random() * 3}s`;
        particlesEl.appendChild(p);
    }
    setTimeout(() => {
        const splash = $('#splash-screen');
        splash.classList.add('fade-out');
        setTimeout(() => {
            splash.style.display = 'none';
            if (FIREBASE_ENABLED) {
                // Firebase auth state listener handles routing
                auth.onAuthStateChanged(handleAuthState);
            } else {
                const user = getLS('ef_user', null);
                if (user) { state.user = user; showMainApp(); } else { showAuth(); }
            }
        }, 500);
    }, 2500);
}

function handleAuthState(firebaseUser) {
    if (firebaseUser) {
        state.user = { uid: firebaseUser.uid, name: firebaseUser.displayName || firebaseUser.email.split('@')[0], email: firebaseUser.email, initials: getInitials(firebaseUser.displayName || firebaseUser.email.split('@')[0]) };
        setLS('ef_user', state.user);
        showMainApp();
    } else {
        state.user = null;
        showAuth();
    }
}

// ── Auth ──
let isLoginMode = true;

function showAuth() {
    $('#auth-screen').classList.remove('hidden');
    $('#main-app').classList.add('hidden');
    lucide.createIcons();
}

function initAuth() {
    const toggleBtn = $('#auth-toggle-btn');
    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        $('#auth-title').textContent = isLoginMode ? 'Welcome back' : 'Create account';
        $('#auth-subtitle').textContent = isLoginMode ? 'Sign in to continue tracking your expenses' : 'Start your journey to smarter spending';
        $('#auth-name-field').classList.toggle('hidden', isLoginMode);
        $('#auth-submit-btn').querySelector('span').textContent = isLoginMode ? 'Sign In' : 'Sign Up';
        $('#auth-toggle-text').textContent = isLoginMode ? "Don't have an account?" : 'Already have an account?';
        toggleBtn.textContent = isLoginMode ? 'Sign up' : 'Sign in';
    });

    $('#password-toggle').addEventListener('click', () => {
        const input = $('#auth-password');
        input.type = input.type === 'password' ? 'text' : 'password';
    });

    $('#auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#auth-email').value.trim();
        const password = $('#auth-password').value;
        const name = $('#auth-name').value.trim() || email.split('@')[0];
        if (!email || !password) return;

        const submitBtn = $('#auth-submit-btn');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Please wait...';

        try {
            if (FIREBASE_ENABLED) {
                let cred;
                if (isLoginMode) {
                    cred = await auth.signInWithEmailAndPassword(email, password);
                } else {
                    cred = await auth.createUserWithEmailAndPassword(email, password);
                    await cred.user.updateProfile({ displayName: name });
                    await db.collection('users').doc(cred.user.uid).set({ name, email, currency: '$', theme: 'dark', createdAt: Date.now() });
                }
                showToast('Welcome!', `Signed in as ${cred.user.displayName || name}`, 'success');
                // onAuthStateChanged will handle the rest
            } else {
                const user = { name, email, initials: getInitials(name) };
                state.user = user;
                setLS('ef_user', user);
                showToast('Welcome!', `Signed in as ${name} (Local Mode)`, 'success');
                showMainApp();
            }
        } catch (err) {
            const msg = { 'auth/user-not-found': 'No account with this email', 'auth/wrong-password': 'Incorrect password', 'auth/email-already-in-use': 'Email already registered', 'auth/weak-password': 'Password should be at least 6 characters', 'auth/invalid-email': 'Invalid email address', 'auth/invalid-credential': 'Invalid email or password' };
            showToast('Auth Error', msg[err.code] || err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = isLoginMode ? 'Sign In' : 'Sign Up';
        }
    });

    $('#google-auth-btn').addEventListener('click', async () => {
        try {
            if (FIREBASE_ENABLED) {
                const provider = new firebase.auth.GoogleAuthProvider();
                const result = await auth.signInWithPopup(provider);
                const u = result.user;
                await db.collection('users').doc(u.uid).set({ name: u.displayName, email: u.email, currency: '$', theme: 'dark' }, { merge: true });
                showToast('Welcome!', `Signed in as ${u.displayName}`, 'success');
            } else {
                state.user = { name: 'Google User', email: 'user@gmail.com', initials: 'GU' };
                setLS('ef_user', state.user);
                showToast('Welcome!', 'Signed in (Local Mode)', 'success');
                showMainApp();
            }
        } catch (err) {
            if (err.code !== 'auth/popup-closed-by-user') showToast('Auth Error', err.message, 'error');
        }
    });
}

function showMainApp() {
    $('#auth-screen').classList.add('hidden');
    $('#main-app').classList.remove('hidden');
    state.currency = getLS('ef_currency', '$');
    state.theme = getLS('ef_theme', 'dark');
    document.documentElement.setAttribute('data-theme', state.theme);
    const darkToggle = $('#setting-dark-mode');
    if (darkToggle) darkToggle.checked = state.theme === 'dark';
    updateUserUI();
    initCategoryPicker();
    initCategoryFilter();
    $('#currency-prefix').textContent = state.currency;

    // Subscribe to real-time expenses
    DataLayer.subscribeToExpenses(() => {
        if (state.expenses.length === 0 && !state._samplePrompted) {
            state._samplePrompted = true;
            generateAndLoadSampleData();
            showToast('Sample Data', '30 days of realistic expenses loaded', 'info');
        }
        renderCurrentView();
    });
    lucide.createIcons();
}

function renderCurrentView() {
    if (state.currentView === 'dashboard') renderDashboard();
    if (state.currentView === 'transactions') renderTransactions();
    if (state.currentView === 'analytics') renderAnalytics();
}

function updateUserUI() {
    if (!state.user) return;
    const initials = state.user.initials || getInitials(state.user.name);
    ['#sidebar-user-avatar', '#topbar-user-avatar'].forEach(s => { const el = $(s); if (el) el.textContent = initials; });
    ['#sidebar-user-name', '#settings-user-name'].forEach(s => { const el = $(s); if (el) el.textContent = state.user.name; });
    const emailEl = $('#sidebar-user-email');
    if (emailEl) emailEl.textContent = state.user.email;
}

// ── Navigation ──
function initNavigation() {
    $$('.nav-item, .bottom-nav-item').forEach(item => {
        if (item.classList.contains('fab-placeholder')) return;
        item.addEventListener('click', () => { if (item.dataset.view) switchView(item.dataset.view); });
    });
}

function switchView(viewName) {
    state.currentView = viewName;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewName));
    $$('.bottom-nav-item').forEach(n => { if (n.dataset.view) n.classList.toggle('active', n.dataset.view === viewName); });
    $$('.view').forEach(v => v.classList.remove('active'));
    const viewEl = $(`#view-${viewName}`);
    if (viewEl) viewEl.classList.add('active');
    const titles = { dashboard: ['Dashboard', "Welcome back! Here's your financial overview."], transactions: ['Transactions', 'View and manage all your expenses.'], analytics: ['Analytics', 'Detailed insights into your spending patterns.'], settings: ['Settings', 'Customize your experience.'] };
    const [t, s] = titles[viewName] || ['', ''];
    $('#topbar-title').textContent = t; $('#topbar-subtitle').textContent = s;
    renderCurrentView();
    closeSidebar();
}

// ── Sidebar ──
function initSidebar() {
    $('#hamburger-btn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebar-overlay')?.classList.add('show'); });
    $('#sidebar-close-btn').addEventListener('click', closeSidebar);
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay'; overlay.id = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
}
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-overlay')?.classList.remove('show'); }

// ── Theme ──
function initTheme() {
    state.theme = getLS('ef_theme', 'dark');
    document.documentElement.setAttribute('data-theme', state.theme);
    const dt = $('#setting-dark-mode'); if (dt) dt.checked = state.theme === 'dark';
    $('#theme-toggle-btn').addEventListener('click', () => toggleTheme());
    if (dt) dt.addEventListener('change', () => toggleTheme(dt.checked ? 'dark' : 'light'));
}

function toggleTheme(forced) {
    const t = forced || (state.theme === 'dark' ? 'light' : 'dark');
    state.theme = t; document.documentElement.setAttribute('data-theme', t);
    setLS('ef_theme', t);
    const dt = $('#setting-dark-mode'); if (dt) dt.checked = t === 'dark';
    renderCurrentView();
}

// ── Currency ──
function initCurrency() {
    const sel = $('#setting-currency');
    state.currency = getLS('ef_currency', '$');
    if (sel) {
        sel.value = state.currency;
        sel.addEventListener('change', () => {
            state.currency = sel.value; setLS('ef_currency', state.currency);
            $('#currency-prefix').textContent = state.currency;
            renderDashboard();
            showToast('Currency Updated', `Set to ${state.currency}`, 'success');
        });
    }
    $('#currency-prefix').textContent = state.currency;
}

// ── Category Picker ──
function initCategoryPicker() {
    const picker = $('#category-picker'); if (!picker) return;
    picker.innerHTML = CATEGORIES.map(c => `<button type="button" class="category-chip" data-category="${c.id}" title="${c.name}"><span class="category-chip-icon">${c.icon}</span><span>${c.name.split(' ')[0]}</span></button>`).join('');
    picker.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            picker.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active'); state.selectedCategory = chip.dataset.category;
        });
    });
}
function initCategoryFilter() {
    const f = $('#filter-category'); if (!f) return;
    f.innerHTML = '<option value="all">All Categories</option>' + CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

// ── Expense Modal ──
function initExpenseModal() {
    $('#fab-add-expense').addEventListener('click', () => openExpenseModal());
    $('#bottom-fab-placeholder').addEventListener('click', () => openExpenseModal());
    $('#modal-close-btn').addEventListener('click', closeExpenseModal);
    $('#modal-cancel-btn').addEventListener('click', closeExpenseModal);
    $('#expense-modal-overlay').addEventListener('click', e => { if (e.target.id === 'expense-modal-overlay') closeExpenseModal(); });
    $('#expense-form').addEventListener('submit', handleExpenseSubmit);
    $('#expense-date').value = new Date().toISOString().split('T')[0];
}

function openExpenseModal(expenseId = null) {
    const form = $('#expense-form');
    if (expenseId) {
        const exp = state.expenses.find(e => e.id === expenseId);
        if (!exp) return;
        state.editingExpenseId = expenseId;
        $('#modal-title').textContent = 'Edit Expense';
        $('#modal-submit-text').textContent = 'Save Changes';
        $('#expense-amount').value = exp.amount;
        $('#expense-description').value = exp.description;
        $('#expense-date').value = exp.date;
        $('#expense-payment').value = exp.payment || 'cash';
        $('#expense-notes').value = exp.notes || '';
        $('#expense-edit-id').value = expenseId;
        $$('.category-chip').forEach(c => c.classList.remove('active'));
        const cc = $(`.category-chip[data-category="${exp.category}"]`);
        if (cc) cc.classList.add('active');
        state.selectedCategory = exp.category;
    } else {
        state.editingExpenseId = null;
        $('#modal-title').textContent = 'Add Expense';
        $('#modal-submit-text').textContent = 'Add Expense';
        form.reset(); $('#expense-date').value = new Date().toISOString().split('T')[0];
        $$('.category-chip').forEach(c => c.classList.remove('active'));
        state.selectedCategory = null; $('#expense-edit-id').value = '';
    }
    $('#expense-modal-overlay').classList.add('show');
    setTimeout(() => $('#expense-amount').focus(), 100);
}
function closeExpenseModal() { $('#expense-modal-overlay').classList.remove('show'); state.editingExpenseId = null; state.selectedCategory = null; }

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const amount = parseFloat($('#expense-amount').value);
    const description = $('#expense-description').value.trim();
    const date = $('#expense-date').value;
    const payment = $('#expense-payment').value;
    const notes = $('#expense-notes').value.trim();
    const category = state.selectedCategory;
    if (!amount || !description || !date || !category) { showToast('Missing Fields', 'Fill all required fields & select a category', 'error'); return; }

    const editId = $('#expense-edit-id').value;
    try {
        if (editId) {
            await DataLayer.updateExpense(editId, { amount, description, date, payment, notes, category });
            showToast('Updated', 'Expense updated successfully', 'success');
        } else {
            await DataLayer.addExpense({ id: genId(), amount, description, date, payment, notes, category, createdAt: Date.now() });
            showToast('Added', `${formatCurrency(amount)} expense recorded`, 'success');
        }
    } catch (err) { showToast('Error', err.message, 'error'); }
    closeExpenseModal();
    if (!FIREBASE_ENABLED) renderCurrentView(); // Firestore listener handles it otherwise
}

// Make accessible from inline onclick
window.openExpenseModal = openExpenseModal;
window.deleteExpense = async function (id) {
    showConfirm('Delete Expense', 'Are you sure? This cannot be undone.', async () => {
        try {
            await DataLayer.deleteExpense(id);
            showToast('Deleted', 'Expense removed', 'success');
            if (!FIREBASE_ENABLED) renderCurrentView();
        } catch (err) { showToast('Error', err.message, 'error'); }
    });
};

// ── Confirm Modal ──
let confirmCb = null;
function showConfirm(title, message, onConfirm) {
    $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
    confirmCb = onConfirm; $('#confirm-modal-overlay').classList.add('show');
}
function initConfirmModal() {
    $('#confirm-ok-btn').addEventListener('click', () => { if (confirmCb) confirmCb(); $('#confirm-modal-overlay').classList.remove('show'); confirmCb = null; });
    ['#confirm-cancel-btn', '#confirm-modal-close-btn'].forEach(s => $(s).addEventListener('click', () => { $('#confirm-modal-overlay').classList.remove('show'); confirmCb = null; }));
}

// ── Name Modal ──
function initNameModal() {
    $('#setting-edit-name-btn').addEventListener('click', () => { $('#new-name').value = state.user?.name || ''; $('#name-modal-overlay').classList.add('show'); });
    ['#name-modal-close-btn', '#name-cancel-btn'].forEach(s => $(s).addEventListener('click', () => $('#name-modal-overlay').classList.remove('show')));
    $('#name-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const n = $('#new-name').value.trim(); if (!n) return;
        state.user.name = n; state.user.initials = getInitials(n);
        if (FIREBASE_ENABLED) { await auth.currentUser.updateProfile({ displayName: n }); await DataLayer.saveUserProfile({ name: n }); }
        setLS('ef_user', state.user); updateUserUI();
        $('#name-modal-overlay').classList.remove('show');
        showToast('Updated', 'Profile name updated', 'success');
    });
}

// ── Dashboard ──
function renderDashboard() {
    const now = new Date();
    const thisMonth = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const total = thisMonth.reduce((s, e) => s + e.amount, 0);
    const avg = total / Math.max(now.getDate(), 1);
    const catTotals = {};
    thisMonth.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

    $('#stat-total-value').textContent = formatCurrency(total);
    $('#stat-avg-value').textContent = formatCurrency(avg);
    $('#stat-category-value').textContent = topCat ? getCategoryById(topCat[0]).name.split(' ')[0] : '—';
    $('#stat-transactions-value').textContent = thisMonth.length.toString();

    const recent = [...state.expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    renderTransactionsList(recent, '#recent-transactions-list', false);
    renderTrendChart(); renderCategoryDonut();
}

function renderTransactionsList(expenses, containerSel, showActions = true) {
    const c = $(containerSel); if (!c) return;
    if (!expenses.length) { c.innerHTML = '<div class="transactions-empty"><p>No expenses found</p></div>'; return; }
    c.innerHTML = expenses.map(e => {
        const cat = getCategoryById(e.category);
        return `<div class="transaction-item" data-id="${e.id}"><div class="transaction-category-icon" style="background:${cat.bg};color:${cat.color}">${cat.icon}</div><div class="transaction-info"><div class="transaction-desc">${e.description}</div><div class="transaction-meta"><span>${cat.name}</span><span>•</span><span>${formatDate(e.date)}</span>${e.payment ? `<span>•</span><span>${capitalize(e.payment)}</span>` : ''}</div></div><div class="transaction-amount">-${formatCurrency(e.amount)}</div>${showActions ? `<div class="transaction-actions"><button class="btn-icon" onclick="openExpenseModal('${e.id}')" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg></button><button class="btn-icon" onclick="deleteExpense('${e.id}')" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button></div>` : ''}</div>`;
    }).join('');
}

// ── Charts ──
let trendChart = null, donutChart = null, lineChart = null, barChart = null, pieChart = null;
function chartColors() {
    const dk = state.theme === 'dark';
    return { text: dk ? '#94a3b8' : '#64748b', grid: dk ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)', tbg: dk ? '#1e1b4b' : '#fff', tt: dk ? '#f1f5f9' : '#0f172a', tb: dk ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)' };
}
function tooltipOpts(cc) { return { backgroundColor: cc.tbg, titleColor: cc.tt, bodyColor: cc.tt, borderColor: cc.tb, borderWidth: 1, padding: 12, cornerRadius: 8 }; }

function renderTrendChart() {
    const canvas = $('#trend-chart'); if (!canvas) return;
    const period = parseInt($('#trend-period')?.value || 30), cc = chartColors();
    const daily = {};
    for (let i = period - 1; i >= 0; i--) daily[daysAgo(i)] = 0;
    state.expenses.forEach(e => { if (daily.hasOwnProperty(e.date)) daily[e.date] += e.amount; });
    if (trendChart) trendChart.destroy();
    const ctx = canvas.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, 'rgba(99,102,241,.3)'); g.addColorStop(1, 'rgba(99,102,241,.01)');
    trendChart = new Chart(ctx, { type: 'line', data: { labels: Object.keys(daily).map(formatDateShort), datasets: [{ label: 'Daily Spending', data: Object.values(daily), borderColor: '#6366f1', backgroundColor: g, borderWidth: 2.5, fill: true, tension: .4, pointRadius: 0, pointHoverRadius: 6, pointHoverBackgroundColor: '#6366f1', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(cc), displayColors: false, callbacks: { label: c => `Spent: ${formatCurrency(c.parsed.y)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: cc.text, font: { size: 11 }, maxTicksLimit: 8 }, border: { display: false } }, y: { grid: { color: cc.grid }, ticks: { color: cc.text, font: { size: 11 }, callback: v => state.currency + v }, border: { display: false } } } } });
}

function renderCategoryDonut() {
    const canvas = $('#category-donut-chart'); if (!canvas) return;
    const cc = chartColors(), catT = {};
    state.expenses.forEach(e => { catT[e.category] = (catT[e.category] || 0) + e.amount; });
    const sorted = Object.entries(catT).sort((a, b) => b[1] - a[1]);
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(canvas.getContext('2d'), { type: 'doughnut', data: { labels: sorted.map(([id]) => getCategoryById(id).name), datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: sorted.map(([id]) => getCategoryById(id).color), borderWidth: 0, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { color: cc.text, padding: 12, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } }, tooltip: { ...tooltipOpts(cc), callbacks: { label: c => ` ${c.label}: ${formatCurrency(c.parsed)}` } } } } });
}

// ── Transactions View ──
function renderTransactions() {
    let f = [...state.expenses];
    const df = $('#filter-date-from')?.value, dt = $('#filter-date-to')?.value, cf = $('#filter-category')?.value, sf = $('#filter-sort')?.value;
    if (df) f = f.filter(e => e.date >= df);
    if (dt) f = f.filter(e => e.date <= dt);
    if (cf && cf !== 'all') f = f.filter(e => e.category === cf);
    switch (sf) {
        case 'date-asc': f.sort((a, b) => new Date(a.date) - new Date(b.date)); break;
        case 'amount-desc': f.sort((a, b) => b.amount - a.amount); break;
        case 'amount-asc': f.sort((a, b) => a.amount - b.amount); break;
        default: f.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    renderTransactionsList(f, '#full-transactions-list', true);
}
function initFilters() { ['#filter-date-from', '#filter-date-to', '#filter-category', '#filter-sort'].forEach(s => { const el = $(s); if (el) el.addEventListener('change', renderTransactions); }); }

// ── Analytics ──
function renderAnalytics() {
    const cc = chartColors();
    // Line chart
    const lc = $('#analytics-line-chart');
    if (lc) {
        const period = parseInt($('#analytics-trend-period')?.value || 30), daily = {};
        for (let i = period - 1; i >= 0; i--) daily[daysAgo(i)] = 0;
        state.expenses.forEach(e => { if (daily.hasOwnProperty(e.date)) daily[e.date] += e.amount; });
        const data = Object.values(daily), mavg = data.map((_, i) => { const w = data.slice(Math.max(0, i - 6), i + 1); return w.reduce((s, v) => s + v, 0) / w.length; });
        if (lineChart) lineChart.destroy();
        const ctx = lc.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 320);
        g.addColorStop(0, 'rgba(99,102,241,.25)'); g.addColorStop(1, 'rgba(99,102,241,.01)');
        lineChart = new Chart(ctx, { type: 'line', data: { labels: Object.keys(daily).map(formatDateShort), datasets: [{ label: 'Daily Spending', data, borderColor: '#6366f1', backgroundColor: g, borderWidth: 2, fill: true, tension: .4, pointRadius: 0, pointHoverRadius: 5 }, { label: '7-day Average', data: mavg, borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], fill: false, tension: .4, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: cc.text, usePointStyle: true, padding: 16 } }, tooltip: { ...tooltipOpts(cc), callbacks: { label: c => ` ${c.dataset.label}: ${formatCurrency(c.parsed.y)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: cc.text, maxTicksLimit: 10 }, border: { display: false } }, y: { grid: { color: cc.grid }, ticks: { color: cc.text, callback: v => state.currency + v }, border: { display: false } } } } });
    }
    // Bar chart
    const bc = $('#analytics-bar-chart');
    if (bc) {
        const catC = {}; state.expenses.forEach(e => { catC[e.category] = (catC[e.category] || 0) + 1; });
        const sorted = Object.entries(catC).sort((a, b) => b[1] - a[1]);
        if (barChart) barChart.destroy();
        barChart = new Chart(bc.getContext('2d'), { type: 'bar', data: { labels: sorted.map(([id]) => getCategoryById(id).name), datasets: [{ label: 'Transactions', data: sorted.map(([, v]) => v), backgroundColor: sorted.map(([id]) => getCategoryById(id).color + '99'), borderColor: sorted.map(([id]) => getCategoryById(id).color), borderWidth: 1.5, borderRadius: 8, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(cc), callbacks: { label: c => ` ${c.parsed.x} transactions` } } }, scales: { x: { grid: { color: cc.grid }, ticks: { color: cc.text }, border: { display: false } }, y: { grid: { display: false }, ticks: { color: cc.text }, border: { display: false } } } } });
    }
    // Pie chart
    const pc = $('#analytics-pie-chart');
    if (pc) {
        const catT = {}; state.expenses.forEach(e => { catT[e.category] = (catT[e.category] || 0) + e.amount; });
        const sorted = Object.entries(catT).sort((a, b) => b[1] - a[1]), data = sorted.map(([, v]) => v);
        if (pieChart) pieChart.destroy();
        pieChart = new Chart(pc.getContext('2d'), { type: 'pie', data: { labels: sorted.map(([id]) => getCategoryById(id).name), datasets: [{ data, backgroundColor: sorted.map(([id]) => getCategoryById(id).color), borderWidth: 2, borderColor: state.theme === 'dark' ? '#0a0a1a' : '#f8fafc', hoverOffset: 12 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: cc.text, padding: 12, usePointStyle: true } }, tooltip: { ...tooltipOpts(cc), callbacks: { label: c => ` ${c.label}: ${formatCurrency(c.parsed)} (${((c.parsed / data.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%)` } } } } });
    }
    // Top expenses
    const topEl = $('#top-expenses-list');
    if (topEl) {
        const top = [...state.expenses].sort((a, b) => b.amount - a.amount).slice(0, 8);
        topEl.innerHTML = top.map((e, i) => { const cat = getCategoryById(e.category); return `<div class="top-expense-item"><div class="top-expense-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</div><div class="transaction-category-icon" style="background:${cat.bg};color:${cat.color};width:36px;height:36px;font-size:1rem">${cat.icon}</div><div class="top-expense-info"><div class="top-expense-name">${e.description}</div><div class="top-expense-category">${cat.name} · ${formatDate(e.date)}</div></div><div class="top-expense-amount">-${formatCurrency(e.amount)}</div></div>`; }).join('');
    }
}

// ── CSV Export ──
function exportCSV() {
    if (!state.expenses.length) { showToast('No Data', 'Nothing to export', 'error'); return; }
    const rows = [['Date', 'Description', 'Category', 'Amount', 'Payment', 'Notes'].join(',')];
    state.expenses.forEach(e => { rows.push([e.date, `"${e.description}"`, getCategoryById(e.category).name, e.amount.toFixed(2), e.payment || 'cash', `"${e.notes || ''}"`].join(',')); });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `expenseflow_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    showToast('Exported', 'CSV downloaded', 'success');
}

// ── Sample Data ──
function generateSampleExpenses() {
    const descs = { food: ['Morning Coffee', 'Lunch at Cafe', 'Dinner with Friends', 'Grocery Shopping', 'Food Delivery', 'Pizza Night', 'Sushi Takeout'], transport: ['Uber Ride', 'Metro Pass', 'Gas Station', 'Parking Fee', 'Taxi', 'Bus Fare'], shopping: ['Amazon Order', 'New Clothes', 'Electronics', 'Home Decor', 'Gift for Friend', 'Shoes'], housing: ['Monthly Rent', 'Home Insurance', 'Maintenance Fee', 'Furniture'], utilities: ['Electricity Bill', 'Internet Bill', 'Water Bill', 'Phone Plan', 'Gas Bill'], entertainment: ['Netflix', 'Movie Tickets', 'Concert Tickets', 'Gaming', 'Spotify'], healthcare: ['Doctor Visit', 'Pharmacy', 'Gym Membership', 'Dental Checkup', 'Vitamins'], education: ['Online Course', 'Textbooks', 'Workshop Fee', 'Certification Exam'] };
    const payments = ['cash', 'card', 'upi', 'bank'], expenses = [];
    for (let day = 0; day < 30; day++) {
        const date = daysAgo(day), n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
            const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
            const dl = descs[cat.id], desc = dl[Math.floor(Math.random() * dl.length)];
            let amt;
            switch (cat.id) { case 'food': amt = 5 + Math.random() * 45; break; case 'transport': amt = 3 + Math.random() * 35; break; case 'shopping': amt = 15 + Math.random() * 150; break; case 'housing': amt = day % 29 === 0 ? 800 + Math.random() * 700 : 10 + Math.random() * 50; break; case 'utilities': amt = 20 + Math.random() * 100; break; case 'entertainment': amt = 8 + Math.random() * 50; break; case 'healthcare': amt = 15 + Math.random() * 120; break; case 'education': amt = 10 + Math.random() * 80; break; default: amt = 10 + Math.random() * 50; }
            expenses.push({ id: genId(), amount: Math.round(amt * 100) / 100, description: desc, date, category: cat.id, payment: payments[Math.floor(Math.random() * payments.length)], notes: '', createdAt: Date.now() - day * 86400000 });
        }
    }
    return expenses;
}

async function generateAndLoadSampleData() {
    const expenses = generateSampleExpenses();
    await DataLayer.loadSampleData(expenses);
    if (!FIREBASE_ENABLED) { state.expenses = expenses; renderCurrentView(); }
}

// ── Settings ──
function initSettings() {
    $('#setting-export-btn').addEventListener('click', exportCSV);
    $('#export-csv-btn').addEventListener('click', exportCSV);
    $('#setting-sample-data-btn').addEventListener('click', () => {
        showConfirm('Load Sample Data', 'Replace current data with 30 days of sample expenses?', async () => {
            await generateAndLoadSampleData();
            showToast('Loaded', '30 days of expenses generated', 'success');
        });
    });
    $('#setting-clear-data-btn').addEventListener('click', () => {
        showConfirm('Clear All Data', 'Permanently delete all expense data? This cannot be undone.', async () => {
            await DataLayer.clearAllExpenses();
            showToast('Cleared', 'All data removed', 'success');
            if (!FIREBASE_ENABLED) renderCurrentView();
        });
    });
    $('#setting-logout-btn').addEventListener('click', logout);
}

async function logout() {
    showConfirm('Sign Out', 'Are you sure you want to sign out?', async () => {
        if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
        if (FIREBASE_ENABLED) { await auth.signOut(); }
        localStorage.removeItem('ef_user'); state.user = null;
        window.location.reload();
    });
}

function initMiscListeners() {
    $('#view-all-transactions-btn').addEventListener('click', () => switchView('transactions'));
    $('#logout-btn').addEventListener('click', () => logout());
    $('#trend-period')?.addEventListener('change', renderTrendChart);
    $('#analytics-trend-period')?.addEventListener('change', renderAnalytics);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    initSplash(); initAuth(); initTheme(); initNavigation(); initSidebar();
    initCurrency(); initExpenseModal(); initConfirmModal(); initNameModal();
    initFilters(); initSettings(); initMiscListeners();
    lucide.createIcons();
    if (!FIREBASE_ENABLED) console.log('%c🏠 Running in LOCAL MODE — Set up Firebase for real-time sync!', 'color:#f59e0b;font-size:14px;font-weight:bold');
    else console.log('%c🔥 Running with FIREBASE — Real-time sync enabled!', 'color:#22c55e;font-size:14px;font-weight:bold');
});
