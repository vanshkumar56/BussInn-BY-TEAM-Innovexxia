import { createServerFn } from "@tanstack/react-start";

const UPSRTC_URL = "https://www.onlineupsrtc.co.in/#/home";
const TINYFISH_BASE = "https://agent.tinyfish.ai/v1";
const MAX_WAIT_MS = 60_000;
const POLL_MS = 2500;

const GREETING =
  /^(hi+|hello|hey|namaste|good (morning|afternoon|evening)|thanks|thank you|ok|okay)[\s!.?]*$/i;

const NOT_FOUND_MESSAGE =
  "I couldn't find that on the UPSRTC website. Please check the official site or call UPSRTC customer care.";

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
  return `You are helping a bus passenger using the UPSRTC website (onlineupsrtc.co.in).

Passenger question: "${question}"

Rules:
- Use only text that is actually visible on the site (menus, pages, FAQs, timings, fares, routes).
- Do not guess, infer, or use general knowledge.
- Do not book tickets, pay, log in, submit forms, or enter personal information.
- If the question is not about UPSRTC bus services, reply with exactly: NOT_APPLICABLE
- If you find the answer, reply in 1 to 3 plain sentences and name the page or section where you found it.
- If the answer is not visible on the site, reply with exactly: NOT_FOUND`;
}

export const askUpsrtcAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: { question: string }) => {
    const question = String(input?.question ?? "").trim();
    if (!question) throw new Error("Please enter a question.");
    if (question.length > 500) {
      throw new Error("Please keep your question under 500 characters.");
    }
    return { question };
  })
  .handler(async ({ data }): Promise<{ answer: string }> => {
    // Skip the agent run for greetings and small talk.
    if (GREETING.test(data.question)) {
      return {
        answer:
          "Hello! I can help with UPSRTC bus information, such as routes, timings, and fares. What would you like to know?",
      };
    }

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
      console.error("[TinyFish start]", startedRes.status, body);
      throw new Error(`TinyFish could not start (${startedRes.status}).`);
    }

    const started = (await startedRes.json()) as {
  run_id?: string;
  id?: string;
  run?: { id?: string };
};

const runId = started.run_id ?? started.id ?? started.run?.id;
    if (!runId) {
      console.error("[TinyFish no run id]", JSON.stringify(started).slice(0, 500));
      throw new Error("TinyFish did not return a run ID.");
    }

    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));

      const pollRes = await fetch(`${TINYFISH_BASE}/runs/${runId}`, { headers });
      if (pollRes.status === 429 || pollRes.status >= 500) continue;

      if (!pollRes.ok) {
        throw new Error(`TinyFish status check failed (${pollRes.status}).`);
      }

      const run = (await pollRes.json()) as {
        status?: string;
        result?: unknown;
        error?: unknown;
      };
      const status = String(run.status ?? "").toUpperCase();

      if (status === "COMPLETED") {
        const answer = extractAnswer(run.result).trim();

        if (!answer || /^NOT_FOUND\b/i.test(answer)) return { answer: NOT_FOUND_MESSAGE };
        if (/^NOT_APPLICABLE\b/i.test(answer)) {
          return {
            answer:
              "I can only help with UPSRTC bus information, such as routes, timings, and fares.",
          };
        }
        return { answer };
      }

      if (status === "FAILED" || status === "CANCELLED") {
        console.error("[TinyFish run failed]", JSON.stringify(run.error ?? run).slice(0, 500));
        throw new Error("The UPSRTC lookup did not complete. Please try again.");
      }
    }

    await fetch(`${TINYFISH_BASE}/runs/${runId}/cancel`, {
      method: "POST",
      headers,
    }).catch(() => undefined);

    throw new Error("The UPSRTC lookup timed out. Please try again.");
  });