import { t } from '../libs/i18n.js';

const escapeHtml = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const parseCsvRow = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
};

const parseCsv = (csv) => {
  const lines = csv.split('\n');
  const cleanLines = lines.map((l) => l.replace(/\r$/, ''));
  if (cleanLines.length === 0 || (cleanLines.length === 1 && cleanLines[0] === '')) {
    return { headers: [], data: [] };
  }
  const headers = parseCsvRow(cleanLines[0]);
  const data = cleanLines.slice(1).filter((l) => l.trim() !== '').map(parseCsvRow);
  return { headers, data };
};

const csvToHtml = (csv) => {
  if (!csv || !csv.trim()) return '<p class="text-muted">' + t('emptyFile') + '</p>';
  const { headers, data } = parseCsv(csv);
  if (headers.length === 0 && data.length === 0) return '<p class="text-muted">' + t('emptyFile') + '</p>';
  let html = '<table class="table table-striped" style="margin:1em 0;">\n<thead>\n<tr>';
  html += headers.map((h) => '<th>' + escapeHtml(h) + '</th>').join('');
  html += '</tr>\n</thead>\n<tbody>\n';
  for (const row of data) {
    html += '<tr>' + row.map((c) => '<td>' + escapeHtml(c) + '</td>').join('') + '</tr>';
  }
  html += '</tbody>\n</table>';
  return html;
};

export { parseCsvRow, parseCsv, csvToHtml };
