// Home page: search form and results.
const form = document.getElementById('searchForm');
const results = document.getElementById('results');
const resultCount = document.getElementById('resultCount');

async function search() {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (String(value).trim()) params.set(key, String(value).trim());
  }
  try {
    const items = await api('/api/items?' + params);
    results.replaceChildren();
    if (items.length === 0) {
      resultCount.textContent = '';
      results.append(
        el('div', { class: 'empty', text: 'Nothing matches yet. Try fewer words or a wider place, or check back later.' })
      );
      return;
    }
    resultCount.textContent = items.length + (items.length === 1 ? ' item found' : ' items found');
    for (const item of items) results.append(itemCard(item));
  } catch (err) {
    resultCount.textContent = '';
    results.replaceChildren(el('div', { class: 'empty', text: err.message }));
  }
}

async function start() {
  await initPage();
  const [categories, locations] = await Promise.all([api('/api/categories'), api('/api/locations')]);
  fillSelect(form.elements.category, categories);
  locationPicker(
    { district: form.elements.district, upazila: form.elements.upazila, area: form.elements.area },
    locations,
    { placeholders: { district: 'Any district', upazila: 'Any upazila', area: 'Any village / mohalla' } }
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    search();
  });
  search();
}

start();
