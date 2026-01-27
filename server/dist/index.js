import cors from 'cors';
import express from 'express';
import { router } from './routes.js';
const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({
    origin: true
}));
app.use('/api', router);
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${PORT}`);
});
