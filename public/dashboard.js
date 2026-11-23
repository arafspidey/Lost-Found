// Dashboard: claims on items I found, and the claims I made.
const messageBox = document.getElementById('message');
const foundList = document.getElementById('foundList');
const claimedList = document.getElementById('claimedList');

// Runs an action (approve, reject, ...), shows the result, then redraws the lists.
async function act(url, options, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  clearMessage(messageBox);
  try {
    const result = await api(url, options || { method: 'POST' });
    showMessage(messageBox, result.message, 'ok');
    await load();
  } catch (err) {
    showMessage(messageBox, err.message);
  }
  window.scrollTo({ top: 0 });
}

function thumb(photoUrl) {
  return photoUrl
    ? el('img', { class: 'thumb', src: photoUrl, alt: '' })
    : el('div', { class: 'thumb thumb-empty', text: 'No photo' });
}

function contactBox(label, name, phone) {
  return el('div', { class: 'contact' }, label + ' ', el('strong', { text: name }), ': ', el('a', { href: 'tel:' + phone, text: phone }));
}

// A button that opens a small form asking what went wrong.
function reportControl(claimId, buttonText) {
  const holder = el('div', { class: 'report-form' });
  const showButton = () =>
    holder.replaceChildren(
      el('button', { class: 'btn btn-light btn-small', type: 'button', text: buttonText, onclick: showForm })
    );
  const showForm = () => {
    const reason = el('textarea', { minlength: '10', maxlength: '500', required: true, placeholder: 'For example: agreed to meet at 5 pm but never showed up.' });
    const form = el(
      'form',
      {},
      el('label', {}, 'What happened?', reason),
      el('div', { class: 'actions' },
        el('button', { class: 'btn btn-danger btn-small', type: 'submit', text: 'Send report' }),
        el('button', { class: 'btn btn-light btn-small', type: 'button', text: 'Cancel', onclick: showButton })
      )
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      act('/api/claims/' + claimId + '/report', { json: { reason: reason.value } });
    });
    holder.replaceChildren(form);
    reason.focus();
  };
  showButton();
  return holder;
}

// ----- Items I found -----
function claimForFinder(item, claim) {
  const box = el(
    'div',
    { class: 'claim' },
    el('div', { class: 'row-head' }, el('strong', { text: claim.claimant_name }), statusBadge(claim.status)),
    el('p', { class: 'small muted', text: formatDate(claim.created_at) + ' - their answer:' }),
    el('blockquote', { class: 'answer', text: claim.answer })
  );

  if (claim.status === 'pending' && item.status === 'available') {
    box.append(
      el('div', { class: 'actions' },
        el('button', {
          class: 'btn btn-small', type: 'button', text: 'Approve',
          onclick: () => act('/api/claims/' + claim.id + '/approve', null,
            'Approve this claim? Your phone number will be shared with ' + claim.claimant_name + '.'),
        }),
        el('button', {
          class: 'btn btn-light btn-small', type: 'button', text: 'Reject',
          onclick: () => act('/api/claims/' + claim.id + '/reject'),
        })
      )
    );
  }

  if (claim.status === 'approved') {
    box.append(
      contactBox('Contact', claim.claimant_name, claim.claimant_phone),
      el('div', { class: 'actions' },
        el('button', {
          class: 'btn btn-small', type: 'button', text: 'Mark as handed over',
          onclick: () => act('/api/claims/' + claim.id + '/handed-over', null, 'Confirm that the item has been handed over?'),
        })
      ),
      reportControl(claim.id, 'Report a no-show')
    );
  }

  if (claim.status === 'reported') {
    box.append(
      contactBox('Contact', claim.claimant_name, claim.claimant_phone),
      el('p', { class: 'small muted', text: claim.reported_by_me ? 'You reported this. An admin will review it.' : 'The other person reported a problem. An admin will review it.' })
    );
  }
  return box;
}

function foundItem(item) {
  const removeButton =
    item.status === 'available'
      ? el('button', {
          class: 'btn btn-light btn-small', type: 'button', text: 'Remove listing',
          onclick: () => act('/api/items/' + item.id, { method: 'DELETE' }, 'Remove this listing? Pending claims will be closed.'),
        })
      : null;

  return el(
    'article',
    { class: 'panel row-item' },
    thumb(item.photo_url),
    el(
      'div',
      {},
      el('div', { class: 'row-head' },
        el('h3', {}, el('a', { href: '/item.html?id=' + item.id, text: item.category })),
        statusBadge(item.status),
        el('span', { class: 'muted small', text: item.location + ' - posted ' + formatDate(item.created_at) })
      ),
      el('p', { text: item.description }),
      el('div', { class: 'private-box' },
        el('div', {}, el('strong', { text: 'Your question: ' }), item.secret_question),
        item.secret_answer ? el('div', {}, el('strong', { text: 'Your notes: ' }), item.secret_answer) : null
      ),
      item.claims.length
        ? item.claims.map((claim) => claimForFinder(item, claim))
        : el('p', { class: 'muted small', text: 'No claims yet. When someone claims this item, their answer appears here for you to check.' }),
      removeButton ? el('div', { class: 'actions' }, removeButton) : null
    )
  );
}

// ----- Items I claimed -----
const CLAIM_NOTE = {
  pending: 'Waiting for the finder to review your answer.',
  rejected: 'The finder did not approve this claim.',
  completed: 'The item was handed over.',
  reported: 'A problem was reported for this handover. An admin will review it.',
};

function myClaim(claim) {
  const body = el(
    'div',
    {},
    el('div', { class: 'row-head' },
      el('h3', {}, el('a', { href: '/item.html?id=' + claim.item_id, text: claim.category })),
      statusBadge(claim.status),
      el('span', { class: 'muted small', text: claim.location })
    ),
    el('p', { text: claim.description }),
    CLAIM_NOTE[claim.status] ? el('p', { class: 'muted small', text: CLAIM_NOTE[claim.status] }) : null
  );

  if (claim.status === 'approved') {
    body.append(
      el('p', { text: 'Approved. Contact the finder and arrange a safe place to meet.' }),
      contactBox('Finder', claim.finder_name, claim.finder_phone),
      el('div', { class: 'actions' },
        el('button', {
          class: 'btn btn-small', type: 'button', text: 'I received my item',
          onclick: () => act('/api/claims/' + claim.id + '/handed-over', null, 'Confirm that you received the item?'),
        })
      ),
      reportControl(claim.id, 'Report the finder')
    );
  }
  if (claim.status === 'reported') {
    body.append(contactBox('Finder', claim.finder_name, claim.finder_phone));
  }
  return el('article', { class: 'panel row-item' }, thumb(claim.photo_url), body);
}

// ----- Draw everything -----
async function load() {
  const [items, claims] = await Promise.all([api('/api/my/items'), api('/api/my/claims')]);

  foundList.replaceChildren(
    ...(items.length
      ? items.map(foundItem)
      : [el('div', { class: 'empty' }, 'You have not posted anything yet. ', el('a', { href: '/post.html', text: 'Post a found item' }))])
  );
  claimedList.replaceChildren(
    ...(claims.length
      ? claims.map(myClaim)
      : [el('div', { class: 'empty' }, 'You have not claimed anything yet. ', el('a', { href: '/', text: 'Browse found items' }))])
  );
}

async function start() {
  const user = await initPage({ requireLogin: true });
  if (!user) return;
  try {
    await load();
  } catch (err) {
    showMessage(messageBox, err.message);
  }
}

start();
