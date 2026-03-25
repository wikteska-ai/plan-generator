import { Worker } from "bullmq";
import IORedis from "ioredis";
import { generateSchedule } from "./solver.js";

const connection = new IORedis(process.env.REDIS_URL);

new Worker(
  "jobs",
  async job => {
    console.log("🧠 START JOB", job.data.jobId);

    const result = await generateSchedule(job.data.data);

    console.log("✅ DONE JOB", job.data.jobId);

    return result;
  },
  {
    connection
  }
);
