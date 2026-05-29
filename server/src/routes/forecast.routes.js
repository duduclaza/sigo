import express from 'express';
import multer from 'multer';
import { createForecastController } from '../controllers/forecast.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function createForecastRouter({ requireAuth, supabase }) {
  const router = express.Router();
  const controller = createForecastController({ supabase });

  router.use(requireAuth);

  router.get('/planos', asyncRoute(controller.listPlanos));
  router.get('/planos/:id', asyncRoute(controller.getPlano));
  router.post('/planos', asyncRoute(controller.createPlano));
  router.put('/planos/:id', asyncRoute(controller.updatePlano));
  router.delete('/planos/:id', asyncRoute(controller.deletePlano));
  router.post('/importar', upload.single('arquivo'), asyncRoute(controller.importar));
  router.post('/previsao', asyncRoute(controller.previsao));
  router.get('/dashboard', asyncRoute(controller.dashboard));
  router.get('/historico', asyncRoute(controller.historico));
  router.post('/simulador', asyncRoute(controller.simulador));

  return router;
}
