import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { generateSchedule } from "./solver.js";

const app = express();

// 🔥 CORS (naprawia "Failed to fetch")
app.use(cors());

// JSON
app.use(bodyParser.json());

// 🔥 pamięć jobów
const jobs = {};

// 🎯 START GENEROWANIA
app.post("/generate", (req, res) => {

  const jobId = Date.now().toString();

  jobs[jobId] = {
    status: "processing",
    createdAt: Date.now()
  };

  // 🔥 uruchom w tle
  setTimeout(async () => {
    try {
      const result = await generateSchedule(req.body);
      console.log("🎉 KONIEC GENEROWANIA");

jobs[jobId] = {
  status: result.status === "OK" ? "done" : "fail",
  result,
  finishedAt: Date.now()
};

      console.log("✅ DONE:", jobId);

    } catch (e) {
      console.error("❌ ERROR:", e);

      jobs[jobId] = {
        status: "error",
        error: e.message
      };
    }
  }, 0);

  res.json({ jobId });
});

// 📡 STATUS
app.get("/status/:id", (req, res) => {

  const job = jobs[req.params.id];

  if (!job) {
    return res.json({ status: "not_found" });
  }

  res.json(job);
});

// 🧹 czyszczenie starych jobów (co 1 min)
setInterval(() => {
  const now = Date.now();

  for (let id in jobs) {
    if (now - jobs[id].createdAt > 1000 * 60 * 10) {
      delete jobs[id];
    }
  }
}, 60000);

// 🔥 PORT (WAŻNE NA RENDER)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server działa na porcie " + PORT);
});
