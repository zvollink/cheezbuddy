exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set" }),
    };
  }

  const system = `You are a price comparison assistant. Search for current Cheez-It Original crackers prices at major US retailers.
After searching, respond with ONLY a valid raw JSON array — no markdown, no backticks, no explanation.
Each object must have: retailer (string), price (number in USD), size (string, e.g. "9 oz"), pricePerOz (number, calculated), url (string, direct product URL), inStock (boolean).
Find at least 6 retailers. Always include Walmart, Target, Amazon if available. Sort by pricePerOz ascending.`;

  const messages = [
    {
      role: "user",
      content:
        "Find current prices for Cheez-It Original crackers at Walmart, Target, Amazon, Kroger, Safeway, Costco, Sam's Club, and any other major US grocery or retail stores. Return ONLY the JSON array.",
    },
  ];

  try {
    let result = null;

    for (let round = 0; round < 8 && !result; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "web-search-2025-03-05",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Anthropic API returned ${res.status}: ${errBody}`);
      }

      const data = await res.json();

      if (data.stop_reason === "end_turn") {
        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim()
          .replace(/^```[\w]*\s*/m, "")
          .replace(/\s*```$/m, "");
        result = text;
        break;
      }

      if (data.stop_reason === "tool_use") {
        const assistantContent = (data.content || []).filter((b) => b.type !== "tool_result");
        messages.push({ role: "assistant", content: assistantContent });

        const serverToolResults = (data.content || []).filter((b) => b.type === "tool_result");
        const toolUses = (data.content || []).filter((b) => b.type === "tool_use");

        if (serverToolResults.length > 0) {
          messages.push({
            role: "user",
            content: serverToolResults.map((r, idx) => ({
              type: "tool_result",
              tool_use_id: r.tool_use_id || (toolUses[idx] && toolUses[idx].id),
              content:
                typeof r.content === "string" ? r.content : JSON.stringify(r.content),
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

    if (!result) throw new Error("Search completed but no price data was returned");

    const parsed = JSON.parse(result);
    if (!Array.isArray(parsed)) throw new Error("Response was not a JSON array");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(parsed),
    };
  } catch (e) {
    console.error("CheezBuddy search error:", e);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: e.message }),
    };
  }
};
