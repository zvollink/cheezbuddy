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

  function getText(content) {
    return (content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  async function callClaude(body) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Anthropic API returned ${r.status}: ${err}`);
    }
    return r.json();
  }

  try {
    // Phase 1: Research — let Claude search and summarize freely in plain text
    const messages = [
      {
        role: "user",
        content:
          "Search for the current retail prices of Cheez-It Original crackers at major US stores including Walmart, Target, Amazon, Kroger, Safeway, Costco, and Sam's Club. For each one, note the retailer name, the price, the package size in ounces, and the direct product URL.",
      },
    ];

    let researchText = "";

    for (let round = 0; round < 8; round++) {
      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      });

      // Only include non-tool_result blocks in the assistant turn
      const assistantContent = data.content.filter((b) => b.type !== "tool_result");
      if (assistantContent.length > 0) {
        messages.push({ role: "assistant", content: assistantContent });
      }

      if (data.stop_reason === "end_turn") {
        researchText = getText(data.content);
        break;
      }

      if (data.stop_reason === "tool_use") {
        const toolUses = data.content.filter((b) => b.type === "tool_use");
        const serverResults = data.content.filter((b) => b.type === "tool_result");

        const toolResultMsg = serverResults.length > 0
          ? serverResults.map((r, i) => ({
              type: "tool_result",
              tool_use_id: r.tool_use_id || (toolUses[i] && toolUses[i].id),
              content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
            }))
          : toolUses.map((t) => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: "Search complete.",
            }));

        messages.push({ role: "user", content: toolResultMsg });
      }
    }

    if (!researchText) throw new Error("Research phase returned no results");

    // Phase 2: Format — fresh conversation, no tools, no tool history
    // Claude's only job is to reformat the research text as a JSON array
    const formatData = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Here is research about current Cheez-It Original cracker prices:\n\n${researchText}\n\nConvert this into a JSON array and output nothing else — no explanation, no markdown, no backticks. Each object: {"retailer": string, "price": number, "size": string, "pricePerOz": number, "url": string, "inStock": boolean}. Calculate pricePerOz by dividing price by the number of ounces. Sort by pricePerOz ascending.`,
        },
      ],
    });

    const raw = getText(formatData.content);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Model did not return a JSON array");

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
