// Register page.
const form = document.getElementById('registerForm');
const message = document.getElementById('message');

initPage();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage(message);
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/register', { json: Object.fromEntries(new FormData(form)) });
    location.href = nextPage();
  } catch (err) {
    showMessage(message, err.message);
    button.disabled = false;
  }
});
