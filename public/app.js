// Shared code used by every page: talking to the server, building the menu, small helpers.

// ---------- Talk to the server ----------
// api('/api/items')                          -> GET
// api('/api/login', { json: {...} })         -> POST with JSON
// api('/api/items', { form: formData })      -> POST with a file upload
// api('/api/items/5', { method: 'DELETE' })  -> DELETE
// Resolves to the JSON reply, or throws an Error whose message is the server's error text.
async function api(url, options = {}) {
  const init = { method: options.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (options.json) {
    init.method = options.method || 'POST';
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.json);
  }
  if (options.form) {
    init.method = options.method || 'POST';
    init.body = options.form; // the browser sets the right Content-Type for uploads
  }
  const res = await fetch(url, init);
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    /* no JSON in the reply */
  }
  if (!res.ok) {
    const err = new Error((body && body.error) || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return body;
}

// ---------- Build page elements safely ----------
// el('p', { class: 'muted', text: 'Hello' }, childNode, 'more text')
// Text is always inserted as text (never as HTML), so user input cannot inject code.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

// ---------- Messages ----------
function showMessage(box, text, kind = 'error') {
  box.className = 'msg msg-' + kind;
  box.textContent = text;
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

function clearMessage(box) {
  box.className = 'msg';
  box.textContent = '';
}

// ---------- Formatting ----------
function formatDate(sqlDate) {
  // SQLite stores UTC as "2026-10-17 12:00:00"
  const date = new Date(sqlDate.replace(' ', 'T') + 'Z');
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_TEXT = {
  available: 'Available',
  claimed: 'Handover in progress',
  returned: 'Returned to owner',
  flagged: 'Under review',
  pending: 'Waiting for finder',
  approved: 'Approved',
  rejected: 'Not approved',
  completed: 'Handed over',
  reported: 'Reported',
};

function statusBadge(status) {
  return el('span', { class: 'badge badge-' + status, text: STATUS_TEXT[status] || status });
}

// ---------- Shared pieces ----------
// One item shown as a hang-tag card that links to its detail page.
function itemCard(item) {
  const photo = item.photo_url
    ? el('img', { class: 'tag-photo', src: item.photo_url, alt: item.category + ' photo', loading: 'lazy' })
    : el('div', { class: 'tag-empty', text: 'No photo' });
  return el(
    'a',
    { class: 'tag-card', href: '/item.html?id=' + item.id },
    photo,
    el(
      'div',
      { class: 'tag-body' },
      el('h3', { text: item.category }),
      el('p', { class: 'tag-desc', text: item.description }),
      el('div', { class: 'tag-meta', text: item.location + ' - found ' + formatDate(item.created_at) })
    )
  );
}

// Fills a <select> with options. `items` are strings or { id, name } objects.
function fillSelect(select, items) {
  for (const item of items) {
    const isText = typeof item === 'string';
    select.append(el('option', { value: isText ? item : item.id, text: isText ? item : item.name }));
  }
}

// Three linked dropdowns: choosing a district fills the upazilas, choosing an upazila fills the areas.
//   selects:      { district, upazila, area }  (three <select> elements)
//   tree:         the reply of /api/locations
//   placeholders: the first option of each list, e.g. { district: 'Any district', ... }
//   autoPick:     when a list has only one choice, select it automatically
function locationPicker(selects, tree, { placeholders, autoPick = false }) {
  const { district, upazila, area } = selects;

  function fill(select, placeholder, items) {
    select.replaceChildren(el('option', { value: '', text: placeholder }));
    fillSelect(select, items);
    select.disabled = items.length === 0;
    if (autoPick && items.length === 1) select.value = String(items[0].id);
  }
  const upazilasOf = () => (tree.find((d) => String(d.id) === district.value) || { upazilas: [] }).upazilas;
  const areasOf = () => (upazilasOf().find((u) => String(u.id) === upazila.value) || { areas: [] }).areas;

  function updateAreas() {
    fill(area, placeholders.area, areasOf());
  }
  function updateUpazilas() {
    fill(upazila, placeholders.upazila, upazilasOf());
    updateAreas();
  }

  district.addEventListener('change', updateUpazilas);
  upazila.addEventListener('change', updateAreas);
  fill(district, placeholders.district, tree);
  updateUpazilas();
}

// ---------- Page start-up ----------
// Every page calls initPage(). It checks who is logged in and draws the menu.
//   initPage()                         -> anyone can view
//   initPage({ requireLogin: true })   -> sends visitors to the login page first
//   initPage({ requireAdmin: true })   -> admins only
// Returns the user, or null when the page should stop (redirecting or not allowed).
async function initPage(options = {}) {
  let user = null;
  try {
    user = await api('/api/me');
  } catch (e) {
    user = null;
  }

  if (options.requireLogin && !user) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    return null;
  }

  drawMenu(user);

  if (options.requireAdmin && (!user || user.role !== 'admin')) {
    const main = document.querySelector('main');
    main.replaceChildren(
      el('h1', { text: 'Admins only' }),
      el('p', { class: 'muted', text: 'You need an admin account to see this page.' })
    );
    return null;
  }
  return user;
}

function drawMenu(user) {
  const header = document.getElementById('siteHeader');
  const here = location.pathname;
  const link = (href, text) => el('a', { href, text, 'aria-current': here === href ? 'page' : null });

  const nav = el('nav', { 'aria-label': 'Main' }, link('/', 'Browse'), link('/post.html', 'Post a found item'));
  if (user) {
    nav.append(link('/dashboard.html', 'My dashboard'));
    if (user.role === 'admin') nav.append(link('/admin.html', 'Admin'));
    nav.append(
      el('span', { class: 'who', text: user.name }),
      el('button', {
        class: 'link',
        type: 'button',
        text: 'Log out',
        onclick: async () => {
          await api('/api/logout', { method: 'POST' });
          location.href = '/';
        },
      })
    );
  } else {
    nav.append(link('/login.html', 'Log in'), link('/register.html', 'Register'));
  }

  header.replaceChildren(
    el(
      'div',
      { class: 'wrap' },
      el('a', { class: 'brand', href: '/' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'Lost & Found'),
      nav
    )
  );
}

// After login/register, go back to where the person was heading (same site only).
function nextPage() {
  const next = new URLSearchParams(location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
