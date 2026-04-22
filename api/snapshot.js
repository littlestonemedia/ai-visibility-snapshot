module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      return res.status(400).json({
        message: 'Website is required'
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        message: 'OPENAI_API_KEY is not configured'
      });
    }

    // =========================
    // 🔥 OPENAI CALL
    // =========================

    const prompt = `
You are an AI Visibility Strategist trained on the FOUND Framework.

Analyze this website: ${website}

Return ONLY valid JSON in this exact structure:

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
  "what_this_means": "",
  "whats_next": {
    "recommended_primary_offer": "",
    "recommended_secondary_offer": "",
    "book": {
      "name": "AI SEO 2026 Book",
      "description": "The best starting point for understanding AI visibility."
    },
    "checklist": {
      "name": "Master Visibility Plan Checklist",
      "description": "A practical DIY framework."
    },
    "vip_audit": {
      "name": "Visibility Index Profile (VIP) Audit",
      "description": "A full personalized audit."
    },
    "recommendation_summary": ""
  },
  "closing": ""
}

Rules:
- Be concise
- Be specific
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

    if (!response.ok) {
      return res.status(500).json({
        message: data?.error?.message || 'OpenAI request failed'
      });
    }

    // =========================
    // 🔥 SAFELY EXTRACT TEXT
    // =========================

    let rawText = "";

    try {
      rawText =
        data.output?.[0]?.content?.[0]?.text ||
        data.output_text ||
        "";
    } catch (e) {
      console.error("Error extracting OpenAI response:", data);
    }

    // =========================
    // 🔥 PARSE OR FALLBACK
    // =========================

    let parsed;

    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.error("JSON Parse Failed:", rawText);

      // ✅ FALLBACK (NEVER BREAK UX)
      parsed = {
        business_name: "Analysis Incomplete",
        website,
        overall_score: 5,
        visibility_interpretation: "Moderate visibility",
        executive_summary:
          "We encountered a formatting issue during analysis, but early signals suggest moderate AI visibility with opportunities to improve clarity and authority.",

        found_scores: {
          foundation: { score: 5, reason: "Could not fully analyze." },
          optimization: { score: 5, reason: "Could not fully analyze." },
          utility: { score: 5, reason: "Could not fully analyze." },
          niche_authority: { score: 5, reason: "Could not fully analyze." },
          data_driven_improvements: { score: 5, reason: "Could not fully analyze." }
        },

        biggest_limiting_factor: {
          category: "AI Interpretation",
          reason: "The system could not fully process the response."
        },

        top_5_issues: [
          "AI response formatting issue",
          "Unclear messaging",
          "Weak content structure",
          "Limited authority signals",
          "Inconsistent positioning"
        ],

        top_5_quick_wins: [
          "Retry the analysis",
          "Clarify homepage messaging",
          "Add structured content",
          "Strengthen authority signals",
          "Align messaging across pages"
        ],

        what_this_means:
          "Your business likely has visibility potential, but clarity and structural issues may be limiting AI recommendations.",

        whats_next: {
          recommended_primary_offer: "VIP Audit",
          recommended_secondary_offer: "AI SEO 2026 Book",

          book: {
            name: "AI SEO 2026 Book",
            description: "Learn how AI visibility actually works."
          },

          checklist: {
            name: "Master Visibility Plan Checklist",
            description: "A step-by-step DIY framework."
          },

          vip_audit: {
            name: "Visibility Index Profile (VIP) Audit",
            description: "A full strategic breakdown."
          },

          recommendation_summary:
            "We recommend a deeper audit to identify and fix structural visibility issues."
        },

        closing: "Try again or upgrade for a full analysis."
      };
    }

    // =========================
    // 🔥 MAILERLITE
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
    // 🔥 RETURN RESULT
    // =========================

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Snapshot API error:', error);

    return res.status(500).json({
      message: error.message || 'Internal server error'
    });
  }
};
