module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

    const { first_name, last_name, email, website } = body;

    if (!website) {
      return res.status(400).json({ message: 'Website is required' });
    }

    if (!process.env.OPENAI_API_KEY || !process.env.FIRECRAWL_API_KEY) {
      return res.status(500).json({
        message: 'Missing API keys'
      });
    }

    // =========================
    // 🔥 FIRECRAWL SCRAPE
    // =========================

    let websiteContent = "";

    try {
      const firecrawlResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: website,
          formats: ["markdown"]  // 🔥 CLEAN OUTPUT
        })
      });

      const firecrawlData = await firecrawlResponse.json();

      websiteContent = firecrawlData?.data?.markdown || "";

      if (!websiteContent) {
        console.warn("Firecrawl returned empty content");
      }

    } catch (err) {
      console.error("Firecrawl failed:", err);
    }

    // =========================
    // 🔥 OPENAI ANALYSIS
    // =========================

    const prompt = `
You are an AI Visibility Strategist trained on the FOUND Framework.

Analyze this business based on the website content below.

WEBSITE URL:
${website}

WEBSITE CONTENT:
${websiteContent}

Return ONLY valid JSON in this structure:

{
  "business_name": "",
  "website": "${website}",
  "overall_score": 0,
  "visibility_interpretation": "",
  "executive_summary": "",
  "found_scores": {
    "foundation": { "score": 0, "reason": "" },
    "optimization": { "score": 0, "reason": "" },
    "utility": { "score": 0, "reason": "" },
    "niche_authority": { "score": 0, "reason": "" },
    "data_driven_improvements": { "score": 0, "reason": "" }
  },
  "biggest_limiting_factor": {
    "category": "",
    "reason": ""
  },
  "top_5_issues": [],
  "top_5_quick_wins": [],
  "what_this_means": ""
}

Rules:
- Be specific to the content provided
- Do NOT guess if content is missing
- Do NOT include anything outside JSON
`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: prompt
      })
    });

    const data = await response.json();

    let rawText = data.output?.[0]?.content?.[0]?.text || "";

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.error("JSON Parse Failed:", rawText);

      parsed = {
        business_name: "Analysis Limited",
        website,
        overall_score: 5,
        visibility_interpretation: "Moderate visibility",
        executive_summary:
          "We were unable to fully analyze the website content.",
        found_scores: {},
        biggest_limiting_factor: {
          category: "Data Access",
          reason: "Website content could not be fully retrieved."
        },
        top_5_issues: [],
        top_5_quick_wins: [],
        what_this_means:
          "Your site may require improved accessibility or content clarity."
      };
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Snapshot API error:', error);

    return res.status(500).json({
      message: error.message || 'Internal server error'
    });
  }
};
