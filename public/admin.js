// Admin page: reports, repeat offenders, restoring hidden listings.
const messageBox = document.getElementById('message');
const reportsBox = document.getElementById('reports');
const usersBox = document.getElementById('users');

function table(headings, rows) {
  return el(
    'div',
    { class: 'table-wrap' },
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, headings.map((h) => el('th', { text: h })))),
      el('tbody', {}, rows)
    )
  );
}

async function restore(itemId) {
  if (!confirm('Put this listing back on the public list?')) return;
  clearMessage(messageBox);
  try {
    const result = await api('/api/admin/items/' + itemId + '/restore', { method: 'POST' });
    showMessage(messageBox, result.message, 'ok');
    await load();
  } catch (err) {
    showMessage(messageBox, err.message);
  }
}

function reportRow(r) {
  const action =
    r.item_status === 'flagged'
      ? el('button', { class: 'btn btn-light btn-small', type: 'button', text: 'Restore listing', onclick: () => restore(r.item_id) })
      : el('span', { class: 'muted small', text: '-' });
  return el(
    'tr',
    {},
    el('td', { text: formatDate(r.created_at) }),
    el('td', {}, el('a', { href: '/item.html?id=' + r.item_id, text: r.category }), el('div', {}, statusBadge(r.item_status))),
    el('td', {},
      el('strong', { text: r.accused_name }),
      el('div', { class: 'small', text: r.accused_phone }),
      el('div', { class: 'small', text: 'NID ' + r.accused_nid }),
      el('div', { class: 'small muted', text: r.accused_total_reports + ' report(s) in total' })
    ),
    el('td', {}, r.reporter_name, el('div', { class: 'small', text: r.reporter_phone })),
    el('td', { text: r.reason }),
    el('td', {}, action)
  );
}

async function load() {
  const [reports, users] = await Promise.all([api('/api/admin/reports'), api('/api/admin/users')]);

  reportsBox.replaceChildren(
    reports.length
      ? table(['Date', 'Item', 'Reported person', 'Reported by', 'What happened', ''], reports.map(reportRow))
      : el('div', { class: 'empty', text: 'No reports yet.' })
  );

  usersBox.replaceChildren(
    users.length
      ? table(
          ['Name', 'Phone', 'NID', 'Reports against'],
          users.map((u) =>
            el('tr', {}, el('td', { text: u.name }), el('td', { text: u.phone }), el('td', { text: u.nid }), el('td', { text: String(u.reports_against) }))
          )
        )
      : el('div', { class: 'empty', text: 'Nobody has been reported.' })
  );
}

async function start() {
  const user = await initPage({ requireAdmin: true });
  if (!user) return;
  try {
    await load();
  } catch (err) {
    showMessage(messageBox, err.message);
  }
}

start();
