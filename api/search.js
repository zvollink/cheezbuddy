module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable is not set" });
  }

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "web-search-2025-03-05",
  };

  async function callClaude(body) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Anthropic API returned ${r.status}: ${err}`);
    }
    return r.json();
  }

  function getText(content) {
    return (content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  try {
    // ── Phase 1: Research with web search ──────────────────────────────────
    // Let Claude narrate freely — no JSON pressure, just find the prices.
    const messages = [
      {
        role: "user",
        content:
          "Search for the current retail prices of Cheez-It Original crackers at major US stores: Walmart, Target, Amazon, Kroger, Safeway, Costco, Sam's Club, and any others you find. For each one note the retailer, price, package size in oz, and the product URL.",
      },
    ];

    for (let round = 0; round < 8; round++) {
      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      });

      messages.push({ role: "assistant", content: data.content });

      if (data.stop_reason === "end_turn") break;

      if (data.stop_reason === "tool_use") {
        const toolUses = data.content.filter((b) => b.type === "tool_use");
        const serverResults = data.content.filter((b) => b.type === "tool_result");

        if (serverResults.length > 0) {
          messages.push({
            role: "user",
            content: serverResults.map((r, i) => ({
              type: "tool_result",
              tool_use_id: r.tool_use_id || (toolUses[i] && toolUses[i].id),
              content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
            })),
          });
        } else {
          messages.push({
            role: "user",
            content: toolUses.map((t) => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: "Search complete.",
            })),
          });
        }
      }
    }

    // ── Phase 2: Format as JSON ────────────────────────────────────────────
    // New call, no tools — Claude's only job is to emit a JSON array.
    messages.push({
      role: "user",
      content:
        "Using only the prices you just found above, output a JSON array and nothing else — no explanation, no markdown, no backticks. Each item: { \"retailer\": string, \"price\": number, \"size\": string, \"pricePerOz\": number, \"url\": string, \"inStock\": boolean }. Calculate pricePerOz from the price and size. Sort by pricePerOz ascending.",
    });

    const formatData = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      // No tools — forces a plain text response
      messages,
    });

    const raw = getText(formatData.content);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Could not find a JSON array in the response");

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Response was empty or not a JSON array");
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("CheezBuddy error:", e);
    return res.status(500).json({ error: e.message });
  }
};