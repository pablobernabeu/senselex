// Atlas front end. It talks to the same-origin API, lists languages and norms,
// and submits a single rating. It is written as a small module with no build
// step and no third-party code, which keeps it auditable and lets the content
// security policy stay strict.

const DIMENSIONS = [
  ['touch', 'Touch'],
  ['hearing', 'Hearing'],
  ['smell', 'Smell'],
  ['taste', 'Taste'],
  ['vision', 'Vision'],
  ['interoception', 'Interoception'],
  ['mouth_throat', 'Mouth or throat'],
  ['hand_arm', 'Hand or arm'],
  ['foot_leg', 'Foot or leg'],
  ['head', 'Head'],
  ['torso', 'Torso'],
];

const select = document.querySelector('#language-select');
const normsBody = document.querySelector('#norms-body');
const normsStatus = document.querySelector('#norms-status');
const downloadCsv = document.querySelector('#download-csv');
const downloadMeta = document.querySelector('#download-meta');
const ratingGrid = document.querySelector('#rating-grid');
const ratingForm = document.querySelector('#rating-form');
const formStatus = document.querySelector('#form-status');

function buildRatingGrid() {
  for (const [key, label] of DIMENSIONS) {
    const row = document.createElement('div');
    row.className = 'rating-row';
    const id = `rating-${key}`;
    const labelEl = document.createElement('label');
    labelEl.setAttribute('for', id);
    labelEl.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.name = key;
    input.min = '0';
    input.max = '5';
    input.step = '0.5';
    input.inputMode = 'decimal';
    row.append(labelEl, input);
    ratingGrid.append(row);
  }
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function loadLanguages() {
  try {
    const data = await getJson('/v1/languages?limit=200');
    select.replaceChildren();
    if (data.rows.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No languages yet';
      option.value = '';
      select.append(option);
      return;
    }
    for (const language of [...data.rows].sort((a, b) => a.name.localeCompare(b.name))) {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = `${language.name} (${language.code})`;
      select.append(option);
    }
    await loadNorms(select.value);
  } catch (error) {
    normsStatus.textContent = `Could not load languages: ${error.message}`;
  }
}

async function loadNorms(language) {
  if (!language) return;
  normsStatus.textContent = 'Loading norms…';
  normsBody.replaceChildren();
  try {
    const data = await getJson(`/v1/norms/sensorimotor?language=${encodeURIComponent(language)}&limit=200`);
    if (data.rows.length === 0) {
      normsStatus.textContent = 'No norms recorded for this language yet.';
    } else {
      normsStatus.textContent = `${data.total} word${data.total === 1 ? '' : 's'} with ratings.`;
      for (const row of data.rows) {
        const tr = document.createElement('tr');
        tr.append(
          cell(row.conceptId),
          cell(row.word, 'word', true),
          cell(row.n),
          cell(row.dominantModality ?? ''),
          cell(format(row.maximumPerceptualStrength)),
          cell(format(row.modalityExclusivity)),
        );
        normsBody.append(tr);
      }
    }
    downloadCsv.href = `/v1/export/sensorimotor.csv?language=${encodeURIComponent(language)}`;
    downloadMeta.href = `/v1/export/metadata.json?language=${encodeURIComponent(language)}`;
  } catch (error) {
    normsStatus.textContent = `Could not load norms: ${error.message}`;
  }
}

function cell(value, className, autoDir) {
  const td = document.createElement('td');
  td.textContent = value;
  if (className) td.className = className;
  if (autoDir) td.setAttribute('dir', 'auto');
  return td;
}

function format(value) {
  return typeof value === 'number' ? value.toFixed(2) : '';
}

async function submitRating(event) {
  event.preventDefault();
  formStatus.textContent = 'Submitting…';
  const form = new FormData(ratingForm);
  const ratings = {};
  for (const [key] of DIMENSIONS) {
    const raw = form.get(key);
    if (raw !== null && raw !== '') ratings[key] = Number(raw);
  }
  const body = {
    clientId: crypto.randomUUID(),
    languageCode: form.get('languageCode'),
    conceptId: form.get('conceptId'),
    word: form.get('word'),
    ratings,
  };
  const token = form.get('token');
  try {
    const response = await fetch('/v1/ratings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(result.detail) ? result.detail.join('; ') : (result.error || 'request failed');
      formStatus.textContent = `Not accepted: ${detail}`;
      return;
    }
    formStatus.textContent = 'Thank you. Your rating was recorded.';
    ratingForm.reset();
    if (body.languageCode === select.value) await loadNorms(select.value);
  } catch (error) {
    formStatus.textContent = `Could not submit: ${error.message}`;
  }
}

buildRatingGrid();
select.addEventListener('change', () => loadNorms(select.value));
ratingForm.addEventListener('submit', submitRating);
loadLanguages();
