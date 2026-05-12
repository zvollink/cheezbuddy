module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable is not set" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Return a JSON array of Cheez-It Original cracker prices at major US retailers based on your training knowledge. Include Walmart, Target, Amazon, Kroger, Costco, Sam's Club, and Meijer. Use realistic current US retail prices. Output ONLY the raw JSON array, nothing else — no markdown, no explanation.

Each object must have exactly these keys:
- retailer: string
- price: number (USD)
- size: string (e.g. "21 oz")
- pricePerOz: number (price divided by oz, rounded to 3 decimals)
- url: string (direct product search URL for that retailer)
- inStock: boolean (true unless you have reason to think otherwise)

Sort by pricePerOz ascending.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API returned ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Model did not return a JSON array");

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Empty response from model");
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("CheezBuddy error:", e);
    return res.status(500).json({ error: e.message });
  }
};
