import { protectedApi } from "./_apiGuard.js";
import { expressionServiceStatus } from './_llm.js';
function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json(expressionServiceStatus());
}

export default protectedApi(handler, { ai: false });
