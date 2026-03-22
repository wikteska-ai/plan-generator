import express from 'express';
import cors from 'cors';
import { generateSchedule } from './solver.js';

const app = express();

app.use(cors());
app.use(express.json());

app.post('/generate', async (req, res) => {
  try {

    console.log("📥 BODY:", req.body);

    if (!req.body || !req.body.lessons) {
      return res.status(400).json({
        error: "Brak lessons w JSON",
        received: req.body
      });
    }

    const result = await generateSchedule(req.body);

    res.json(result);

  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => {
  res.send('API działa 🚀');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server działa na porcie ${PORT}`);
});