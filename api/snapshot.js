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

    const { website } = body;

    if (!website) {
      return res.status(400).json({ message: 'Website is required' });
    }

    // =========================
    // 🔥 FIRECRAWL SCRAPE
    // =========================

    let websiteContent = "";
    let scrapeSuccess = false;

    try {
      const firecrawlResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: website,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 2000
        })
      });

      const firecrawlData = await firecrawlResponse.json();

      websiteContent = (firecrawlData?.data?.markdown || "").slice(0, 12000);

      if (websiteContent && websiteContent.length > 500) {
        scrapeSuccess = true;
      }

    } catch (err) {
      console.error("Firecrawl failed:", err);
    }

    // =========================
    // 🔥 IF SCRAPE FAILED → CONTROLLED FALLBACK
    // =========================

    if (!scrapeSuccess) {
      return res.status(200).json({
        business_name: "Analysis Limited",
        website,
        overall_score: 4,
        visibility_interpretation: "Limited AI visibility",

        executive_summary:
          "We were unable to fully access and analyze your website content. This often happens when websites use security protections, dynamic rendering, or structures that make it difficult for AI systems to retrieve and interpret content.",

        found_scores: {
          foundation: { score: 4, reason: "Limited content accessibility." },
          optimization: { score: 4, reason: "Unable to evaluate structure." },
          utility: { score: 4, reason: "Content could not be fully extracted." },
          niche_authority: { score: 4, reason: "Insufficient visible signals." },
          data_driven_improvements: { score: 3, reason: "No measurable data signals." }
        },

        biggest_limiting_factor: {
          category: "Content Accessibility",
          reason:
            "Your website content could not be reliably accessed or interpreted by AI systems, which may limit your visibility in AI-driven search results."
        },

        top_5_issues: [
          "Website content not easily accessible to AI systems",
          "Potential rendering or security barriers",
          "Limited extractable structured content",
          "Reduced AI interpretability",
          "Low confidence signals for recommendation"
        ],

        top_5_quick_wins: [
          "Ensure core content is server-rendered and accessible",
          "Improve structured, text-based content on key pages",
          "Reduce reliance on heavy JavaScript for critical messaging",
          "Add clear, extractable descriptions of services",
          "Validate accessibility using multiple AI tools"
        ],

        what_this_means:
          "If AI systems cannot reliably access and interpret your content, they are significantly less likely to recommend your business—regardless of how strong your offering actually is."
      });
    }

    // =========================
    // 🔥 OPENAI ANALYSIS
    // =========================

    const prompt = `
You are an AI Visibility Strategist trained on the FOUND Framework.

Analyze this business using the website content below.

WEBSITE:
${website}

CONTENT:
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
- Be specific to the content
- Do NOT guess
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
        business_name: "Analysis Partial",
        website,
        overall_score: 5,
        visibility_interpretation: "Moderate visibility",
        executive_summary:
          "We were able to access your website, but analysis was partially limited.",
        found_scores: {},
        biggest_limiting_factor: {
          category: "Data Interpretation",
          reason: "AI output formatting issue."
        },
        top_5_issues: [],
        top_5_quick_wins: [],
        what_this_means: "Your visibility may be higher with improved clarity and structure."
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
