import http from "http";
import { queue } from "./queue.js";

const PORT = process.env.PORT || 3000;

function randomId() {
  return Math.random().toString(36).substr(2, 9);
}

const server = http.createServer(async (req, res) => {

  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // ===== GENERATE =====
  if (req.url === "/generate" && req.method === "POST") {

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const jobId = randomId();

        console.log("🚀 START JOB", jobId);

        // 🔥 1. ZAPISZ JOB DO REDIS (WAŻNE)
        await queue.add("generate", {
          jobId,
          data
        }, {
          jobId: jobId
        });

        console.log("📦 Job zapisany do Redis");

        // 🔥 2. ODPAL GITHUB WORKFLOW
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const REPO = "wikteska-ai/plan-generator";

        console.log("🚀 WYWOŁUJĘ GITHUB WORKFLOW", jobId);

        const response = await fetch(
          `https://api.github.com/repos/${REPO}/actions/workflows/worker.yml/dispatches`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${GITHUB_TOKEN}`,
              "Accept": "application/vnd.github+json"
            },
            body: JSON.stringify({
              ref: "main",
              inputs: {
                jobId: jobId
              }
            })
          }
        );

        console.log("📡 GITHUB STATUS:", response.status);
        const text = await response.text();
        console.log("📡 GITHUB RESPONSE:", text);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jobId }));

      } catch (err) {
        console.error("❌ GENERATE ERROR:", err);

        res.writeHead(500);
        res.end(JSON.stringify({
          status: "error",
          message: err.message
        }));
      }
    });

    return;
  }

  // ===== STATUS =====
  if (req.url.startsWith("/status/") && req.method === "GET") {

    const jobId = req.url.split("/")[2];

    try {
      const job = await queue.getJob(jobId);

      if (!job) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: "not_found" }));
        return;
      }

      const state = await job.getState();

      if (state === "completed") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "done",
          result: job.returnvalue
        }));
        return;
      }

      if (state === "failed") {
        res.writeHead(200);
        res.end(JSON.stringify({ status: "fail" }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ status: state }));

    } catch (e) {
      console.error("❌ STATUS ERROR:", e);
      res.writeHead(500);
      res.end(JSON.stringify({ status: "error" }));
    }

    return;
  }

  // ===== ROOT =====
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
