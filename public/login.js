// Login page.
const form = document.getElementById('loginForm');
const message = document.getElementById('message');

initPage();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage(message);
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/login', { json: Object.fromEntries(new FormData(form)) });
    location.href = nextPage();
  } catch (err) {
    showMessage(message, err.message);
    button.disabled = false;
  }
});
