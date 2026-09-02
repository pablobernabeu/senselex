// FAIR-aligned export. Norms leave the system as plain CSV accompanied by a JSON
// metadata sidecar that names the licence, the columns, and the provenance, so
// the data are findable, interoperable, and reusable rather than locked in the
// service. The metadata shape follows the spirit of the Cross-Linguistic Data
// Formats so the output can be ingested by existing crosslinguistic tooling.

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Spreadsheet applications treat a cell opening with any of these as a
  // formula, so a word form beginning with one would execute on open. Prefixing
  // a single quote is the standard neutralisation and is stripped on import.
  // Word forms reach this function from participant input, so the risk is real
  // rather than theoretical.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toSensorimotorCsv(rows, dimensions) {
  const header = [
    'concept_id',
    'word',
    'n_records',
    ...dimensions.flatMap((d) => [`mean_${d}`, `n_${d}`]),
    'dominant_modality',
    'max_perceptual_strength',
    'modality_exclusivity',
    'n_perceptual_channels',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const cells = [
      row.conceptId,
      row.word,
      row.nRecords,
      ...dimensions.flatMap((d) => [round(row.mean[d]), row.n?.[d] ?? 0]),
      row.dominantModality,
      round(row.maximumPerceptualStrength),
      round(row.modalityExclusivity),
      row.perceptualChannels,
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function round(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return Math.round(value * 1000) / 1000;
}

export function datasetMetadata(language, dimensions, { total, returned } = {}) {
  return {
    'dc:title': `SenseLex sensorimotor norms for ${language.name || language.code}`,
    'dc:license': 'https://creativecommons.org/licenses/by/4.0/',
    'dc:source': 'SenseLex Atlas',
    language: {
      code: language.code,
      name: language.name || null,
      script: language.script || null,
      direction: language.direction || null,
    },
    generated: new Date().toISOString(),
    // Stated so a reader can tell a complete export from a truncated one without
    // counting rows against a separate query.
    rows: { total: total ?? null, returned: returned ?? null, complete: total === undefined || total === returned },
    columns: [
      { name: 'concept_id', description: 'Stable concept identifier. Carries an optional Concepticon identifier in the concepts table when the researcher has supplied one; it is not resolved automatically.' },
      { name: 'word', description: 'Word form rated in the target language' },
      { name: 'n_records', description: 'Rating records contributing to this word' },
      ...dimensions.flatMap((d) => [
        { name: `mean_${d}`, description: `Mean rated strength on the ${d} dimension (0 to 5); empty when no rater judged this channel` },
        { name: `n_${d}`, description: `Raters who judged the ${d} dimension for this word` },
      ]),
      { name: 'dominant_modality', description: 'Perceptual channel with the greatest mean strength; empty when no channel was rated above zero' },
      { name: 'max_perceptual_strength', description: 'Maximum mean strength across rated perceptual channels' },
      { name: 'modality_exclusivity', description: 'Range over sum of rated perceptual strengths (0 to 1); empty below two rated channels' },
      { name: 'n_perceptual_channels', description: 'Perceptual channels contributing to the exclusivity score. Exclusivity is bounded by this count, so values computed over different numbers of channels are not directly comparable.' },
    ],
  };
}
