const API = '/api';
const state = { token: sessionStorage.getItem('rr_token'), user: JSON.parse(sessionStorage.getItem('rr_user') || 'null'), selectedTrip: null, selectedSeat: null, operatorTrips: [], buses: [], activeTrip: null, preview: null, admin: { operators: [], buses: [], routes: [], trips: [] }, adminTab: 'operators' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
const time = value => new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const date = value => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const toast = message => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); };
async function request(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401 && state.token) logout(false); throw new Error(data.error || 'Something went wrong'); }
  return data;
}
async function allRecords(path) {
  const records = [];
  for (let page = 1; ; page++) {
    const chunk = await request(`${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`);
    records.push(...chunk); if (chunk.length < 100) return records;
  }
}
function pagedList(container, items, render, afterRender = () => {}) {
  let current = 1; let query = ''; let travelDate = '';
  const toolbar = document.createElement('div'); toolbar.className = 'toolbar';
  toolbar.innerHTML = '<input type="search" aria-label="Filter records" placeholder="Search records"><input type="date" aria-label="Filter departure date">';
  const body = document.createElement('div'); const pager = document.createElement('div'); pager.className = 'pager';
  container.replaceChildren(toolbar, body, pager);
  function draw() {
    const filtered = items.filter(item => JSON.stringify(item).toLowerCase().includes(query) && (!travelDate || (item.departure && new Date(new Date(item.departure).getTime() + 19800000).toISOString().startsWith(travelDate))));
    const pages = Math.max(1, Math.ceil(filtered.length / 10)); current = Math.min(current, pages);
    body.innerHTML = filtered.length ? filtered.slice((current - 1) * 10, current * 10).map(render).join('') : '<p class="empty-state compact">No matching records.</p>';
    pager.innerHTML = `<button class="button ghost" ${current === 1 ? 'disabled' : ''}>Previous</button><span>Page ${current} / ${pages} · ${filtered.length} records</span><button class="button ghost" ${current === pages ? 'disabled' : ''}>Next</button>`;
    pager.children[0].onclick = () => { current--; draw(); }; pager.children[2].onclick = () => { current++; draw(); }; afterRender(body);
  }
  toolbar.children[0].oninput = event => { query = event.target.value.toLowerCase(); current = 1; draw(); };
  toolbar.children[1].onchange = event => { travelDate = event.target.value; current = 1; draw(); };
  if (!items.some(item => item.departure)) toolbar.children[1].hidden = true;
  draw();
}
function showView(name) {
  if ((name === 'bookings' || name === 'operator' || name === 'admin') && !state.user) { openLogin(); return; }
  if (name === 'operator' && !['operator', 'admin'].includes(state.user?.role)) { toast('Operator access is required'); return; }
  if (name === 'admin' && state.user?.role !== 'admin') { toast('Admin access is required'); return; }
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `${name}View`));
  $$('.nav-link').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  if (name === 'bookings') loadBookings();
  if (name === 'operator') loadOperations();
  if (name === 'admin') loadAdmin();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderAccount() {
  $$('.staff-only').forEach(el => el.classList.toggle('hidden', !['operator', 'admin'].includes(state.user?.role)));
  $$('.admin-only').forEach(el => el.classList.toggle('hidden', state.user?.role !== 'admin'));
  $('#accountArea').innerHTML = state.user ? `<div class="account-chip"><div class="avatar">${escapeHtml(state.user.name[0])}</div><div><strong>${escapeHtml(state.user.name)}</strong><small>${escapeHtml(state.user.role)}</small></div><button class="button ghost" id="logoutButton">Log out</button></div>` : '<button class="button ghost" id="openLogin">Sign in</button><button class="button primary" id="openRegister">Create account</button>';
  $('#openLogin')?.addEventListener('click', () => openAuth('login'));
  $('#openRegister')?.addEventListener('click', () => openAuth('register'));
}
function openLogin() { openAuth('login'); }
function openAuth(tab = 'login') {
  $('#loginError').classList.add('hidden');
  $('#regError')?.classList.add('hidden');
  $('#opReqError')?.classList.add('hidden');
  $('#opReqSuccess')?.classList.add('hidden');
  switchAuthTab(tab);
  $('#loginDialog').showModal();
}
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('#authTabLogin')?.classList.toggle('active', isLogin);
  $('#authTabRegister')?.classList.toggle('active', !isLogin);
  $('#signInPanel')?.classList.toggle('hidden', !isLogin);
  $('#registerPanel')?.classList.toggle('hidden', isLogin);
}
function switchRolePill(role) {
  const isCust = role === 'customer';
  $('#rolePillCustomer')?.classList.toggle('active', isCust);
  $('#rolePillOperator')?.classList.toggle('active', !isCust);
  $('#customerRegisterForm')?.classList.toggle('hidden', !isCust);
  $('#operatorRequestForm')?.classList.toggle('hidden', isCust);
  $('#regError')?.classList.add('hidden');
  $('#opReqError')?.classList.add('hidden');
  $('#opReqSuccess')?.classList.add('hidden');
}
$('#authTabLogin')?.addEventListener('click', () => switchAuthTab('login'));
$('#authTabRegister')?.addEventListener('click', () => switchAuthTab('register'));
$('#rolePillCustomer')?.addEventListener('click', () => switchRolePill('customer'));
$('#rolePillOperator')?.addEventListener('click', () => switchRolePill('operator'));

$('#customerRegisterForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#regError').classList.add('hidden');
  try {
    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const password = $('#regPassword').value;
    await request('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    const loginData = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.token = loginData.accessToken;
    state.user = loginData.user;
    sessionStorage.setItem('rr_token', state.token);
    sessionStorage.setItem('rr_user', JSON.stringify(state.user));
    $('#loginDialog').close();
    renderAccount();
    toast(`Welcome, ${state.user.name}! Account created.`);
  } catch (error) {
    $('#regError').textContent = error.message;
    $('#regError').classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
});

$('#operatorRequestForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#opReqError').classList.add('hidden');
  $('#opReqSuccess').classList.add('hidden');
  try {
    const data = {
      name: $('#opReqName').value.trim(),
      email: $('#opReqEmail').value.trim(),
      companyName: $('#opReqCompany').value.trim(),
      phone: $('#opReqPhone').value.trim(),
      fleetSize: Number($('#opReqFleet').value),
      message: $('#opReqNotes').value.trim() || undefined,
    };
    const res = await request('/operator-requests', { method: 'POST', body: JSON.stringify(data) });
    $('#opReqSuccess').innerHTML = `<strong>✓ Request submitted!</strong><p>${escapeHtml(res.message || 'An administrator will review your application.')}</p>`;
    $('#opReqSuccess').classList.remove('hidden');
    $('#operatorRequestForm').reset();
    toast('Operator request submitted for review');
  } catch (error) {
    $('#opReqError').textContent = error.message;
    $('#opReqError').classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
});
async function logout(callApi) {
  const oldToken = state.token;
  state.token = null; state.user = null; sessionStorage.removeItem('rr_token'); sessionStorage.removeItem('rr_user'); renderAccount(); showView('home'); toast('Signed out');
  if (callApi && oldToken) fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${oldToken}` }, signal: AbortSignal.timeout(3000) }).catch(() => {});
}
$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#loginEmail').value, password: $('#loginPassword').value }) });
    state.token = data.accessToken; state.user = data.user; sessionStorage.setItem('rr_token', state.token); sessionStorage.setItem('rr_user', JSON.stringify(state.user));
    $('#loginDialog').close(); renderAccount(); toast(`Welcome, ${state.user.name}`); if (['operator', 'admin'].includes(state.user.role)) showView('operator');
  } catch (error) { $('#loginError').textContent = error.message; $('#loginError').classList.remove('hidden'); } finally { button.disabled = false; }
});
$$('.demo-switch button').forEach(button => button.addEventListener('click', () => { $$('.demo-switch button').forEach(b => b.classList.remove('active')); button.classList.add('active'); $('#loginEmail').value = button.dataset.email; }));
$$('.modal-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));

const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); $('#travelDate').value = tomorrow.toLocaleDateString('en-CA'); $('#travelDate').min = new Date().toLocaleDateString('en-CA');
$('#swapStops').addEventListener('click', () => { [$('#origin').value, $('#destination').value] = [$('#destination').value, $('#origin').value]; });
$('#searchForm').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true; submit.textContent = 'Searching…';
  try {
    const origin = $('#origin').value.trim(), destination = $('#destination').value.trim();
    const data = await request(`/trips?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${$('#travelDate').value}`);
    $('#searchIntro').classList.add('hidden'); $('#resultsSection').classList.remove('hidden'); $('#resultsTitle').textContent = `${origin} to ${destination}`; $('#resultsCount').textContent = `${data.total} ${data.total === 1 ? 'bus' : 'buses'}`;
    $('#resultsList').innerHTML = data.items.length ? data.items.map(trip => `<article class="trip-card"><div class="operator-name">Algions Express<small>${escapeHtml(trip.routeName)}</small></div><div class="journey-line"><div><strong>${time(trip.departure)}</strong><small>${origin}</small></div><div class="route-stroke"></div><div><strong>${time(trip.arrival)}</strong><small>${destination}</small></div></div><div><div class="seat-count">${trip.availableSeats} seats left</div><small>${Math.round(trip.durationMinutes / 60)}h ${trip.durationMinutes % 60}m · ${date(trip.departure)}</small></div><div><div class="fare">${money(trip.fare)}<small>per seat</small></div><button class="button primary choose-seat" data-trip="${trip._id}">Choose seat</button></div></article>`).join('') : '<div class="empty-state"><div class="empty-icon">⌁</div><h3>No journeys found</h3><p>Try another travel date or check the city names.</p></div>';
    $$('.choose-seat').forEach(button => button.addEventListener('click', () => openSeats(data.items.find(t => t._id === button.dataset.trip), origin, destination)));
    $('#resultsSection').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { toast(error.message); } finally { submit.disabled = false; submit.innerHTML = 'Search buses <span>→</span>'; }
});
async function openSeats(trip, boarding, drop) {
  if (!state.user) { openLogin(); return; }
  if (state.user.role !== 'customer') { toast('Use a customer account to book'); return; }
  try {
    const data = await request(`/trips/${trip._id}/seats`); state.selectedTrip = { ...trip, boarding, drop }; state.selectedSeat = null;
    const boardingSelect = $('#boardingPoint'), droppingSelect = $('#droppingPoint');
    const stops = trip.stops || [boarding, drop];
    const renderSummary = () => { $('#bookingSummary').innerHTML = `<span class="section-kicker">Your journey</span><div class="summary-route"><strong>${escapeHtml(state.selectedTrip.boarding)}</strong><span>to</span><strong>${escapeHtml(state.selectedTrip.drop)}</strong></div><div class="summary-detail"><span>${date(trip.departure)}</span><span>${time(trip.departure)} → ${time(trip.arrival)}</span><span>Algions Express</span><span>${money(trip.fare)} per seat</span></div>`; };
    boardingSelect.innerHTML = stops.slice(0, -1).map(stop => `<option value="${escapeHtml(stop)}">${escapeHtml(stop)}</option>`).join('');
    boardingSelect.value = stops.includes(boarding) ? boarding : stops[0];
    const updateDroppingPoints = () => {
      const boardingIndex = stops.indexOf(boardingSelect.value); const validDrops = stops.slice(boardingIndex + 1);
      droppingSelect.innerHTML = validDrops.map(stop => `<option value="${escapeHtml(stop)}">${escapeHtml(stop)}</option>`).join('');
      droppingSelect.value = validDrops.includes(state.selectedTrip.drop) ? state.selectedTrip.drop : validDrops[0];
      state.selectedTrip.boarding = boardingSelect.value; state.selectedTrip.drop = droppingSelect.value; renderSummary();
    };
    boardingSelect.onchange = updateDroppingPoints; droppingSelect.onchange = () => { state.selectedTrip.drop = droppingSelect.value; renderSummary(); }; updateDroppingPoints();
    $('#seatMap').innerHTML = data.seats.map(({ seat, available }) => `<button type="button" class="seat" data-seat="${escapeHtml(seat)}" ${available ? '' : 'disabled'}>${escapeHtml(seat)}</button>`).join('');
    $$('.seat').forEach(button => button.addEventListener('click', () => { $$('.seat').forEach(b => b.classList.remove('selected')); button.classList.add('selected'); state.selectedSeat = button.dataset.seat; }));
    $('#confirmFare').textContent = money(trip.fare); $('#bookingError').classList.add('hidden'); $('#seatDialog').showModal();
  } catch (error) { toast(error.message); }
}
$('#bookingForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!state.selectedSeat) { $('#bookingError').textContent = 'Select an available seat first.'; $('#bookingError').classList.remove('hidden'); return; }
  const button = event.submitter; button.disabled = true; button.textContent = 'Securing your seat…';
  try {
    const body = JSON.stringify({ tripId: state.selectedTrip._id, seat: state.selectedSeat, boarding: state.selectedTrip.boarding, drop: state.selectedTrip.drop, passenger: { name: $('#passengerName').value.trim(), age: Number($('#passengerAge').value) } });
    const saved = JSON.parse(sessionStorage.getItem('rr_pending_booking') || 'null');
    const pending = saved?.body === body && saved?.userId === state.user.id ? saved : { body, userId: state.user.id, key: crypto.randomUUID() };
    sessionStorage.setItem('rr_pending_booking', JSON.stringify(pending));
    await request('/bookings', { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body });
    sessionStorage.removeItem('rr_pending_booking');
    $('#seatDialog').close(); toast('Seat confirmed — your ticket is ready'); showView('bookings');
  } catch (error) { $('#bookingError').textContent = error.message; $('#bookingError').classList.remove('hidden'); } finally { button.disabled = false; button.innerHTML = `Confirm booking <span>${money(state.selectedTrip.fare)}</span>`; }
});
async function loadBookings() {
  const list = $('#bookingsList'); list.innerHTML = '<div class="empty-state"><p>Loading your journeys…</p></div>';
  try {
    const bookings = await request('/bookings');
    list.innerHTML = bookings.length ? bookings.map(booking => `<article class="ticket-card ${booking.status}"><div class="ticket-main"><div class="ticket-pnr"><small>PNR</small>${escapeHtml(booking.pnr)}</div><div class="journey-line"><div><strong>${escapeHtml(booking.boarding)}</strong><small>${time(booking.departure)}</small></div><div class="route-stroke"></div><div><strong>${escapeHtml(booking.drop)}</strong><small>${date(booking.departure)}</small></div></div><div><span class="status">${escapeHtml(booking.status)}</span><p>Seat ${escapeHtml(booking.seat)} · ${escapeHtml(booking.passenger.name)}</p></div>${booking.status === 'confirmed' ? `<button class="button danger cancel-booking" data-id="${booking._id}">Cancel</button>` : `<strong>${booking.refundStatus === 'simulated_refunded' ? `${money(booking.refundAmount)} refunded` : ''}</strong>`}</div>${booking.history?.length ? `<div class="ticket-history">Journey update: your bus was replaced safely. Your PNR and seat remain unchanged.</div>` : ''}</article>`).join('') : '<div class="empty-state"><div class="empty-icon">⌁</div><h3>No tickets yet</h3><p>Your confirmed journeys will appear here.</p></div>';
    $$('.cancel-booking').forEach(button => button.addEventListener('click', async () => { if (!confirm('Cancel this booking under its saved refund policy?')) return; button.disabled = true; try { await request(`/bookings/${button.dataset.id}/cancel`, { method: 'POST' }); toast('Booking cancelled and seat released'); loadBookings(); } catch (error) { toast(error.message); button.disabled = false; } }));
  } catch (error) { list.innerHTML = `<div class="empty-state"><h3>Could not load tickets</h3><p>${escapeHtml(error.message)}</p></div>`; }
}
async function loadOperations() {
  $('#operatorTrips').innerHTML = '<div class="empty-state compact"><p>Loading network…</p></div>';
  try {
    [state.operatorTrips, state.buses] = await Promise.all([allRecords('/operator/trips'), allRecords('/buses')]);
    const future = state.operatorTrips.filter(t => new Date(t.departure) > new Date()); const disrupted = future.filter(t => t.status === 'disrupted');
    $('#metrics').innerHTML = `<div class="metric-card"><span>Upcoming trips</span><strong>${future.length}</strong></div><div class="metric-card"><span>Active buses</span><strong>${new Set(future.map(t => t.busId)).size}</strong></div><div class="metric-card"><span>Need attention</span><strong>${disrupted.length}</strong></div><div class="metric-card"><span>Routes covered</span><strong>${new Set(future.map(t => t.routeId)).size}</strong></div>`;
    $('#tripCount').textContent = `${future.length} upcoming`;
    pagedList($('#operatorTrips'), state.operatorTrips, t => `<button type="button" class="ops-item ${state.activeTrip?._id === t._id ? 'active' : ''}" data-id="${t._id}"><span><span class="ops-route">${escapeHtml(t.routeName)}</span><span class="ops-meta">${date(t.departure)} · ${time(t.departure)} · ${t.seats.length} seats</span></span><span class="status">${escapeHtml(t.status)}</span></button>`, body => body.querySelectorAll('.ops-item').forEach(item => item.addEventListener('click', () => openTrip(item.dataset.id))));
    if (state.activeTrip) openTrip(state.activeTrip._id);
  } catch (error) { $('#operatorTrips').innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
}
async function openTrip(id) {
  try {
    const [report, audit] = await Promise.all([request(`/operator/trips/${id}/report`), request(`/operator/trips/${id}/audit?limit=50`)]); state.activeTrip = report.trip;
    $$('.ops-item').forEach(item => item.classList.toggle('active', item.dataset.id === id));
    $('#tripDetail').innerHTML = `<div class="detail-head"><div><span class="section-kicker">Trip control</span><h2>${escapeHtml(report.trip.routeName)}</h2><p>${date(report.trip.departure)} · ${time(report.trip.departure)}</p></div><span class="status">${escapeHtml(report.trip.status)}</span></div><div class="metric-grid"><div class="metric-card"><span>Occupancy</span><strong>${report.occupancyPercent}%</strong><small>${report.confirmedCount} of ${report.trip.seats.length} seats</small></div><div class="metric-card"><span>Confirmed fares</span><strong>${money(report.confirmedFare)}</strong></div><div class="metric-card"><span>Refunds</span><strong>${money(report.simulatedRefunds)}</strong></div></div><form id="policyForm" class="policy-form"><label>Fare ₹<input name="fare" type="number" min="1" value="${report.trip.fare / 100}" required></label><label>Cutoff hours<input name="cancellationHours" type="number" min="0" value="${report.trip.cancellationHours}" required></label><label>Refund %<input name="refundPercent" type="number" min="0" max="100" value="${report.trip.refundPercent}" required></label><button class="button secondary" type="submit">Update future booking policy</button></form>${report.trip.status === 'disrupted' ? `<div class="recovery-banner"><strong>Journey needs recovery</strong><span>${escapeHtml(report.trip.disruptionReason)}</span></div><button class="button primary wide" id="openRecovery">Assign replacement bus</button>` : `<button class="button danger wide" id="markDisrupted">Report a disruption</button>`}<div class="manifest"><div class="panel-title"><h2>Passenger manifest</h2><span>${report.confirmedCount} confirmed</span></div><div class="report-actions"><button class="button ghost" id="downloadManifest">Download CSV</button></div>${report.manifest.length ? report.manifest.map(b => `<div class="manifest-row"><span>${escapeHtml(b.passenger.name)}</span><b>${escapeHtml(b.seat)}</b><span>${escapeHtml(b.pnr)}</span></div>`).join('') : '<p class="ops-meta">No confirmed passengers.</p>'}</div><div class="manifest"><div class="panel-title"><h2>Audit history</h2><span>${audit.length} events</span></div><div class="audit-list">${audit.length ? audit.map(a => `<div class="audit-row"><strong>${escapeHtml(a.action.replaceAll('.', ' '))}</strong><time>${new Date(a.at).toLocaleString('en-IN')}</time></div>`).join('') : '<p class="ops-meta">No recorded actions.</p>'}</div></div>`;
    $('#markDisrupted')?.addEventListener('click', disruptTrip); $('#openRecovery')?.addEventListener('click', openRecovery); $('#downloadManifest').addEventListener('click', () => downloadManifest(report)); $('#policyForm').addEventListener('submit', updatePolicy);
  } catch (error) { toast(error.message); }
}
async function updatePolicy(event) {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
  try { await request(`/trips/${state.activeTrip._id}/policy`, { method: 'PATCH', body: JSON.stringify({ fare: Math.round(Number(fields.fare) * 100), cancellationHours: Number(fields.cancellationHours), refundPercent: Number(fields.refundPercent) }) }); toast('Trip policy updated'); openTrip(state.activeTrip._id); } catch (error) { toast(error.message); }
}
function downloadManifest(report) {
  const rows = [['PNR','Passenger','Age','Seat','Boarding','Drop','Status'], ...report.manifest.map(b => [b.pnr,b.passenger.name,b.passenger.age,b.seat,b.boarding,b.drop,b.status])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `manifest-${state.activeTrip._id}.csv`; link.click(); URL.revokeObjectURL(link.href);
}
async function disruptTrip() {
  const reason = prompt('Describe the disruption (for example: Mechanical fault)'); if (!reason?.trim()) return;
  try { await request(`/operator/trips/${state.activeTrip._id}/disrupt`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }); toast('Trip marked as disrupted'); await loadOperations(); } catch (error) { toast(error.message); }
}
function openRecovery() {
  const eligible = state.buses.filter(b => b._id !== state.activeTrip.busId);
  $('#replacementBus').innerHTML = '<option value="">Choose a bus</option>' + eligible.map(b => `<option value="${b._id}">${escapeHtml(b.registration)} · ${b.seats.length} seats</option>`).join('');
  $('#recoveryCopy').textContent = `${state.activeTrip.routeName} has ${state.activeTrip.seats.length} seats. Preview verifies layout and schedule safety before any ticket changes.`;
  $('#recoveryPreview').classList.add('hidden'); $('#confirmReplacement').classList.add('hidden'); $('#recoveryError').classList.add('hidden'); state.preview = null; $('#recoveryDialog').showModal();
}
$('#previewReplacement').addEventListener('click', async () => {
  const busId = $('#replacementBus').value; if (!busId) { toast('Choose a replacement bus'); return; }
  try {
    const preview = await request(`/operator/trips/${state.activeTrip._id}/replacement-preview`, { method: 'POST', body: JSON.stringify({ busId }) });
    if ($('#replacementBus').value !== busId) return;
    state.preview = { ...preview, busId };
    const box = $('#recoveryPreview'); box.classList.remove('hidden', 'bad'); box.classList.toggle('bad', !preview.canReplace);
    box.innerHTML = preview.canReplace ? `<strong>Safe to replace</strong><p>${preview.passengerCount} passenger ticket${preview.passengerCount === 1 ? '' : 's'} will keep the same PNR and seat.</p>` : `<strong>Manual review required</strong><p>${escapeHtml(preview.reason)}</p>${preview.affected.length ? `<p>Affected: ${preview.affected.map(a => `${escapeHtml(a.pnr)} (${escapeHtml(a.seat)})`).join(', ')}</p>` : ''}`;
    $('#confirmReplacement').classList.toggle('hidden', !preview.canReplace);
  } catch (error) { $('#recoveryError').textContent = error.message; $('#recoveryError').classList.remove('hidden'); }
});
$('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!state.preview?.canReplace || state.preview.busId !== $('#replacementBus').value) return; const button = event.submitter; button.disabled = true;
  try { await request(`/operator/trips/${state.activeTrip._id}/replace-bus`, { method: 'POST', body: JSON.stringify({ busId: state.preview.busId, revision: state.preview.revision }) }); $('#recoveryDialog').close(); toast('Replacement confirmed — every PNR was preserved'); await loadOperations(); } catch (error) { $('#recoveryError').textContent = error.message; $('#recoveryError').classList.remove('hidden'); } finally { button.disabled = false; }
});
$('#refreshOperations').addEventListener('click', loadOperations);
$('#replacementBus').addEventListener('change', () => { state.preview = null; $('#recoveryPreview').classList.add('hidden'); $('#confirmReplacement').classList.add('hidden'); $('#recoveryError').classList.add('hidden'); });
async function loadAdmin() {
  $('#adminRecordsList').innerHTML = '<div class="empty-state compact"><p>Loading configuration…</p></div>';
  try {
    const [operators, buses, routes, trips, requests] = await Promise.all([
      allRecords('/operators'),
      allRecords('/buses'),
      allRecords('/routes'),
      allRecords('/operator/trips'),
      allRecords('/operator-requests').catch(() => []),
    ]);
    state.admin = { operators, buses, routes, trips, requests }; populateAdminOptions(); renderAdminRecords();
  } catch (error) { $('#adminRecordsList').innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
}
function populateAdminOptions() {
  const operatorOptions = '<option value="">Choose operator</option>' + state.admin.operators.map(o => `<option value="${o._id}">${escapeHtml(o.name)}</option>`).join('');
  $$('.operator-options').forEach(select => select.innerHTML = operatorOptions);
  $('.bus-options').innerHTML = '<option value="">Choose bus</option>' + state.admin.buses.map(b => `<option value="${b._id}">${escapeHtml(b.registration)} · ${b.seats.length} seats</option>`).join('');
  $('.route-options').innerHTML = '<option value="">Choose route</option>' + state.admin.routes.map(r => `<option value="${r._id}">${escapeHtml(r.name)}</option>`).join('');
}
function renderAdminRecords() {
  const labels = { operators: 'Operators', buses: 'Buses and seat layouts', routes: 'Routes and ordered stops', trips: 'Scheduled trips', accounts: 'Staff accounts', requests: 'Operator requests' }; $('#adminRecordsTitle').textContent = labels[state.adminTab] || 'Records';
  const records = state.adminTab === 'accounts' ? [] : state.admin[state.adminTab];
  pagedList($('#adminRecordsList'), records || [], record => {
    if (state.adminTab === 'operators') return `<div class="record-row"><div><strong>${escapeHtml(record.name)}</strong><small>${record._id}</small></div><span class="status">active</span></div>`;
    if (state.adminTab === 'buses') return `<div class="record-row"><div><strong>${escapeHtml(record.registration)}</strong><small>${record.seats.length} seats · ${escapeHtml(record.seats.join(', '))}</small></div><span class="status">vehicle</span></div>`;
    if (state.adminTab === 'routes') return `<div class="record-row"><div><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.stops.join(' → '))}</small></div><span class="status">${record.stops.length} stops</span></div>`;
    if (state.adminTab === 'requests') return `<div class="record-row"><div><strong>${escapeHtml(record.companyName || 'Operator')} — ${escapeHtml(record.name)}</strong><small>${escapeHtml(record.email)} · ${escapeHtml(record.phone || '')} · Fleet: ${record.fleetSize || 1} buses</small>${record.message ? `<small style="display:block;margin-top:4px">Note: ${escapeHtml(record.message)}</small>` : ''}</div><div><span class="status">${escapeHtml(record.status || 'pending')}</span>${record.status === 'pending' ? `<button type="button" class="button ghost prefill-staff" data-name="${escapeHtml(record.name)}" data-email="${escapeHtml(record.email)}" style="margin-left:8px;padding:6px 12px;font-size:11px">Create Login</button>` : ''}</div></div>`;
    return `<div class="record-row"><div><strong>${escapeHtml(record.routeName)}</strong><small>${date(record.departure)} · ${time(record.departure)} · ${money(record.fare)}</small></div><span class="status">${escapeHtml(record.status)}</span></div>`;
  }, body => {
    body.querySelectorAll('.prefill-staff').forEach(btn => {
      btn.onclick = () => {
        state.adminTab = 'accounts';
        $$('[data-admin-tab]').forEach(b => b.classList.toggle('active', b.dataset.adminTab === 'accounts'));
        $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === 'accounts'));
        const form = $('#accountForm');
        form.querySelector('input[name="name"]').value = btn.dataset.name;
        form.querySelector('input[name="email"]').value = btn.dataset.email;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Applicant details loaded. Select operator & set password.');
        renderAdminRecords();
      };
    });
    if (!['operators','buses','routes'].includes(state.adminTab)) return;
    [...body.querySelectorAll('.record-row')].forEach(row => {
      const title = row.querySelector('strong').textContent;
      const record = records.find(item => (item.name || item.registration) === title);
      if (!record) return;
      const button = document.createElement('button'); button.className = 'button ghost edit-record'; button.textContent = 'Edit';
      button.onclick = () => {
        const form = $(`[data-admin-panel="${state.adminTab}"]`); form.dataset.editId = record._id;
        for (const field of form.elements) if (field.name && record[field.name] !== undefined) field.value = Array.isArray(record[field.name]) ? record[field.name].join(', ') : record[field.name];
        form.querySelector('button').textContent = 'Save changes'; form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }; row.append(button);
    });
  });
}
$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => { state.adminTab = button.dataset.adminTab; $$('[data-admin-tab]').forEach(b => b.classList.toggle('active', b === button)); $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === state.adminTab)); renderAdminRecords(); }));
const parseList = value => value.split(',').map(item => item.trim()).filter(Boolean);
async function submitAdminForm(form, path, buildBody, success) {
  const button = form.querySelector('button[type="submit"],button:not([type])'); button.disabled = true; $('#adminFormError').classList.add('hidden');
  try { const editing = form.dataset.editId; await request(editing ? `${path}/${editing}` : path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(buildBody(Object.fromEntries(new FormData(form)))) }); form.reset(); delete form.dataset.editId; button.textContent = 'Create record'; toast(editing ? 'Changes saved' : success); await loadAdmin(); }
  catch (error) { $('#adminFormError').textContent = error.message; $('#adminFormError').classList.remove('hidden'); } finally { button.disabled = false; }
}
$('#operatorForm').addEventListener('submit', event => { event.preventDefault(); submitAdminForm(event.currentTarget, '/operators', x => ({ name: x.name }), 'Operator created'); });
$('#busForm').addEventListener('submit', event => { event.preventDefault(); submitAdminForm(event.currentTarget, '/buses', x => ({ operatorId: x.operatorId, registration: x.registration, seats: parseList(x.seats) }), 'Bus and seat layout created'); });
$('#routeForm').addEventListener('submit', event => { event.preventDefault(); submitAdminForm(event.currentTarget, '/routes', x => ({ name: x.name, stops: parseList(x.stops) }), 'Route created'); });
$('#tripForm').addEventListener('submit', event => { event.preventDefault(); submitAdminForm(event.currentTarget, '/trips', x => ({ busId: x.busId, routeId: x.routeId, departure: new Date(x.departure).toISOString(), arrival: new Date(x.arrival).toISOString(), fare: Math.round(Number(x.fare) * 100), cancellationHours: Number(x.cancellationHours), refundPercent: Number(x.refundPercent) }), 'Trip scheduled'); });
$('#accountForm').addEventListener('submit', event => { event.preventDefault(); submitAdminForm(event.currentTarget, '/operator-accounts', x => x, 'Staff account created'); });
$('#refreshAdmin').addEventListener('click', loadAdmin);
document.addEventListener('click', event => { if (event.target.closest('#logoutButton')) logout(true); });
renderAccount();
