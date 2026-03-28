import IORedis from "ioredis";

import { generateSchedule } from "./solver.js";
import { Queue } from "bullmq";

console.log("🚀 WORKER START");

// 📦 pobieramy jobId z argumentu (GitHub go przekazuje)
const jobId = process.argv[2];

console.log("🆔 JOB ID:", jobId);

// 🔌 połączenie z Redis
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

// 🔑 klucz joba w BullMQ
const jobKey = `bull:jobs:${jobId}`;

(async () => {
  try {
    console.log("📥 Pobieram job z Redis...");

    // pobierz dane joba
    const dataRaw = await connection.hget(jobKey, "data");

    if (!dataRaw) {
      console.log("❌ Job nie znaleziony!");
      process.exit(1);
    }

    const parsed = JSON.parse(dataRaw);

    console.log("🧠 START JOB", jobId);

    // 🔥 uruchom solver
    const result = await generateSchedule(parsed.data);

    console.log("✅ DONE JOB", jobId);

    // 💾 zapisz wynik


const queue = new Queue("jobs", {
  connection
});

// pobierz job
const job = await queue.getJob(jobId);

if (!job) {
  console.log("❌ Job nie istnieje w BullMQ");
  process.exit(1);
}

// 🔥 KLUCZOWE
await job.updateProgress(100);
await job.moveToCompleted(result, true);

console.log("✅ JOB OZNACZONY JAKO COMPLETED");

    process.exit(0);

  } catch (e) {
    console.error("❌ ERROR:", e);
    process.exit(1);
  }
})();
