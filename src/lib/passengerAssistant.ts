import { createServerFn } from "@tanstack/react-start";

const UPSRTC_URL = "https://www.onlineupsrtc.co.in/#/home";
const TINYFISH_BASE = "https://agent.tinyfish.ai/v1";
const MAX_WAIT_MS = 150_000;
const POLL_MS = 3000;

type TinyFishStartResponse = {
  run_id?: string;
  id?: string;
  run?: { id?: string };
};

type TinyFishRun = {
  status?: string;
  result?: unknown;
  error?: unknown;
};

function extractAnswer(value: unknown): string {
  if (typeof value === "string") {
    const text = value.trim();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return extractAnswer(parsed);
      return text;
    } catch {
      return text.replace(/\\n/g, "\n").trim();
    }
  }

  if (value && typeof value === "object") {
    const result = value as Record<string, unknown>;
    for (const key of ["answer", "result", "message", "content", "output", "text"]) {
      if (result[key] != null) {
        const answer = extractAnswer(result[key]);
        if (answer) return answer;
      }
    }
  }

  return "";
}

function buildGoal(question: string) {
  return `A bus passenger has sent this message to the UPSRTC assistant:
"${question}"

Respond to the passenger using the UPSRTC website (onlineupsrtc.co.in).
- Use information you can see on the site to answer. Do not use general knowledge.
- If the site does not contain the answer, say so plainly and suggest the passenger contact UPSRTC customer care.
- Do not book tickets, make payments, log in, submit forms, or enter personal information.
- Keep the reply short and in plain language.`;
}

export const askUpsrtcAssistant = createServerFn({ method: "POST" })
  .validator((input: { question: string }) => {
    const question = String(input?.question ?? "").trim();
    if (!question) throw new Error("Please enter a message.");
    if (question.length > 500) {
      throw new Error("Please keep your message under 500 characters.");
    }
    return { question };
  })
  .handler(async ({ data }): Promise<{ answer: string }> => {
    const apiKey = process.env["TINYFISH_API_KEY"];
    if (!apiKey) throw new Error("The server is missing TINYFISH_API_KEY.");

    const headers = {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const startedRes = await fetch(`${TINYFISH_BASE}/automation/run-async`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: UPSRTC_URL,
        browser_profile: "lite",
        goal: buildGoal(data.question),
      }),
    });

    if (!startedRes.ok) {
      const body = (await startedRes.text().catch(() => "")).slice(0, 300);
      console.error("[TinyFish start FAILED]", startedRes.status, body);
      throw new Error(`TinyFish could not start (${startedRes.status}).`);
    }

    const started = (await startedRes.json()) as TinyFishStartResponse;
    console.log("[TinyFish start OK]", JSON.stringify(started));

    const runId = started.run_id ?? started.id ?? started.run?.id;

    if (!runId) {
      console.error("[TinyFish no run id]", JSON.stringify(started).slice(0, 500));
      throw new Error("TinyFish did not return a run ID.");
    }

    console.log("[TinyFish run id]", runId);

    const deadline = Date.now() + MAX_WAIT_MS;
    let pollCount = 0;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      pollCount++;

      const pollRes = await fetch(`${TINYFISH_BASE}/runs/${runId}`, { headers });

      if (pollRes.status === 429 || pollRes.status >= 500) {
        console.warn(`[TinyFish poll #${pollCount}] retrying after ${pollRes.status}`);
        continue;
      }

      if (!pollRes.ok) {
        const body = (await pollRes.text().catch(() => "")).slice(0, 300);
        console.error(`[TinyFish poll #${pollCount} FAILED]`, pollRes.status, body);
        throw new Error(`TinyFish status check failed (${pollRes.status}).`);
      }

      const run = (await pollRes.json()) as TinyFishRun;
      const status = String(run.status ?? "").toUpperCase();
      console.log(`[TinyFish poll #${pollCount}] status=${status}`);

      if (status === "COMPLETED") {
        const answer = extractAnswer(run.result).trim();
        console.log("[TinyFish result]", JSON.stringify(run.result).slice(0, 500));
        return {
          answer:
            answer || "I couldn't get an answer from the UPSRTC site. Please try rephrasing.",
        };
      }

      if (status === "FAILED" || status === "CANCELLED") {
        console.error("[TinyFish run failed]", JSON.stringify(run.error ?? run).slice(0, 500));
        throw new Error("The UPSRTC lookup did not complete. Please try again.");
      }
    }

    console.error(`[TinyFish TIMEOUT] after ${pollCount} polls, run id ${runId}`);

    await fetch(`${TINYFISH_BASE}/runs/${runId}/cancel`, {
      method: "POST",
      headers,
    }).catch(() => undefined);

    throw new Error("The UPSRTC lookup timed out. Please try again.");
  });