import 'dotenv/config';
import app from './app.js';

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em server/.env antes de usar a API.');
  }
  console.log(`SIGO API em http://localhost:${PORT}`);
});
