import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL);

export const queue = new Queue("jobs", {
  connection
});
