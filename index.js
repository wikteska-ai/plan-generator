import http from "http";
import { generateSchedule } from "./solver.js";
import fs from "fs";

const PORT = process.env.PORT || 3000;

let jobs = {}; // pamięć jobów

function randomId() {
  return Math.random().toString(36).substr(2, 9);
}

// ===== SERVER =====
const server = http.createServer(async (req, res) => {

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // ===== START GENEROWANIA =====
  if (req.url === "/generate" && req.method === "POST") {

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);

        const jobId = randomId();

        console.log(`🚀 START JOB ${jobId}`);

        jobs[jobId] = {
          status: "processing",
          progress: { percent: 0, bestPlaced: 0, total: 0, elapsed: 0 }
        };

        // 🔥 ASYNC JOB
        (async () => {
          const start = Date.now();

          try {

            const result = await generateSchedule(data);

            jobs[jobId] = {
              status: "done",
              result,
              progress: {
                percent: 100,
                bestPlaced: result.placed || 0,
                total: result.total || 0,
                elapsed: Math.floor((Date.now() - start) / 1000)
              }
            };

            console.log(`✅ DONE JOB ${jobId}`);

          } catch (e) {
            console.error(`❌ JOB ERROR ${jobId}`, e);

            jobs[jobId] = { status: "fail" };
          }

        })();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jobId }));

      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ status: "error" }));
      }
    });

    return;
  }

  // ===== STATUS =====
  if (req.url.startsWith("/status/") && req.method === "GET") {

    const jobId = req.url.split("/")[2];

    if (!jobs[jobId]) {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "not_found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jobs[jobId]));
    return;
  }

  // ===== KEEP ALIVE =====
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`🟢 Server działa na porcie ${PORT}`);
});
