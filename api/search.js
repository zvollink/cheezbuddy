const https = require("https");

// Known Cheez-It Original product pages at major retailers
const RETAILERS = [
  {
    name: "Walmart",
    url: "https://www.walmart.com/ip/Cheez-It-Baked-Snack-Cheese-Crackers-Original-21-oz/44029940",
    size: "21 oz",
    extractPrice: (html) => {
      const m = html.match(/"price"\s*:\s*"?([\d.]+)"?/);
      return m ? parseFloat(m[1]) : null;
    },
  },
  {
    name: "Target",
    url: "https://www.target.com/p/cheez-it-original-baked-snack-crackers/-/A-13560795",
    size: "21 oz",
    extractPrice: (html) => {
      const m = html.match(/"price"\s*:\s*([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    },
  },
  {
    name: "Amazon",
    url: "https://www.amazon.com/Cheez-It-Cheese-Crackers-Original-Ounce/dp/B0002DKOPA",
    size: "21 oz",
    extractPrice: (html) => {
      const m = html.match(/class="a-price-whole"[^>]*>([\d,]+)</)
        || html.match(/"priceAmount"\s*:\s*([\d.]+)/);
      return m ? parseFloat(m[1].replace(",", "")) : null;
    },
  },
  {
    name: "Kroger",
    url: "https://www.kroger.com/p/cheez-it-original-baked-snack-crackers/0002410030129",
    size: "12.4 oz",
    extractPrice: (html) => {
      const m = html.match(/"price"\s*:\s*([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    },
  },
  {
    name: "Instacart (Costco)",
    url: "https://www.instacart.com/products/22916491-cheez-it-original-crackers",
    size: "48 oz",
    extractPrice: (html) => {
      const m = html.match(/"\$?([\d.]+)"\s*(?:each|\/ea)/i)
        || html.match(/"price"\s*:\s*"?\$?([\d.]+)"?/);
      return m ? parseFloat(m[1]) : null;
    },
  },
];

function fetchPage(url) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 8000,
    };

    const req = https.get(url, options, (res) => {
      // Follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve);
      }
      let html = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { html += chunk; });
      res.on("end", () => resolve(html));
    });

    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const results = await Promise.all(
      RETAILERS.map(async (retailer) => {
        try {
          const html = await fetchPage(retailer.url);
          const price = html ? retailer.extractPrice(html) : null;
          const oz = parseFloat(retailer.size);
          return {
            retailer: retailer.name,
            price: price,
            size: retailer.size,
            pricePerOz: price && oz ? parseFloat((price / oz).toFixed(3)) : null,
            url: retailer.url,
            inStock: price !== null,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = results.filter((r) => r && r.price !== null);

    if (valid.length === 0) {
      return res.status(500).json({
        error: "Couldn't fetch prices right now — retailers may be blocking the request. Try again in a moment.",
      });
    }

    valid.sort((a, b) => (a.pricePerOz || 999) - (b.pricePerOz || 999));
    return res.status(200).json(valid);
  } catch (e) {
    console.error("CheezBuddy error:", e);
    return res.status(500).json({ error: e.message });
  }
};
