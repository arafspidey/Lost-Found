// Post-a-found-item page (login required).
const form = document.getElementById('postForm');
const message = document.getElementById('message');
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

async function start() {
  const user = await initPage({ requireLogin: true });
  if (!user) return;

  const [categories, locations] = await Promise.all([api('/api/categories'), api('/api/locations')]);
  fillSelect(form.elements.category, categories);
  locationPicker(
    {
      district: document.getElementById('district'),
      upazila: document.getElementById('upazila'),
      area: document.getElementById('area'),
    },
    locations,
    {
      placeholders: { district: 'Choose a district', upazila: 'Choose an upazila', area: 'Choose a village / mohalla' },
      autoPick: true, // when there is only one choice, it is selected for you
    }
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage(message);

    const photo = form.elements.photo.files[0];
    if (photo && photo.size > MAX_PHOTO_BYTES) {
      return showMessage(message, 'Photo must be under 3 MB');
    }

    const data = new FormData(form);
    if (!photo) data.delete('photo'); // no file chosen: do not send an empty one

    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await api('/api/items', { form: data });
      location.href = '/item.html?id=' + result.id;
    } catch (err) {
      showMessage(message, err.message);
      button.disabled = false;
    }
  });
}

start();
