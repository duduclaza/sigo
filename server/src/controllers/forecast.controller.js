import { createForecastService } from '../services/forecast.service.js';

function pickFilters(query) {
  return {
    regional: query.regional,
    id_local: query.id_local,
    tipo: query.tipo,
    semana_operacional: query.semana_operacional,
    mes_referencia: query.mes_referencia,
    status_risco: query.status_risco
  };
}

export function createForecastController({ supabase }) {
  const service = createForecastService(supabase);

  return {
    async listPlanos(req, res) {
      const data = await service.listPlanos(pickFilters(req.query));
      res.json({ success: true, data });
    },

    async getPlano(req, res) {
      const data = await service.getPlano(req.params.id);
      res.json({ success: true, data });
    },

    async createPlano(req, res) {
      const data = await service.createPlano(req.body, req.user?.id);
      res.status(201).json({ success: true, message: 'Plano Forecast criado com sucesso.', data });
    },

    async updatePlano(req, res) {
      const result = await service.updatePlano(req.params.id, req.body, req.user?.id);
      res.json({
        success: true,
        message: result.changes.length ? 'Plano atualizado e historico registrado.' : 'Plano atualizado sem alteracoes relevantes.',
        data: result.data,
        alteracoes: result.changes.length
      });
    },

    async deletePlano(req, res) {
      const deleted = await service.deletePlano(req.params.id);
      res.json({ success: true, message: `${deleted.length} plano(s) removido(s).` });
    },

    async importar(req, res) {
      const payload = {
        ...req.body,
        texto: req.body?.texto || req.body?.csv || (req.file ? req.file.buffer.toString('utf8') : ''),
        rows: Array.isArray(req.body?.rows) ? req.body.rows : undefined
      };
      const data = await service.importPlanos(payload, req.user?.id);
      res.status(201).json({ success: true, message: `${data.length} plano(s) importado(s).`, data });
    },

    async previsao(req, res) {
      const data = await service.createPrevisao(req.body);
      res.status(201).json({ success: true, message: 'Previsao operacional calculada e salva.', ...data });
    },

    async dashboard(req, res) {
      const data = await service.getDashboard(pickFilters(req.query));
      res.json({ success: true, data });
    },

    async historico(req, res) {
      const data = await service.listHistorico(req.query);
      res.json({ success: true, data });
    },

    async simulador(req, res) {
      const data = await service.simulate(req.body);
      res.json({ success: true, data });
    }
  };
}
