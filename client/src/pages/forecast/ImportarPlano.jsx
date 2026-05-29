import { useMemo, useState } from 'react';
import { ClipboardPaste, FileSpreadsheet, Save, Upload } from 'lucide-react';
import ImportPreviewTable from '../../components/forecast/ImportPreviewTable.jsx';
import { forecastApi } from '../../services/forecastApi.js';

const REQUIRED = ['REGIONAL', 'ID_LOCAL', 'TERCEIRO', 'TIPO', 'QF', 'PT'];

export default function ImportarPlano() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const validation = useMemo(() => validateRows(rows), [rows]);

  function previewFromText(value = text) {
    setError('');
    try {
      setRows(parseDelimited(value));
    } catch (err) {
      setError(err.message);
    }
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    try {
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const parsed = await parseExcel(file);
        setRows(parsed);
      } else {
        const content = await file.text();
        setText(content);
        setRows(parseDelimited(content));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  async function save() {
    if (!rows.length || validation.length) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const payload = await forecastApi.importar({ rows });
      setMessage(payload.message);
      setRows([]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="forecast-import-grid">
      <section className="forecast-panel">
        <div className="panel-head"><h2>Importar Plano S&OP</h2></div>
        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        <div className="form-stack">
          <label className="field">
            <span>Tabela copiada do e-mail</span>
            <textarea
              rows="12"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'REGIONAL\tID_LOCAL\tTERCEIRO\tTIPO\tQF\tPT\tOBS\nMG\tBRXMG3\tID\tXD\t33\t0'}
            />
          </label>
          <div className="toolbar">
            <button type="button" className="tool-btn" onClick={() => previewFromText()}>
              <ClipboardPaste size={17} />
              Gerar previa
            </button>
            <label className="tool-btn">
              <Upload size={17} />
              CSV ou Excel
              <input hidden type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" onChange={readFile} />
            </label>
            <button type="button" className="primary-btn" disabled={!rows.length || validation.length || loading} onClick={save}>
              <Save size={17} />
              {loading ? 'Salvando...' : 'Salvar no Supabase'}
            </button>
          </div>
        </div>
      </section>

      <section className="forecast-panel">
        <div className="panel-head">
          <h2>Previa</h2>
          <span className="muted-inline"><FileSpreadsheet size={16} /> {rows.length} linha(s)</span>
        </div>
        <ImportPreviewTable rows={rows} errors={validation} />
      </section>
    </div>
  );
}

function parseDelimited(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((item) => normalizeHeader(item));
  return lines.slice(1).map((line, index) => {
    const values = line.split(delimiter);
    return headers.reduce((row, header, columnIndex) => {
      row[header] = (values[columnIndex] || '').trim();
      row.id = index + 1;
      return row;
    }, {});
  });
}

async function parseExcel(file) {
  try {
    const importer = new Function("return import('xlsx')");
    const XLSX = await importer();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row, index) => normalizeExcelRow(row, index));
  } catch {
    throw new Error('Para importar Excel, instale a dependencia xlsx no cliente. CSV, TSV e colagem ja estao disponiveis.');
  }
}

function normalizeExcelRow(row, index) {
  return Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    acc.id = index + 1;
    return acc;
  }, {});
}

function normalizeHeader(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function validateRows(rows) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]).map((item) => item.toUpperCase());
  const missing = REQUIRED.filter((column) => !headers.includes(column));
  const errors = [];
  if (missing.length) errors.push(`Colunas obrigatorias ausentes: ${missing.join(', ')}.`);
  const invalid = rows.filter((row) => !row.REGIONAL || !row.ID_LOCAL || !row.TERCEIRO || !row.TIPO || row.QF === '' || row.PT === '');
  if (invalid.length) errors.push(`${invalid.length} linha(s) com campos obrigatorios vazios.`);
  return errors;
}
