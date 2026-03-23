import fs from "fs";
import { generateSchedule } from "./solver.js";

const jobId = process.argv[2];

if (!jobId) {
  console.error("❌ Brak jobId");
  process.exit(1);
}

console.log("🧠 Worker start:", jobId);

// ===== Wczytaj joby =====
let jobs = {};
try {
  jobs = JSON.parse(fs.readFileSync("jobs.json"));
} catch {
  console.error("❌ Brak jobs.json");
  process.exit(1);
}

const job = jobs[jobId];

if (!job) {
  console.error("❌ Job nie istnieje:", jobId);
  process.exit(1);
}

// 🔥 tylko queued
if (job.status !== "queued") {
  console.log("⏭️ Pomijam job:", jobId);
  process.exit(0);
}

// ===== ustaw processing =====
jobs[jobId].status = "processing";
fs.writeFileSync("jobs.json", JSON.stringify(jobs));

(async () => {
  try {

    const result = await generateSchedule(job.data);

    // ===== zapis DONE =====
    jobs = JSON.parse(fs.readFileSync("jobs.json"));
    jobs[jobId] = {
      status: "done",
      result
    };

    fs.writeFileSync("jobs.json", JSON.stringify(jobs));

    console.log("✅ DONE JOB", jobId);

  } catch (e) {

    console.error("❌ ERROR JOB", jobId, e);

    jobs = JSON.parse(fs.readFileSync("jobs.json"));
    jobs[jobId] = {
      status: "fail"
    };

    fs.writeFileSync("jobs.json", JSON.stringify(jobs));
  }
})();
