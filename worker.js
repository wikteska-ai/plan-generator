import IORedis from "ioredis";
import { generateSchedule } from "./solver.js";

console.log("🚀 WORKER START");

const jobId = process.argv[2];
console.log("🆔 JOB ID:", jobId);

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const jobKey = `bull:jobs:${jobId}`;

(async () => {
  try {
    console.log("📥 Pobieram job z Redis...");

    const dataRaw = await connection.hget(jobKey, "data");

    if (!dataRaw) {
      console.log("❌ Job nie znaleziony!");
      process.exit(1);
    }

    const parsed = JSON.parse(dataRaw);

    console.log("🧠 START JOB", jobId);

    const result = await generateSchedule(parsed.data);

    console.log("✅ DONE JOB", jobId);

    // 🔥 ZAPIS WYNIKU (TO JEST KLUCZ)
    await connection.hset(jobKey, "returnvalue", JSON.stringify(result));
    await connection.hset(jobKey, "finishedOn", Date.now());

    console.log("✅ ZAPISANO WYNIK DO REDIS");

    process.exit(0);

  } catch (e) {
    console.error("❌ ERROR:", e);
    process.exit(1);
  }
})();
