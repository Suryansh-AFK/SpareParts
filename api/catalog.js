import { catalog } from '../lib/handlers.js';
import { vercelHandler } from '../lib/vercel-adapter.js';

export default vercelHandler(catalog);
