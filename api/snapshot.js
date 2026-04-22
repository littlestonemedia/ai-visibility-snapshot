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
      return res.status(500).json({ message: 'Missing API keys' });
    }

    // =========================
    // FIRECRAWL SCRAPE
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
      console.error("Firecrawl error:", err);
    }

    // =========================
    // MAILERLITE
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
    // FAILURE MODE
    // =========================

    if (!scrapeSuccess) {
      return res.status(200).json({
        first_name,
        business_name: "Limited Access",
        website,
        overall_score: 3,
        visibility_interpretation: "Poor visibility",
        primary_visibility_insight:
          "Your website content could not be reliably accessed, making it difficult for AI systems to understand and recommend your business.",
        ai_confidence_level: "Low",
        executive_summary:
          "AI systems are not able to clearly access your website content. This makes it difficult for them to understand your business. As a result, your likelihood of being recommended is low.",
        found_scores: {
          foundation: { score: 3, reason: "Content could not be accessed clearly." },
          optimization: { score: 3, reason: "Structure could not be evaluated." },
          utility: { score: 3, reason: "Content could not be analyzed." },
          niche_authority: { score: 3, reason: "Authority signals not visible." },
          data_driven_improvements: { score: 2, reason: "No accessible data signals." }
        },
        biggest_limiting_factor: {
          category: "Content Accessibility",
          reason: "AI systems cannot reliably access your content."
        },
        top_5_issues: [
          "Website content is not easily accessible to AI systems",
          "Possible rendering or security limitations",
          "Limited structured text content",
          "Reduced machine readability",
          "Low AI confidence in interpretation"
        ],
        top_5_quick_wins: [
          "Ensure key content is visible as plain text",
          "Reduce reliance on scripts for core messaging",
          "Add clear service descriptions on homepage",
          "Improve structured layout of content",
          "Test accessibility with AI tools"
        ],
        what_this_means:
          "If AI systems cannot access your content, they cannot understand or recommend your business."
      });
    }

    // =========================
    // FINAL PROMPT (FULL VERSION)
    // =========================

    const prompt = `
You are an AI Visibility Strategist.

You are NOT an SEO expert.
You do NOT talk about keywords, rankings, traffic, or SEO tactics.

Your job is to evaluate how well a business can be:
- understood
- interpreted
- trusted
- recommended

by AI systems like ChatGPT, Gemini, and Perplexity.

Use simple, clear, professional language. Avoid jargon.

---

WEBSITE URL:
${website}

WEBSITE CONTENT:
${websiteContent}

---

Evaluate the business using the FOUND Framework:

1. Foundation → Is it clear what the business does?
2. Optimization → Is the content structured so AI can understand it easily?
3. Utility → Does the content clearly answer real customer questions?
4. Niche Authority → Does the business demonstrate clear expertise in a specific area?
5. Data-Driven Improvements → Is there evidence of improvement, testing, or results?

---

CRITICAL RULES:

- Use plain English. Assume the reader is not technical.
- Do NOT mention SEO, keywords, rankings, or traffic.
- Every insight must be based on the actual website content.
- Be specific. Avoid vague statements.
- Focus on clarity and understanding.

---

Return ONLY valid JSON with:

- business_name
- website
- overall_score
- visibility_interpretation
- primary_visibility_insight
- ai_confidence_level
- executive_summary
- found_scores
- biggest_limiting_factor
- top_5_issues
- top_5_quick_wins
- what_this_means
`;

    // =========================
    // OPENAI
    // =========================

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an AI Visibility Strategist." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    let parsed;

    try {
      parsed = JSON.parse(data.choices[0].message.content);
    } catch (err) {
      console.error("Parse error:", data);

      return res.status(200).json({
        first_name,
        business_name: "Analysis Partial",
        website,
        overall_score: 5,
        visibility_interpretation: "Moderate visibility",
        primary_visibility_insight:
          "Your website is partially understandable, but the analysis could not be fully completed.",
        ai_confidence_level: "Medium",
        executive_summary:
          "AI systems can access your content, but full analysis could not be completed. A deeper review is needed.",
        found_scores: {},
        biggest_limiting_factor: {
          category: "Analysis Limitation",
          reason: "Formatting issue during processing."
        },
        top_5_issues: [],
        top_5_quick_wins: [],
        what_this_means:
          "Your site likely has moderate visibility, but further analysis is needed."
      });
    }

    return res.status(200).json({
      first_name,
      ...parsed
    });

  } catch (error) {
    console.error("Snapshot error:", error);

    return res.status(500).json({
      message: error.message || "Internal server error"
    });
  }
};
