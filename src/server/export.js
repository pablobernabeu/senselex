// FAIR-aligned export. Norms leave the system as plain CSV accompanied by a JSON
// metadata sidecar that names the licence, the columns, and the provenance, so
// the data are findable, interoperable, and reusable rather than locked in the
// service. The metadata shape follows the spirit of the Cross-Linguistic Data
// Formats so the output can be ingested by existing crosslinguistic tooling.

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toSensorimotorCsv(rows, dimensions) {
  const header = [
    'concept_id',
    'word',
    'n',
    ...dimensions.map((d) => `mean_${d}`),
    'dominant_modality',
    'max_perceptual_strength',
    'modality_exclusivity',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const cells = [
      row.conceptId,
      row.word,
      row.n,
      ...dimensions.map((d) => round(row.mean[d])),
      row.dominantModality,
      round(row.maximumPerceptualStrength),
      round(row.modalityExclusivity),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function round(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return Math.round(value * 1000) / 1000;
}

export function datasetMetadata(language, dimensions) {
  return {
    'dc:title': `SenseLex sensorimotor norms for ${language.name || language.code}`,
    'dc:license': 'https://creativecommons.org/licenses/by/4.0/',
    'dc:conformsTo': 'http://cldf.clld.org/v1.0/terms.rdf#StructureDataset',
    'dc:source': 'SenseLex Atlas',
    language: {
      code: language.code,
      name: language.name || null,
      script: language.script || null,
      direction: language.direction || null,
    },
    generated: new Date().toISOString(),
    columns: [
      { name: 'concept_id', description: 'Stable concept identifier, linkable to Concepticon' },
      { name: 'word', description: 'Word form rated in the target language' },
      { name: 'n', description: 'Number of contributing raters' },
      ...dimensions.map((d) => ({ name: `mean_${d}`, description: `Mean rated strength on the ${d} dimension (0 to 5)` })),
      { name: 'dominant_modality', description: 'Perceptual channel with the greatest mean strength' },
      { name: 'max_perceptual_strength', description: 'Maximum mean strength across perceptual channels' },
      { name: 'modality_exclusivity', description: 'Range over sum of perceptual strengths (0 to 1)' },
    ],
  };
}
