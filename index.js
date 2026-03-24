import http from "http";
import fs from "fs";
import { spawn } from "child_process";

const PORT = process.env.PORT || 3000;

// ===== ID =====
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

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const jobId = randomId();

        console.log(`🚀 START JOB ${jobId}`);

        // ===== wczytaj joby =====
        let jobsData = {};
        try {
const raw = fs.readFileSync("jobs.json", "utf-8");
jobsData = raw ? JSON.parse(raw) : {};
        } catch {}

        // ===== zapisz job =====
        jobsData[jobId] = {
          status: "queued",
          data
        };

        fs.writeFileSync("jobs.json", JSON.stringify(jobsData));

        // ===== START WORKERA =====
    setTimeout(() => {
  spawn("node", ["worker_run.js", jobId], {
    stdio: "inherit"
  });
}, 100);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jobId }));

      } catch (err) {
        console.error("❌ ERROR /generate", err);
        res.writeHead(500);
        res.end(JSON.stringify({ status: "error" }));
      }
    });

    return;
  }

  // ===== STATUS =====
  if (req.url.startsWith("/status/") && req.method === "GET") {

    const jobId = req.url.split("/")[2];

    let jobsData = {};

    try {
const raw = fs.readFileSync("jobs.json", "utf-8");
jobsData = raw ? JSON.parse(raw) : {};
    } catch {}

    if (!jobsData[jobId]) {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "not_found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jobsData[jobId]));
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
// 🔥 AUTO-RESUME PO RESTARCIE
setTimeout(() => {

  let jobsData = {};

  try {
const raw = fs.readFileSync("jobs.json", "utf-8");
jobsData = raw ? JSON.parse(raw) : {};
  } catch {}

  for (let jobId in jobsData) {

    const job = jobsData[jobId];

    if (job.status === "queued" || job.status === "processing") {

      console.log("🔁 WZNOWIENIE JOB:", jobId);

      spawn("node", ["worker_run.js", jobId], {
        stdio: "inherit"
      });
    }
  }

}, 2000);
