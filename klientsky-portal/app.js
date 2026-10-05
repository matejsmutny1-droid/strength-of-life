import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const authScreen = document.getElementById('authScreen');
const authSetup = document.getElementById('authSetup');
const authForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const setPasswordForm = document.getElementById('setPasswordForm');
const authMessage = document.getElementById('authMessage');
const appShell = document.getElementById('appShell');
const categories = [];
let supabase;
let currentUser;
let currentProfile;
let enteringUserId = null;
let clients = [];
let guides = [];
let assignments = [];
let activeCategory = 'all';
let selectedClientId = null;
let toastTimer;
let passwordFlow = new URLSearchParams(window.location.search).has('invite') || new URLSearchParams(window.location.search).has('recovery');

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function showAuthMessage(message = '', isError = false) {
    authMessage.textContent = message;
    authMessage.classList.toggle('error', isError);
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function categoryFor(id) {
    return categories.find((category) => category.id === id) || { id, name: 'Bez kategórie', sort_order: 999 };
}

function initialsFor(name = '') {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('sk') || '').join('') || '?';
}

function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || seconds === '') return '';
    const value = Number(seconds);
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function setPending(button, pending, pendingText = 'Pracujem…') {
    if (!button) return;
    if (pending) {
        button.dataset.label = button.textContent.trim();
        button.disabled = true;
        button.textContent = pendingText;
    } else {
        button.disabled = false;
        if (button.dataset.label) button.textContent = button.dataset.label;
    }
}

function navigate(viewName) {
    document.querySelectorAll('.page-view').forEach((section) => section.classList.remove('visible'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('visible');
    document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === viewName || (viewName === 'client-detail' && button.dataset.view === 'clients')));
    const labels = { overview: 'Prehľad', clients: 'Klienti', library: 'Knižnica návodov', 'client-detail': 'Klientsky profil', 'client-home': 'Moje návody' };
    document.getElementById('currentCrumb').textContent = labels[viewName] || 'Prehľad';
    document.getElementById('sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSetupRequired() {
    authSetup.hidden = false;
    authForm.hidden = true;
    signupForm.hidden = true;
    setPasswordForm.hidden = true;
    authScreen.hidden = false;
    appShell.hidden = true;
}

function showSignIn() {
    authSetup.hidden = true;
    authForm.hidden = false;
    signupForm.hidden = true;
    setPasswordForm.hidden = true;
    document.getElementById('authTitle').textContent = 'Prihlásenie';
    document.getElementById('authLede').textContent = 'Prihlás sa do svojho súkromného priestoru s tréningovými materiálmi.';
    authScreen.hidden = false;
    appShell.hidden = true;
}

function showSignUp() {
    authSetup.hidden = true;
    authForm.hidden = true;
    setPasswordForm.hidden = true;
    signupForm.hidden = false;
    authScreen.hidden = false;
    appShell.hidden = true;
    document.getElementById('authTitle').textContent = 'Vytvoriť účet';
    document.getElementById('authLede').textContent = 'Zaregistruj sa ako klient. Tréningové návody uvidíš po pridelení trénerom.';
    showAuthMessage('');
}

function showSetPassword(message = 'Zvoľ si nové heslo pre svoj účet.') {
    authSetup.hidden = true;
    authForm.hidden = true;
    signupForm.hidden = true;
    setPasswordForm.hidden = false;
    authScreen.hidden = false;
    appShell.hidden = true;
    showAuthMessage(message);
}

async function setNewPassword(event) {
    event.preventDefault();
    const first = document.getElementById('newPassword').value;
    const second = document.getElementById('confirmPassword').value;
    if (first.length < 10) return showAuthMessage('Heslo musí mať aspoň 10 znakov.', true);
    if (first !== second) return showAuthMessage('Zadané heslá sa nezhodujú.', true);
    const button = setPasswordForm.querySelector('[type="submit"]');
    setPending(button, true, 'Ukladám…');
    const { error } = await supabase.auth.updateUser({ password: first });
    setPending(button, false);
    if (error) return showAuthMessage('Heslo sa nepodarilo nastaviť. Skús otvoriť najnovší odkaz z e-mailu.', true);
    passwordFlow = false;
    window.history.replaceState({}, document.title, window.location.pathname);
    showAuthMessage('Heslo je nastavené. Prihlasujem…');
    const { data } = await supabase.auth.getUser();
    if (data.user) { currentUser = data.user; await enterPortal(); }
}

async function login(event) {
    event.preventDefault();
    const button = authForm.querySelector('[type="submit"]');
    setPending(button, true, 'Prihlasujem…');
    showAuthMessage('');
    const { error } = await supabase.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
    });
    setPending(button, false);
    if (error) showAuthMessage('Prihlásenie sa nepodarilo. Skontroluj e-mail a heslo.', true);
}

async function registerClient(event) {
    event.preventDefault();
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmation = document.getElementById('signupPasswordConfirm').value;
    if (password.length < 10) return showAuthMessage('Heslo musí mať aspoň 10 znakov.', true);
    if (password !== confirmation) return showAuthMessage('Zadané heslá sa nezhodujú.', true);
    const button = signupForm.querySelector('[type="submit"]');
    setPending(button, true, 'Vytváram účet…');
    showAuthMessage('');
    const emailRedirect = new URL(window.location.href);
    emailRedirect.searchParams.set('signup', '1');
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name }, emailRedirectTo: emailRedirect.toString() },
    });
    setPending(button, false);
    if (error) return showAuthMessage('Účet sa nepodarilo vytvoriť. Skontroluj e-mail alebo skús prihlásenie.', true);
    if (data.session?.user) {
        currentUser = data.session.user;
        await enterPortal();
        return;
    }
    showSignIn();
    showAuthMessage(`Účet je vytvorený. Potvrď e-mail cez odkaz, ktorý sme poslali na ${email}, a potom sa prihlás.`);
}

async function resetPassword() {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) return showAuthMessage('Najprv zadaj e-mailovú adresu.', true);
    const redirect = new URL(window.location.href);
    redirect.searchParams.set('recovery', '1');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect.toString() });
    showAuthMessage(error ? 'Odkaz na obnovu hesla sa nepodarilo odoslať.' : 'Ak má tento e-mail účet, príde naň odkaz na obnovu hesla.', Boolean(error));
}

async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('id,email,display_name,role,status,created_at').eq('id', currentUser.id).single();
    if (error || !data) throw new Error('Profil účtu ešte nie je pripravený. Skontrolujte nastavenie databázy alebo pozvánku.');
    currentProfile = data;
    if (!['trainer', 'client'].includes(data.role)) throw new Error('Účet nemá platnú rolu v portáli.');
}

function renderProfile() {
    const displayName = currentProfile.display_name || currentProfile.email.split('@')[0];
    const initials = initialsFor(displayName);
    document.getElementById('sidebarName').textContent = displayName;
    document.getElementById('sidebarRole').textContent = currentProfile.role === 'trainer' ? 'Tréner' : 'Klient';
    document.getElementById('sidebarInitials').textContent = initials;
    document.getElementById('topInitials').textContent = initials;
    document.getElementById('topName').textContent = displayName;
    document.getElementById('welcomeName').textContent = displayName.split(/\s+/)[0];
    document.getElementById('welcomeDate').textContent = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toLocaleUpperCase('sk');
}

function renderNavForRole() {
    const isTrainer = currentProfile.role === 'trainer';
    document.querySelectorAll('.nav-item[data-view="clients"]').forEach((item) => item.hidden = !isTrainer);
    document.querySelectorAll('.nav-item[data-view="overview"]').forEach((item) => item.hidden = !isTrainer);
    document.querySelector('[data-action="new-guide"]')?.toggleAttribute('hidden', !isTrainer);
    document.querySelector('[data-action="new-client"]')?.toggleAttribute('hidden', !isTrainer);
    document.querySelector('[data-action="new-assignment"]')?.toggleAttribute('hidden', !isTrainer);
}

async function loadTrainerData() {
    const [clientResult, categoryResult, guideResult, assignmentResult] = await Promise.all([
        supabase.from('profiles').select('id,email,display_name,role,status,created_at').eq('role', 'client').order('created_at', { ascending: false }),
        supabase.from('categories').select('id,name,sort_order').order('sort_order'),
        supabase.from('guides').select('id,category_id,title,description,media_path,media_kind,duration_seconds,is_published,sort_order,created_at').order('sort_order').order('created_at', { ascending: false }),
        supabase.from('assignments').select('id,client_id,guide_id,coach_note,created_at'),
    ]);
    const failure = [clientResult, categoryResult, guideResult, assignmentResult].find((result) => result.error);
    if (failure) throw new Error('Nepodarilo sa načítať portál. Skontrolujte prístupové pravidlá databázy.');
    clients = clientResult.data || [];
    categories.splice(0, categories.length, ...(categoryResult.data || []));
    guides = guideResult.data || [];
    assignments = assignmentResult.data || [];
    renderDashboard();
    renderClients();
    renderCategories();
    renderGuides();
}

function renderDashboard() {
    document.getElementById('activeClientCount').textContent = String(clients.length);
    document.getElementById('libraryGuideCount').textContent = String(guides.length);
    document.getElementById('assignmentTotal').textContent = String(assignments.length);
    document.getElementById('recentClients').innerHTML = clients.slice(0, 4).map(renderClientRow).join('') || '<p class="empty-state">Zatiaľ tu nie sú žiadni klienti.</p>';
}

function renderClientRow(client) {
    const name = client.display_name || client.email;
    const count = assignments.filter((assignment) => assignment.client_id === client.id).length;
    const status = client.status === 'invited' ? 'Čaká na potvrdenie e-mailu' : formatDate(client.created_at);
    return `<div class="client-row"><div class="client-person"><span class="avatar blue">${escapeHtml(initialsFor(name))}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(client.email)}</small></span></div><span class="material-count">${count} ${count === 1 ? 'návod' : count >= 2 && count <= 4 ? 'návody' : 'návodov'}</span><span class="muted-cell">${escapeHtml(status)}</span><button class="row-open" data-open-client="${escapeHtml(client.id)}" aria-label="Otvoriť profil klienta">›</button></div>`;
}

function renderClients() {
    const list = document.getElementById('allClients');
    list.innerHTML = clients.map(renderClientRow).join('') || '<p class="empty-state">Zatiaľ tu nie sú žiadni klienti. Pozvi prvého klienta.</p>';
    document.querySelector('.toolbar-count').textContent = `${clients.length} klientov`;
    document.querySelectorAll('.nav-count').forEach((element, index) => { element.textContent = index === 0 ? String(clients.length) : String(guides.length); });
}

function renderCategories() {
    document.getElementById('categoryGrid').innerHTML = categories.map((category) => {
        const count = guides.filter((guide) => guide.category_id === category.id).length;
        const art = category.id === 'beh' ? 'run' : category.id === 'plavanie' ? 'swim' : category.id === 'cyklistika' ? 'bike' : category.id === 'silovy' ? 'strength' : category.id === 'mobilita' ? 'mobility' : 'recovery';
        const icon = { beh: '↗', plavanie: '≈', cyklistika: '⌁', silovy: '⌑', mobilita: '↔', regeneracia: '✳' }[category.id] || '•';
        return `<button class="category-card" data-category="${escapeHtml(category.id)}"><span class="category-art ${art}">${icon}</span><span><strong>${escapeHtml(category.name)}</strong><small>${count} ${count === 1 ? 'návod' : count >= 2 && count <= 4 ? 'návody' : 'návodov'}</small></span><span class="category-arrow">›</span></button>`;
    }).join('') || '<p class="empty-state">Kategórie sa nepodarilo načítať.</p>';
}

function renderCategoryFilters() {
    document.getElementById('categoryFilters').innerHTML = `<button class="pill ${activeCategory === 'all' ? 'active' : ''}" data-filter="all">Všetky</button>` + categories.map((category) => `<button class="pill ${activeCategory === category.id ? 'active' : ''}" data-filter="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`).join('');
}

function renderGuideCard(guide, assigned = false) {
    const category = categoryFor(guide.category_id);
    const art = category.id === 'beh' ? 'run' : category.id === 'plavanie' ? 'swim' : category.id === 'cyklistika' ? 'bike' : ['mobilita', 'regeneracia'].includes(category.id) ? 'mobility' : '';
    const type = guide.media_kind === 'video' ? 'Video' : guide.media_kind === 'image' ? 'Fotografia' : 'Dokument';
    const duration = formatDuration(guide.duration_seconds);
    return `<article class="guide-card"><button class="guide-thumb ${art ? `thumb-${art}` : ''}" data-play-guide="${escapeHtml(guide.id)}" aria-label="Otvoriť návod ${escapeHtml(guide.title)}"><span class="play-button">${guide.media_kind === 'image' ? '▧' : guide.media_kind === 'document' ? '↗' : '▶'}</span>${duration ? `<span class="duration">${duration}</span>` : ''}</button><div class="guide-body"><span class="guide-category">${escapeHtml(category.name)}</span><h3>${escapeHtml(guide.title)}</h3><p>${escapeHtml(guide.description)}</p><div class="guide-footer"><small>${type}${duration ? ` · ${duration}` : ''}</small>${currentProfile.role === 'trainer' && !assigned ? `<button data-action="assign-guide" data-guide-id="${escapeHtml(guide.id)}">＋ Priradiť</button>` : ''}</div></div></article>`;
}

function renderGuides() {
    const query = (document.getElementById('guideSearch')?.value || '').trim().toLocaleLowerCase('sk');
    const visibleGuides = guides.filter((guide) => (activeCategory === 'all' || guide.category_id === activeCategory)
        && `${guide.title} ${guide.description} ${categoryFor(guide.category_id).name}`.toLocaleLowerCase('sk').includes(query));
    document.getElementById('guideGrid').innerHTML = visibleGuides.map((guide) => renderGuideCard(guide)).join('') || '<p class="empty-state">Knižnica zatiaľ neobsahuje žiadne návody.</p>';
    renderCategoryFilters();
}

async function loadClientGuides() {
    const { data, error } = await supabase.from('assignments')
        .select('id,coach_note,created_at,guides(id,category_id,title,description,media_path,media_kind,duration_seconds,is_published)')
        .eq('client_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw new Error('Nepodarilo sa načítať tvoje návody. Skús stránku obnoviť.');
    const assignedGuides = (data || []).map((row) => row.guides).filter((guide) => guide?.is_published);
    guides = assignedGuides;
    document.getElementById('view-client-home')?.remove();
    const template = document.getElementById('clientGuideViewTemplate').content.cloneNode(true);
    document.querySelector('.main-area').append(template);
    document.getElementById('clientGuideGrid').innerHTML = assignedGuides.map((guide) => renderGuideCard(guide, true)).join('');
    document.getElementById('clientEmpty').hidden = assignedGuides.length !== 0;
    document.getElementById('view-client-home').classList.add('visible');
    document.getElementById('currentCrumb').textContent = 'Moje návody';
    document.querySelector('.nav-item[data-view="library"]').classList.add('active');
    document.querySelector('.nav-item[data-view="library"]').hidden = true;
}

async function enterPortal() {
    if (!currentUser || enteringUserId === currentUser.id) return;
    enteringUserId = currentUser.id;
    authScreen.hidden = true;
    appShell.hidden = false;
    try {
        await loadProfile();
        renderProfile();
        renderNavForRole();
        if (currentProfile.role === 'trainer') {
            await loadTrainerData();
            navigate('overview');
        } else {
            document.querySelectorAll('.page-view').forEach((section) => section.classList.remove('visible'));
            await loadClientGuides();
        }
    } catch (error) {
        console.error(error);
        await supabase.auth.signOut();
        appShell.hidden = true;
        showSignIn();
        showAuthMessage(error.message || 'Portál sa nepodarilo načítať.', true);
    } finally {
        enteringUserId = null;
    }
}

async function openClient(id) {
    selectedClientId = id;
    const client = clients.find((entry) => entry.id === id);
    if (!client) return;
    const { data, error } = await supabase.from('assignments')
        .select('id,guide_id,coach_note,created_at').eq('client_id', id).order('created_at', { ascending: false });
    if (error) return showToast('Profil klienta sa nepodarilo načítať.', true);
    const attached = data.map((assignment) => ({ ...assignment, guide: guides.find((guide) => guide.id === assignment.guide_id) })).filter((row) => row.guide);
    const displayName = client.display_name || client.email;
    document.getElementById('detailName').textContent = displayName;
    document.getElementById('detailEmail').textContent = client.email;
    document.getElementById('detailSince').textContent = client.status === 'invited' ? 'Čaká na potvrdenie e-mailu' : formatDate(client.created_at);
    document.getElementById('detailCount').textContent = `${attached.length} priradených`;
    document.getElementById('assignedGuides').innerHTML = attached.map(({ id: assignmentId, coach_note: note, guide }) => `<div class="assigned-row"><div class="assigned-info"><span class="guide-symbol">${guide.media_kind === 'video' ? '▶' : '▧'}</span><span><strong>${escapeHtml(guide.title)}</strong><small>${escapeHtml(categoryFor(guide.category_id).name)}${note ? ` · ${escapeHtml(note)}` : ''}</small></span></div><button class="remove-assignment" data-remove-assignment="${escapeHtml(assignmentId)}">Odobrať</button></div>`).join('') || '<p class="empty-state">Tomuto klientovi zatiaľ nie sú priradené žiadne návody.</p>';
    document.getElementById('detailStatus').textContent = client.status === 'invited' ? 'Čaká na e-mail' : 'Aktívny';
    navigate('client-detail');
}

function openModal(content) {
    const backdrop = document.getElementById('modalBackdrop');
    document.getElementById('modalContent').innerHTML = content;
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.querySelector('.modal-close').focus();
}

function closeModal() {
    const backdrop = document.getElementById('modalBackdrop');
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
}

function openInviteModal() {
    openModal(`<p class="eyebrow">PRIDAŤ KLIENTA</p><h2 id="modalTitle">Registrácia klienta</h2><p class="modal-intro">Klient si vytvorí účet cez odkaz na portál. Po registrácii sa zobrazí v zozname klientov a môžeš mu priradiť návody. Bez pridelených návodov neuvidí súkromný obsah.</p><div class="modal-footer"><button class="button subtle" data-action="close-modal">Zavrieť</button><button class="button primary" data-action="copy-portal-link">Skopírovať adresu portálu</button></div>`);
}

function openGuideModal(guide = null) {
    const options = categories.map((category) => `<option value="${escapeHtml(category.id)}" ${guide?.category_id === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
    openModal(`<p class="eyebrow">KNIŽNICA NÁVODOV</p><h2 id="modalTitle">${guide ? 'Upraviť návod' : 'Pridať návod'}</h2><p class="modal-intro">Video, fotografiu alebo PDF nahráme do súkromného úložiska.</p><form id="guideForm" class="simple-form" data-guide-id="${escapeHtml(guide?.id || '')}"><label>Názov<input name="title" required maxlength="160" value="${escapeHtml(guide?.title || '')}"></label><label>Kategória<select name="category_id" required>${options}</select></label><label>Popis<textarea name="description" rows="3" maxlength="1000">${escapeHtml(guide?.description || '')}</textarea></label><label>Trvanie videa v sekundách<input name="duration_seconds" type="number" min="0" max="3600" value="${guide?.duration_seconds ?? ''}" placeholder="napr. 6"></label><label>Súbor${guide?.media_path ? `<small class="current-file">Aktuálny súbor je nahraný. Výberom nového ho nahradíš.</small>` : ''}<input name="media" type="file" accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,application/pdf" ${guide ? '' : 'required'}></label><div class="modal-footer"><button class="button subtle" type="button" data-action="close-modal">Zrušiť</button><button class="button primary" type="submit">Uložiť návod</button></div></form>`);
}

async function saveGuide(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const formData = new FormData(form);
    const file = formData.get('media');
    const guideId = form.dataset.guideId;
    const existing = guides.find((guide) => guide.id === guideId);
    setPending(button, true, 'Ukladám…');
    let mediaPath = existing?.media_path || null;
    let mediaKind = existing?.media_kind || 'video';
    try {
        if (file instanceof File && file.size > 0) {
            if (file.size > 100 * 1024 * 1024) throw new Error('Súbor môže mať najviac 100 MB.');
            const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
            mediaPath = `${crypto.randomUUID()}.${extension}`;
            const { error: uploadError } = await supabase.storage.from('training-media').upload(mediaPath, file, { contentType: file.type, upsert: false });
            if (uploadError) throw new Error('Súbor sa nepodarilo nahrať. Skontroluj typ a veľkosť súboru.');
            mediaKind = file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'document' : 'image';
        }
        const values = {
            category_id: String(formData.get('category_id')),
            title: String(formData.get('title')).trim(),
            description: String(formData.get('description') || '').trim(),
            media_path: mediaPath,
            media_kind: mediaKind,
            duration_seconds: formData.get('duration_seconds') ? Number(formData.get('duration_seconds')) : null,
            created_by: currentUser.id,
        };
        const result = existing
            ? await supabase.from('guides').update(values).eq('id', existing.id)
            : await supabase.from('guides').insert(values);
        if (result.error) {
            if (mediaPath && mediaPath !== existing?.media_path && file instanceof File) await supabase.storage.from('training-media').remove([mediaPath]);
            throw new Error('Návod sa nepodarilo uložiť. Skontroluj prístupové pravidlá databázy.');
        }
        if (existing?.media_path && existing.media_path !== mediaPath) await supabase.storage.from('training-media').remove([existing.media_path]);
        closeModal();
        await loadTrainerData();
        showToast(existing ? 'Návod bol aktualizovaný.' : 'Návod bol pridaný do knižnice.');
    } catch (error) {
        showToast(error.message || 'Návod sa nepodarilo uložiť.', true);
        setPending(button, false);
    }
}

function openAssignmentModal(clientId = selectedClientId, preselectedGuideId = null) {
    const client = clients.find((entry) => entry.id === clientId) || clients[0];
    if (!client) return openInviteModal();
    const assignedIds = assignments.filter((item) => item.client_id === client.id).map((item) => item.guide_id);
    const options = guides.filter((guide) => guide.is_published).map((guide) => `<label class="assign-option"><input type="checkbox" value="${escapeHtml(guide.id)}" ${(assignedIds.includes(guide.id) || guide.id === preselectedGuideId) ? 'checked' : ''}><span>${escapeHtml(guide.title)}<small>${escapeHtml(categoryFor(guide.category_id).name)}</small></span></label>`).join('');
    const clientOptions = clients.map((item) => `<button class="client-choice ${item.id === client.id ? 'active' : ''}" data-select-client="${escapeHtml(item.id)}">${escapeHtml(item.display_name || item.email)}</button>`).join('');
    openModal(`<p class="eyebrow">PRIRADIŤ MATERIÁLY</p><h2 id="modalTitle">Klientsky výber</h2><p class="modal-intro">Vybrané návody zostanú klientovi dostupné, kým ich neodoberieš.</p><div class="modal-client-select">${clientOptions}</div><div class="assign-list">${options || '<p class="empty-state">Najprv pridaj publikovaný návod do knižnice.</p>'}</div><div class="modal-footer"><button class="button subtle" data-action="close-modal">Zrušiť</button><button class="button primary" data-action="save-assignment">Uložiť výber</button></div>`);
    document.getElementById('modalContent').dataset.selectedClient = client.id;
    document.getElementById('modalContent').dataset.preselectedGuide = preselectedGuideId || '';
}

async function saveAssignment() {
    const clientId = document.getElementById('modalContent').dataset.selectedClient;
    const current = assignments.filter((item) => item.client_id === clientId).map((item) => item.guide_id);
    const selected = [...document.querySelectorAll('.assign-option input:checked')].map((input) => input.value);
    const addIds = selected.filter((id) => !current.includes(id));
    const removeIds = current.filter((id) => !selected.includes(id));
    const button = document.querySelector('[data-action="save-assignment"]');
    setPending(button, true, 'Ukladám…');
    if (removeIds.length) {
        const { error } = await supabase.from('assignments').delete().eq('client_id', clientId).in('guide_id', removeIds);
        if (error) { setPending(button, false); return showToast('Odoberanie návodov sa nepodarilo.', true); }
    }
    if (addIds.length) {
        const { error } = await supabase.from('assignments').insert(addIds.map((guideId) => ({ client_id: clientId, guide_id: guideId })));
        if (error) { closeModal(); await loadTrainerData(); return showToast('Niektoré návody sa nepodarilo priradiť.', true); }
    }
    closeModal();
    await loadTrainerData();
    await openClient(clientId);
    showToast('Klientsky výber bol uložený.');
}

async function openGuide(guideId) {
    const guide = guides.find((item) => item.id === guideId);
    if (!guide?.media_path) return showToast('K tomuto návodu zatiaľ nie je pripojený súbor.', true);
    const { data, error } = await supabase.storage.from('training-media').createSignedUrl(guide.media_path, 600);
    if (error || !data?.signedUrl) return showToast('K súboru nemáš prístup alebo sa nepodarilo načítať návod.', true);
    const source = escapeHtml(data.signedUrl);
    let media = `<video controls playsinline preload="metadata" src="${source}">Prehrávač videa nie je v tomto prehliadači podporovaný.</video>`;
    if (guide.media_kind === 'image') media = `<img class="media-image" src="${source}" alt="${escapeHtml(guide.title)}">`;
    if (guide.media_kind === 'document') media = `<a class="button primary" href="${source}" target="_blank" rel="noopener noreferrer">Otvoriť dokument</a>`;
    openModal(`<p class="eyebrow">${escapeHtml(categoryFor(guide.category_id).name)}</p><h2 id="modalTitle">${escapeHtml(guide.title)}</h2><p class="modal-intro">${escapeHtml(guide.description)}</p><div class="media-frame">${media}</div><p class="media-expiry">Bezpečný odkaz na súbor bude aktívny 10 minút. Prístup klienta k priradenému návodu nevyprší.</p>`);
}

async function removeAssignment(id) {
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (error) return showToast('Návod sa nepodarilo odobrať.', true);
    await loadTrainerData();
    if (selectedClientId) await openClient(selectedClientId);
    showToast('Návod bol klientovi odobratý.');
}

document.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) return navigate(button.dataset.view);
    if (button.dataset.openClient) return openClient(button.dataset.openClient);
    if (button.dataset.category) { activeCategory = button.dataset.category; renderGuides(); return navigate('library'); }
    if (button.dataset.filter) { activeCategory = button.dataset.filter; renderGuides(); return; }
    if (button.dataset.selectClient) {
        document.querySelectorAll('.client-choice').forEach((item) => item.classList.toggle('active', item === button));
        const clientId = button.dataset.selectClient;
        document.getElementById('modalContent').dataset.selectedClient = clientId;
        const alreadyAssigned = assignments.filter((item) => item.client_id === clientId).map((item) => item.guide_id);
        document.querySelectorAll('.assign-option input').forEach((input) => { input.checked = alreadyAssigned.includes(input.value) || input.value === document.getElementById('modalContent').dataset.preselectedGuide; });
        return;
    }
    if (button.dataset.playGuide) return openGuide(button.dataset.playGuide);
    if (button.dataset.removeAssignment) return removeAssignment(button.dataset.removeAssignment);
    if (button.dataset.action === 'new-assignment') return openAssignmentModal();
    if (button.dataset.action === 'assign-current') return openAssignmentModal(selectedClientId);
    if (button.dataset.action === 'assign-guide') return openAssignmentModal(selectedClientId, button.dataset.guideId);
    if (button.dataset.action === 'new-client') return openInviteModal();
    if (button.dataset.action === 'new-guide') return openGuideModal();
    if (button.dataset.action === 'save-assignment') return saveAssignment();
    if (button.dataset.action === 'close-modal') return closeModal();
    if (button.dataset.action === 'copy-portal-link') {
        await navigator.clipboard.writeText(window.location.href);
        return showToast('Adresa portálu bola skopírovaná. Klient sa prihlási vlastným účtom.');
    }
    if (button.id === 'signOut') { await supabase.auth.signOut(); return; }
});

document.addEventListener('input', (event) => {
    if (event.target.id === 'guideSearch') renderGuides();
    if (event.target.id === 'clientSearch') {
        const query = event.target.value.trim().toLocaleLowerCase('sk');
        document.querySelectorAll('#allClients .client-row').forEach((row) => { row.hidden = !row.textContent.toLocaleLowerCase('sk').includes(query); });
    }
});

document.addEventListener('submit', (event) => {
    if (event.target.id === 'guideForm') saveGuide(event);
    if (event.target.id === 'setPasswordForm') setNewPassword(event);
    if (event.target.id === 'signupForm') registerClient(event);
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
document.getElementById('mobileMenu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('loginForm').addEventListener('submit', login);
document.getElementById('showSignup').addEventListener('click', showSignUp);
document.getElementById('showLogin').addEventListener('click', showSignIn);
document.getElementById('forgotPassword').addEventListener('click', resetPassword);

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    showSetupRequired();
} else {
    try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        showSignIn();
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                currentUser = null; currentProfile = null; passwordFlow = false; appShell.hidden = true; showSignIn();
            } else if (event === 'SIGNED_IN' && session?.user) {
                currentUser = session.user;
                if (passwordFlow) queueMicrotask(() => showSetPassword());
                else queueMicrotask(() => enterPortal());
            } else if (event === 'PASSWORD_RECOVERY') {
                passwordFlow = true;
                showSetPassword('Odkaz na obnovu hesla je pripravený. Zvoľ si nové heslo.');
            }
        });
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (sessionData.session?.user) {
            currentUser = sessionData.session.user;
            if (passwordFlow) showSetPassword();
            else await enterPortal();
        } else if (passwordFlow) {
            showSignIn();
            showAuthMessage('Odkaz už nie je platný alebo vypršal. Požiadaj trénera o novú pozvánku.', true);
        }
    } catch (error) {
        console.error(error);
        showSetupRequired();
        showAuthMessage('Pripojenie k službe sa nepodarilo. Skontroluj URL projektu a publishable kľúč.', true);
    }
}
