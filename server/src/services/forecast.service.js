const REQUIRED_IMPORT_COLUMNS = ['REGIONAL', 'ID_LOCAL', 'TERCEIRO', 'TIPO', 'QF', 'PT'];

function cleanText(value) {
  return String(value ?? '').trim();
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value, fallback = 0) {
  return Math.trunc(parseNumber(value, fallback));
}

function emptyToNull(value) {
  const text = cleanText(value);
  return text ? text : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function toISODate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addBusinessDays(date, days) {
  const result = new Date(`${date}T00:00:00`);
  let remaining = Number(days || 0);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result.toISOString().slice(0, 10);
}

function mondayOfWeek(date) {
  const result = new Date(`${date}T00:00:00`);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

export function calculateEntryDate(formalizationDate, options = {}) {
  const date = toISODate(formalizationDate);
  if (!date) return null;

  if (options.dias_uteis) {
    return addBusinessDays(date, Number(options.dias_uteis));
  }

  if (options.semanas) {
    const result = mondayOfWeek(date);
    result.setDate(result.getDate() + Number(options.semanas) * 7);
    return result.toISOString().slice(0, 10);
  }

  if (options.dias_corridos) {
    const result = new Date(`${date}T00:00:00`);
    result.setDate(result.getDate() + Number(options.dias_corridos));
    return result.toISOString().slice(0, 10);
  }

  const result = mondayOfWeek(date);
  result.setDate(result.getDate() + 14);
  return result.toISOString().slice(0, 10);
}

export function calculateForecast({ total_planejado, volume_previsto, produtividade_media, abs_percentual, abs_pessoas }) {
  const total = parseNumber(total_planejado);
  const volume = parseNumber(volume_previsto);
  const produtividade = Math.max(parseNumber(produtividade_media), 0);
  const absPercentual = parseNumber(abs_percentual);
  const absPessoas = abs_pessoas === null || abs_pessoas === undefined || abs_pessoas === ''
    ? total * (absPercentual / 100)
    : parseNumber(abs_pessoas);
  const pessoasDisponiveis = Math.max(total - absPessoas, 0);
  const capacidadePrevista = pessoasDisponiveis * produtividade;
  const necessidadePessoas = produtividade > 0 ? volume / produtividade : 0;
  const gap = pessoasDisponiveis - necessidadePessoas;

  return {
    pessoas_disponiveis: round(pessoasDisponiveis),
    capacidade_prevista: round(capacidadePrevista),
    necessidade_pessoas: round(necessidadePessoas),
    gap: round(gap),
    status_risco: classifyRisk(gap)
  };
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function classifyRisk(gap) {
  if (gap < 0) return 'Risco Alto';
  if (gap === 0) return 'Equilibrado';
  return 'Sobra de Capacidade';
}

function normalizePlanInput(body, userId = null) {
  const qf = parseInteger(body.qf ?? body.QF);
  const pt = parseInteger(body.pt ?? body.PT);
  const dataFormalizacao = toISODate(body.data_formalizacao);
  const dataEntradaPrevista = toISODate(body.data_entrada_prevista)
    || (body.calcular_entrada && dataFormalizacao
      ? calculateEntryDate(dataFormalizacao, {
          dias_uteis: body.dias_uteis_entrada,
          dias_corridos: body.dias_corridos_entrada,
          semanas: body.semanas_entrada
        })
      : null);

  return {
    regional: cleanText(body.regional ?? body.REGIONAL).toUpperCase(),
    id_local: cleanText(body.id_local ?? body.ID_LOCAL).toUpperCase(),
    terceiro: cleanText(body.terceiro ?? body.TERCEIRO),
    tipo: cleanText(body.tipo ?? body.TIPO).toUpperCase(),
    qf,
    pt,
    total_planejado: qf + pt,
    observacao: emptyToNull(body.observacao ?? body.obs ?? body.OBS),
    semana_operacional: emptyToNull(body.semana_operacional),
    mes_referencia: emptyToNull(body.mes_referencia),
    data_formalizacao: dataFormalizacao,
    data_entrada_prevista: dataEntradaPrevista,
    motivo_revisao: emptyToNull(body.motivo_revisao),
    ...(isUuid(userId) ? { user_id: userId } : {})
  };
}

function validatePlan(plan) {
  if (!plan.regional) throw badRequest('Regional e obrigatoria.');
  if (!plan.id_local) throw badRequest('ID Local e obrigatorio.');
  if (!plan.terceiro) throw badRequest('Terceiro e obrigatorio.');
  if (!plan.tipo) throw badRequest('Tipo e obrigatorio.');
  if (plan.qf < 0 || plan.pt < 0) throw badRequest('QF e PT nao podem ser negativos.');
}

function parseRowsFromText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((item) => cleanText(item).toUpperCase());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] ?? '' }), {});
  });
}

function normalizeImportedRows({ rows, texto, csv }) {
  const rawRows = Array.isArray(rows) && rows.length ? rows : parseRowsFromText(texto || csv);
  if (!rawRows.length) throw badRequest('Nenhuma linha encontrada para importar.');

  const headers = Object.keys(rawRows[0]).map((key) => key.toUpperCase());
  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw badRequest(`Colunas obrigatorias ausentes: ${missing.join(', ')}.`);

  return rawRows.map((row) => normalizePlanInput(row)).filter((row) => row.regional && row.id_local);
}

function applyFilters(query, filters = {}) {
  if (filters.regional) query = query.eq('regional', filters.regional);
  if (filters.id_local) query = query.eq('id_local', filters.id_local);
  if (filters.tipo) query = query.eq('tipo', filters.tipo);
  if (filters.semana_operacional) query = query.eq('semana_operacional', filters.semana_operacional);
  if (filters.mes_referencia) query = query.eq('mes_referencia', filters.mes_referencia);
  return query;
}

function newestForecasts(previsoes = []) {
  const latest = new Map();
  for (const previsao of previsoes) {
    if (!latest.has(previsao.plano_id)) latest.set(previsao.plano_id, previsao);
  }
  return latest;
}

function sum(items, key) {
  return round(items.reduce((total, item) => total + parseNumber(item?.[key]), 0));
}

export function createForecastService(supabase) {
  async function listPlanos(filters = {}) {
    let query = supabase.from('forecast_planos').select('*').order('created_at', { ascending: false });
    query = applyFilters(query, filters);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getPlano(id) {
    const { data, error } = await supabase
      .from('forecast_planos')
      .select('*, previsoes:forecast_previsoes(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw badRequest('Plano Forecast nao encontrado.');
    return data;
  }

  async function createPlano(body, userId) {
    const plan = normalizePlanInput(body, userId);
    validatePlan(plan);
    const { data, error } = await supabase.from('forecast_planos').insert(plan).select('*').single();
    if (error) throw error;
    return data;
  }

  async function updatePlano(id, body, userId) {
    const current = await getPlano(id);
    const next = normalizePlanInput({ ...current, ...body }, userId);
    validatePlan(next);
    delete next.user_id;

    const tracked = [
      'regional',
      'id_local',
      'terceiro',
      'tipo',
      'qf',
      'pt',
      'total_planejado',
      'observacao',
      'semana_operacional',
      'mes_referencia',
      'data_formalizacao',
      'data_entrada_prevista',
      'motivo_revisao'
    ];
    const changes = tracked
      .filter((field) => String(current[field] ?? '') !== String(next[field] ?? ''))
      .map((field) => ({
        plano_id: id,
        campo_alterado: field,
        valor_anterior: current[field] == null ? null : String(current[field]),
        valor_novo: next[field] == null ? null : String(next[field]),
        motivo: cleanText(body.motivo_revisao || body.motivo) || null,
        ...(isUuid(userId) ? { alterado_por: userId } : {})
      }));

    const { data, error } = await supabase
      .from('forecast_planos')
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    if (changes.length) {
      const { error: historyError } = await supabase.from('forecast_historico').insert(changes);
      if (historyError) throw historyError;
    }

    return { data, changes };
  }

  async function deletePlano(id) {
    const { data, error } = await supabase.from('forecast_planos').delete().eq('id', id).select('id');
    if (error) throw error;
    return data || [];
  }

  async function importPlanos(payload, userId) {
    const rows = normalizeImportedRows(payload).map((row) => ({
      ...row,
      ...(isUuid(userId) ? { user_id: userId } : {})
    }));
    rows.forEach(validatePlan);
    const { data, error } = await supabase.from('forecast_planos').insert(rows).select('*');
    if (error) throw error;
    return data || [];
  }

  async function createPrevisao(body) {
    if (!body.plano_id) throw badRequest('Selecione um plano para calcular a previsao.');
    const plano = await getPlano(body.plano_id);
    const produtividade = parseNumber(body.produtividade_media);
    if (produtividade <= 0) throw badRequest('Produtividade media deve ser maior que zero.');

    const result = calculateForecast({
      total_planejado: plano.total_planejado,
      volume_previsto: body.volume_previsto,
      produtividade_media: produtividade,
      abs_percentual: body.abs_percentual,
      abs_pessoas: body.abs_pessoas
    });

    const insert = {
      plano_id: plano.id,
      volume_previsto: parseNumber(body.volume_previsto),
      produtividade_media: produtividade,
      abs_percentual: parseNumber(body.abs_percentual),
      abs_pessoas: body.abs_pessoas === '' || body.abs_pessoas == null ? null : parseNumber(body.abs_pessoas),
      turnover_percentual: parseNumber(body.turnover_percentual),
      ...result,
      observacao: emptyToNull(body.observacao)
    };

    const { data, error } = await supabase.from('forecast_previsoes').insert(insert).select('*').single();
    if (error) throw error;
    return { plano, previsao: data };
  }

  async function getDashboard(filters = {}) {
    const planos = await listPlanos(filters);
    const planoIds = planos.map((plano) => plano.id);
    let previsoes = [];
    if (planoIds.length) {
      let query = supabase
        .from('forecast_previsoes')
        .select('*, plano:forecast_planos(id_local,regional,tipo,total_planejado,semana_operacional,mes_referencia)')
        .in('plano_id', planoIds)
        .order('created_at', { ascending: false });
      if (filters.status_risco) query = query.eq('status_risco', filters.status_risco);
      const { data, error } = await query;
      if (error) throw error;
      previsoes = data || [];
    }
    const latest = newestForecasts(previsoes);
    const joined = planos.map((plano) => ({ ...plano, previsao: latest.get(plano.id) || null }));
    const filtered = filters.status_risco ? joined.filter((item) => item.previsao?.status_risco === filters.status_risco) : joined;
    const latestPrevisoes = filtered.map((item) => item.previsao).filter(Boolean);
    const totalQf = sum(filtered, 'qf');
    const totalPt = sum(filtered, 'pt');
    const totalPlanejado = sum(filtered, 'total_planejado');
    const gapItems = filtered.map((item) => ({
      id_local: item.id_local,
      regional: item.regional,
      total_planejado: item.total_planejado,
      gap: item.previsao?.gap ?? null,
      capacidade_prevista: item.previsao?.capacidade_prevista ?? 0,
      volume_previsto: item.previsao?.volume_previsto ?? 0,
      status_risco: item.previsao?.status_risco || 'Sem previsao'
    }));
    const negative = gapItems.filter((item) => Number(item.gap) < 0);
    const sortedNegative = [...negative].sort((a, b) => Number(a.gap) - Number(b.gap));
    const sortedCapacity = [...gapItems].sort((a, b) => Number(b.capacidade_prevista) - Number(a.capacidade_prevista));

    return {
      indicadores: {
        total_qf: totalQf,
        total_pt: totalPt,
        total_planejado: totalPlanejado,
        total_pessoas_disponiveis: sum(latestPrevisoes, 'pessoas_disponiveis'),
        capacidade_total_prevista: sum(latestPrevisoes, 'capacidade_prevista'),
        volume_total_previsto: sum(latestPrevisoes, 'volume_previsto'),
        gap_total: sum(latestPrevisoes, 'gap'),
        unidades_em_risco: negative.length,
        unidade_maior_gap_negativo: sortedNegative[0] || null,
        unidade_maior_capacidade: sortedCapacity[0] || null,
        media_abs: latestPrevisoes.length ? round(sum(latestPrevisoes, 'abs_percentual') / latestPrevisoes.length) : 0,
        media_produtividade: latestPrevisoes.length ? round(sum(latestPrevisoes, 'produtividade_media') / latestPrevisoes.length) : 0
      },
      planos: filtered,
      por_unidade: gapItems,
      ranking_risco: sortedNegative.slice(0, 10),
      revisoes_por_semana: aggregateRevisionsByWeek(filtered)
    };
  }

  async function listHistorico(filters = {}) {
    let query = supabase
      .from('forecast_historico')
      .select('*, plano:forecast_planos(id_local,regional,semana_operacional,mes_referencia)')
      .order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).filter((item) => {
      if (filters.id_local && item.plano?.id_local !== filters.id_local) return false;
      if (filters.semana && item.plano?.semana_operacional !== filters.semana) return false;
      if (filters.mes && item.plano?.mes_referencia !== filters.mes) return false;
      return true;
    });
  }

  async function simulate(body) {
    const plano = body.plano_id ? await getPlano(body.plano_id) : { total_planejado: parseNumber(body.total_planejado), id_local: body.id_local || 'Simulado' };
    const baseTotal = parseNumber(plano.total_planejado) + parseNumber(body.pt_adicional_atual);
    const simulatedTotal = baseTotal + parseNumber(body.pt_adicional);
    const current = calculateForecast({
      total_planejado: baseTotal,
      volume_previsto: body.volume_previsto,
      produtividade_media: body.produtividade_media,
      abs_percentual: body.abs_percentual,
      abs_pessoas: body.abs_pessoas
    });
    const simulatedVolume = parseNumber(body.volume_previsto) * (1 + parseNumber(body.volume_variacao_percentual) / 100);
    const simulatedProductivity = parseNumber(body.produtividade_media) * (1 + parseNumber(body.produtividade_variacao_percentual) / 100);
    const simulatedAbs = body.abs_simulado_percentual === '' || body.abs_simulado_percentual == null
      ? parseNumber(body.abs_percentual)
      : parseNumber(body.abs_simulado_percentual);
    const simulated = calculateForecast({
      total_planejado: simulatedTotal,
      volume_previsto: simulatedVolume,
      produtividade_media: simulatedProductivity,
      abs_percentual: simulatedAbs,
      abs_pessoas: null
    });
    const diffCapacity = round(simulated.capacidade_prevista - current.capacidade_prevista);
    const diffGap = round(simulated.gap - current.gap);

    return {
      plano,
      atual: current,
      simulado: simulated,
      diferenca_capacidade: diffCapacity,
      diferenca_gap: diffGap,
      recomendacao: buildRecommendation(plano.id_local, simulated, simulatedAbs)
    };
  }

  return {
    listPlanos,
    getPlano,
    createPlano,
    updatePlano,
    deletePlano,
    importPlanos,
    createPrevisao,
    getDashboard,
    listHistorico,
    simulate
  };
}

function aggregateRevisionsByWeek(planos) {
  const grouped = new Map();
  for (const plano of planos) {
    const key = plano.semana_operacional || 'Sem semana';
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  return [...grouped.entries()].map(([semana, total]) => ({ semana, total }));
}

function buildRecommendation(unit, simulated, absPercent) {
  if (simulated.gap < 0) {
    return `Com ABS de ${absPercent}%, a unidade ${unit} tera reducao de capacidade. Para atender o volume previsto, sera necessario reforcar aproximadamente ${Math.ceil(Math.abs(simulated.gap))} pessoas ou aumentar a produtividade media.`;
  }
  if (simulated.gap === 0) {
    return `A unidade ${unit} fica equilibrada no cenario simulado. Recomenda-se acompanhar ABS e produtividade diariamente para evitar ruptura operacional.`;
  }
  return `A unidade ${unit} apresenta sobra de capacidade no cenario simulado. Avalie realocar parte do quadro ou absorver volume adicional.`;
}
