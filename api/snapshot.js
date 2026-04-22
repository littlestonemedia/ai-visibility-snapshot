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

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ message: 'OPENAI_API_KEY is not configured' });
    }

    if (!process.env.FIRECRAWL_API_KEY) {
      return res.status(500).json({ message: 'FIRECRAWL_API_KEY is not configured' });
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
    // 🔥 MAILERLITE (SAFE ADD)
    // =========================

    async function addToMailerLite() {
      if (!email || !process.env.MAILERLITE_API_KEY || !process.env.MAILERLITE_GROUP_ID) return;

      try {
        await fetch('https://connect.mailerlite.com/api/subscribers', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            fields: {
              name: `${first_name || ""} ${last_name || ""}`.trim(),
              first_name,
              last_name,
              website
            },
            groups: [process.env.MAILERLITE_GROUP_ID],
            status: "active"
          })
        });
      } catch (e) {
        console.error("MailerLite error:", e);
      }
    }

    addToMailerLite();

    // =========================
    // 🔥 FAILURE MODE IF SCRAPE FAILS
    // =========================

    if (!scrapeSuccess) {
      return res.status(200).json({
        first_name: first_name || "",
        business_name: "Limited Access",
        website,
        overall_score: 3,
        visibility_interpretation: "Poor visibility",
        executive_summary:
          "We were not able to reliably access and analyze your website content. This often happens when a website relies heavily on dynamic rendering, scripts, or security layers that make it difficult for AI systems and automated tools to retrieve and interpret content.",
        found_scores: {
          foundation: {
            score: 3,
            reason: "Analysis unavailable due to limited content accessibility."
          },
          optimization: {
            score: 3,
            reason: "Analysis unavailable due to limited content accessibility."
          },
          utility: {
            score: 3,
            reason: "Analysis unavailable due to limited content accessibility."
          },
          niche_authority: {
            score: 3,
            reason: "Analysis unavailable due to limited content accessibility."
          },
          data_driven_improvements: {
            score: 2,
            reason: "Analysis unavailable due to limited content accessibility."
          }
        },
        biggest_limiting_factor: {
          category: "Content Accessibility",
          reason:
            "Your website content could not be reliably accessed or interpreted by automated systems, which may also limit how easily AI systems can understand and recommend your business."
        },
        top_5_issues: [
          "Website content not easily accessible to AI systems",
          "Possible rendering or security barriers",
          "Limited extractable structured content",
          "Reduced machine readability",
          "Weak confidence signals for AI recommendation"
        ],
        top_5_quick_wins: [
          "Ensure core messaging is visible in plain text on key pages",
          "Reduce reliance on heavy JavaScript for critical content",
          "Add clear, extractable descriptions of your services",
          "Improve structured content on homepage and core pages",
          "Validate visibility using multiple AI tools and crawlers"
        ],
        what_this_means:
          "If AI systems cannot reliably access and interpret your content, they are significantly less likely to understand, trust, and recommend your business. This is a strong signal that improving accessibility and clarity could significantly increase your AI visibility."
      });
    }

    // =========================
    // 🔥 OPENAI ANALYSIS
    // =========================

    const prompt = `
You are an AI Visibility Strategist trained on the FOUND Framework.

Analyze the business using the website content below.

WEBSITE URL:
${website}

WEBSITE CONTENT:
${websiteContent}

Score the business using the FOUND Framework:
- Foundation
- Optimization
- Utility
- Niche Authority
- Data-Driven Improvements

Scoring guidance:
1-2 = Very weak
3-4 = Weak
5-6 = Moderate
7-8 = Strong
9-10 = Excellent

Overall score:
- Average the 5 FOUND scores
- Round to nearest whole number

Visibility interpretation:
1-2 = Invisible to AI
3-4 = Poor visibility
5-6 = Moderate visibility
7-8 = Strong visibility
9-10 = Highly recommendable

Return ONLY valid JSON.
Do not use markdown.
Do not add explanations outside the JSON.

Use this exact structure:

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

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return res.status(500).json({
        message: data?.error?.message || 'OpenAI request failed'
      });
    }

    let rawText =
      data.output?.[0]?.content?.[0]?.text ||
      data.output_text ||
      "";

    let parsed;

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch (err) {
      console.error("JSON parse failed:", rawText);

      return res.status(200).json({
        first_name: first_name || "",
        business_name: "Analysis Partial",
        website,
        overall_score: 5,
        visibility_interpretation: "Moderate visibility",
        executive_summary:
          "We were able to access your website content, but encountered a formatting issue while generating the full analysis.",
        found_scores: {
          foundation: {
            score: 5,
            reason: "Analysis unavailable due to formatting issue."
          },
          optimization: {
            score: 5,
            reason: "Analysis unavailable due to formatting issue."
          },
          utility: {
            score: 5,
            reason: "Analysis unavailable due to formatting issue."
          },
          niche_authority: {
            score: 5,
            reason: "Analysis unavailable due to formatting issue."
          },
          data_driven_improvements: {
            score: 5,
            reason: "Analysis unavailable due to formatting issue."
          }
        },
        biggest_limiting_factor: {
          category: "AI Formatting",
          reason:
            "The website content was retrieved, but the analysis could not be fully structured due to a response formatting issue."
        },
        top_5_issues: [
          "Analysis output formatting issue",
          "Incomplete structured response",
          "Limited visibility insight extraction",
          "Reduced confidence in final scoring detail",
          "Need for a deeper manual review"
        ],
        top_5_quick_wins: [
          "Run a deeper manual audit of core pages",
          "Prioritize homepage clarity and structure",
          "Strengthen extractable service descriptions",
          "Improve visible trust and authority signals",
          "Use the VIP Audit for a complete strategic review"
        ],
        what_this_means:
          "Your website content was accessible, which is a positive sign. However, this analysis could not be fully completed, so a deeper review is the best next step."
      });
    }

    return res.status(200).json({
      first_name: first_name || "",
      ...parsed
    });

  } catch (error) {
    console.error('Snapshot API error:', error);

    return res.status(500).json({
      message: error.message || 'Internal server error'
    });
  }
};
