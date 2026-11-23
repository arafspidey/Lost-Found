// Item detail page, including the claim form.
const content = document.getElementById('content');
const itemId = new URLSearchParams(location.search).get('id');

// The part of the page where the visitor can claim the item (or see what happens next).
function claimSection(item, user) {
  if (item.mine) {
    return el(
      'div',
      { class: 'claim-box' },
      el('p', { text: 'This is your listing.' }),
      el('a', { class: 'btn btn-light', href: '/dashboard.html', text: 'Review claims on my dashboard' })
    );
  }

  if (item.my_claim) {
    return el(
      'div',
      { class: 'claim-box panel' },
      el('p', {}, 'Your claim: ', statusBadge(item.my_claim.status)),
      el('a', { href: '/dashboard.html', text: 'See your claims' })
    );
  }

  if (item.status !== 'available') return null;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return el(
      'div',
      { class: 'claim-box panel' },
      el('h2', { text: 'Is this yours?' }),
      el('p', { class: 'muted', text: 'Log in to answer the finder\'s verification question.' }),
      el('a', { class: 'btn', href: '/login.html?next=' + next, text: 'Log in to claim' }),
      ' ',
      el('a', { class: 'btn btn-light', href: '/register.html?next=' + next, text: 'Register' })
    );
  }

  const message = el('div');
  const answer = el('textarea', { name: 'answer', minlength: '3', maxlength: '500', required: true });
  const form = el(
    'form',
    { class: 'claim-box panel' },
    el('h2', { text: 'Is this yours?' }),
    el('p', { class: 'muted', text: 'Answer the finder\'s question in your own words. Give as much detail as you can. The finder reads your answer and decides. You can send one claim per item.' }),
    el('div', { class: 'question', text: item.secret_question }),
    el('label', {}, 'Your answer', answer),
    message,
    el('button', { class: 'btn', type: 'submit', text: 'Send claim' })
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage(message);
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await api('/api/items/' + item.id + '/claims', { json: { answer: answer.value } });
      form.replaceChildren(
        el('h2', { text: 'Claim sent' }),
        el('p', { text: result.message }),
        el('a', { class: 'btn btn-light', href: '/dashboard.html', text: 'Go to my dashboard' })
      );
    } catch (err) {
      showMessage(message, err.message);
      button.disabled = false;
    }
  });
  return form;
}

function render(item, user) {
  const photo = item.photo_url
    ? el('img', { src: item.photo_url, alt: item.category + ' photo' })
    : el('div', { class: 'tag-empty', text: 'No photo' });

  document.title = item.category + ' - Lost & Found';
  content.replaceChildren(
    el(
      'div',
      { class: 'detail' },
      photo,
      el(
        'div',
        {},
        el('h1', { text: item.category }),
        statusBadge(item.status),
        el('p', { text: item.description }),
        el(
          'ul',
          { class: 'facts' },
          el('li', { text: 'Found in: ' + item.location }),
          el('li', { text: 'Posted: ' + formatDate(item.created_at) }),
          el('li', { text: 'Found by: ' + item.finder_name })
        ),
        claimSection(item, user)
      )
    )
  );
}

async function start() {
  const user = await initPage();
  try {
    const item = await api('/api/items/' + encodeURIComponent(itemId));
    render(item, user);
  } catch (err) {
    content.replaceChildren(
      el('h1', { text: 'Item not available' }),
      el('p', { class: 'muted', text: 'It may have been returned or removed.' }),
      el('a', { class: 'btn', href: '/', text: 'Browse found items' })
    );
  }
}

start();
