import express from "express";
import bodyParser from "body-parser";
import { generateSchedule } from "./solver.js";

const app = express();
app.use(bodyParser.json());

const jobs = {};

// 🎯 START GENEROWANIA
app.post("/generate", (req, res) => {

  const jobId = Date.now().toString();

  jobs[jobId] = {
    status: "processing",
    createdAt: Date.now()
  };

  // 🔥 odpalamy w tle
  setTimeout(async () => {

    try {
      const result = await generateSchedule(req.body);

      jobs[jobId] = {
        status: "done",
        result,
        finishedAt: Date.now()
      };

    } catch (e) {
      jobs[jobId] = {
        status: "error",
        error: e.message
      };
    }

  }, 0);

  res.json({ jobId });
});

// 📡 SPRAWDZANIE STATUSU
app.get("/status/:id", (req, res) => {

  const job = jobs[req.params.id];

  if (!job) {
    return res.json({ status: "not_found" });
  }

  res.json(job);
});

// 🧹 (opcjonalne) czyszczenie starych jobów
setInterval(() => {
  const now = Date.now();

  for (let id in jobs) {
    if (now - jobs[id].createdAt > 1000 * 60 * 10) {
      delete jobs[id]; // usuń po 10 min
    }
  }
}, 60000);

app.listen(3000, () => {
  console.log("🚀 Server działa na porcie 3000");
});
