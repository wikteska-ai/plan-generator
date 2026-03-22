import express from 'express';
import { generateSchedule } from './solver.js';

const app = express();
app.use(express.json());

// endpoint do generowania planu
app.post('/generate', async (req, res) => {
  try {
    const result = await generateSchedule(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// test czy działa
app.get('/', (req, res) => {
  res.send('API działa 🚀');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server działa na porcie ${PORT}`);
});