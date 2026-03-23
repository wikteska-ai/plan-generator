import fs from "fs";
import { generateSchedule } from "./solver.js";

const jobId = process.argv[2];

if (!jobId) {
  console.error("❌ Brak jobId");
  process.exit(1);
}

console.log("🧠 Worker start dla:", jobId);

// wczytaj joby
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

(async () => {
  try {

    const result = await generateSchedule(job.data);

    jobs[jobId] = {
      status: "done",
      result
    };

    fs.writeFileSync("jobs.json", JSON.stringify(jobs));

    console.log("✅ DONE JOB", jobId);

  } catch (e) {

    console.error("❌ ERROR JOB", jobId, e);

    jobs[jobId] = {
      status: "fail"
    };

    fs.writeFileSync("jobs.json", JSON.stringify(jobs));
  }
})();
