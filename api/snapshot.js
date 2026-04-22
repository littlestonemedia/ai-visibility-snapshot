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
    // FIRECRAWL SCRAPE
    // =========================

    let websiteContent = '';
    let scrapeSuccess = false;

    try {
      const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: website,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 2000
        })
      });

      const firecrawlData = await firecrawlResponse.json();
      websiteContent = (firecrawlData?.data?.markdown || '').slice(0, 12000);

      if (websiteContent && websiteContent.length > 500) {
        scrapeSuccess = true;
      } else {
        console.error('Firecrawl returned insufficient content:', firecrawlData);
      }
    } catch (err) {
      console.error('Firecrawl error:', err);
    }

    // =========================
    // MAILERLITE (SAFE ADD)
    // =========================

    async function addToMailerLite() {
      if (!email || !process.env.MAILERLITE_API_KEY || !process.env.MAILERLITE_GROUP_ID) {
        return;
      }

      try {
        await fetch('https://connect.mailerlite.com/api/subscribers', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            fields: {
              name: `${first_name || ''} ${last_name || ''}`.trim(),
              first_name: first_name || '',
              last_name: last_name || '',
              website
            },
            groups: [process.env.MAILERLITE_GROUP_ID],
            status: 'active'
          })
        });
      } catch (e) {
        console.error('MailerLite error:', e);
      }
    }

    addToMailerLite();

    // =========================
    // FAILURE MODE IF SCRAPE FAILS
    // =========================

    if (!scrapeSuccess) {
      return res.status(200).json({
        first_name: first_name || '',
        business_name: 'Limited Access',
        website,
        overall_score: 3,
        visibility_interpretation: 'Poor visibility',
        primary_visibility_insight:
          'Your website content could not be reliably accessed, making it difficult for AI systems to understand and recommend your business.',
        ai_confidence_level: 'Low',
        executive_summary:
          'AI systems were not able to clearly access your website content. This makes it difficult for them to understand what your business offers. As a result, your likelihood of being recommended is low.',
        found_scores: {
          foundation: {
            score: 3,
            reason: 'Your core content could not be reliably accessed, so AI systems may struggle to understand what your business does.'
          },
          optimization: {
            score: 3,
            reason: 'The structure of the site could not be evaluated because the content was not fully accessible.'
          },
          utility: {
            score: 3,
            reason: 'We could not confirm whether your content clearly answers customer questions because it was not fully retrievable.'
          },
          niche_authority: {
            score: 3,
            reason: 'Your expertise signals were not clearly visible to automated systems during analysis.'
          },
          data_driven_improvements: {
            score: 2,
            reason: 'No accessible proof of refinement, testing, or performance signals could be confirmed.'
          }
        },
        biggest_limiting_factor: {
          category: 'Content Accessibility',
          reason:
            'Your website content could not be reliably accessed by automated systems, which may also limit how easily AI systems can understand and recommend your business.'
        },
        top_5_issues: [
          'Your website content is not easily accessible to AI systems.',
          'Important business information may be hidden behind rendering, scripts, or technical barriers.',
          'The site may not expose enough plain-text content for machine interpretation.',
          'AI systems may have low confidence in understanding your business correctly.',
          'Reduced accessibility can lower the likelihood of being recommended in AI-generated answers.'
        ],
        top_5_quick_wins: [
          'Make sure your homepage clearly explains what your business does in plain text.',
          'Reduce reliance on scripts for core service descriptions and key messaging.',
          'Add a simple text-based summary of your main services near the top of the homepage.',
          'Use clear headings and short explanations on your key pages.',
          'Test important pages with multiple AI tools to confirm they can access and interpret the content.'
        ],
        what_this_means:
          'If AI systems cannot reliably access your content, they cannot confidently understand or recommend your business. Improving accessibility and clarity is one of the fastest ways to improve your AI visibility.'
      });
    }

    // =========================
    // FINAL PROMPT
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

WEBSITE URL:
${website}

WEBSITE CONTENT:
${websiteContent}

Evaluate the business using the FOUND Framework:

1. Foundation → Is it clear what the business does?
2. Optimization → Is the content structured so AI can understand it easily?
3. Utility → Does the content clearly answer real customer questions?
4. Niche Authority → Does the business demonstrate clear expertise in a specific area?
5. Data-Driven Improvements → Is there evidence of improvement, testing, or results?

CRITICAL RULES:

- Use plain English. Assume the reader is not technical.
- Do NOT mention SEO, keywords, rankings, traffic, metadata, or backlinks.
- Every insight must be based on the actual website content.
- Be specific. Avoid vague statements like "strong content" or "good structure."
- Focus on clarity, consistency, trust, and how easy the business is to understand.
- Explain WHY each issue matters.
- Do not leave any section blank.
- Keep every section concise but useful.
- If something is missing, say so clearly and score accordingly.

SCORING RULES:

1–2 = Very unclear
3–4 = Hard to understand
5–6 = Moderately clear
7–8 = Easy to understand
9–10 = Extremely clear and easy to recommend

OVERALL SCORE:
Average the 5 FOUND scores and round to the nearest whole number.

VISIBILITY INTERPRETATION:
1–2 = Invisible to AI
3–4 = Poor visibility
5–6 = Moderate visibility
7–8 = Strong visibility
9–10 = Highly recommendable

PRIMARY VISIBILITY INSIGHT:
Give one sharp sentence that explains the single most important reason the business is or is not easy for AI systems to understand and recommend.

AI CONFIDENCE LEVEL:
Choose one: Low, Medium, High

EXECUTIVE SUMMARY:
Write a maximum of 3 sentences:
1. What AI understands
2. What AI struggles with
3. What that means

BIGGEST LIMITING FACTOR:
Use a clear, non-technical label such as:
- Clarity of Your Core Service
- Inconsistent Messaging
- Lack of Clear Explanations
- Weak Trust Signals
- Limited Proof of Results

TOP 5 ISSUES:
Each issue must describe a specific problem and explain why it makes the business harder for AI systems to understand or recommend.

TOP 5 QUICK WINS:
Each quick win must be practical, simple, and doable within about 30–90 minutes.

WHAT THIS MEANS:
Explain how the issues affect the business’s likelihood of being understood, trusted, and recommended by AI systems.

Return the result strictly in the required JSON schema.
`;

    // =========================
    // OPENAI STRUCTURED OUTPUTS
    // =========================

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an AI Visibility Strategist.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ai_visibility_snapshot',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                business_name: { type: 'string' },
                website: { type: 'string' },
                overall_score: { type: 'number' },
                visibility_interpretation: { type: 'string' },
                primary_visibility_insight: { type: 'string' },
                ai_confidence_level: {
                  type: 'string',
                  enum: ['Low', 'Medium', 'High']
                },
                executive_summary: { type: 'string' },
                found_scores: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    foundation: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        score: { type: 'number' },
                        reason: { type: 'string' }
                      },
                      required: ['score', 'reason']
                    },
                    optimization: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        score: { type: 'number' },
                        reason: { type: 'string' }
                      },
                      required: ['score', 'reason']
                    },
                    utility: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        score: { type: 'number' },
                        reason: { type: 'string' }
                      },
                      required: ['score', 'reason']
                    },
                    niche_authority: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        score: { type: 'number' },
                        reason: { type: 'string' }
                      },
                      required: ['score', 'reason']
                    },
                    data_driven_improvements: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        score: { type: 'number' },
                        reason: { type: 'string' }
                      },
                      required: ['score', 'reason']
                    }
                  },
                  required: [
                    'foundation',
                    'optimization',
                    'utility',
                    'niche_authority',
                    'data_driven_improvements'
                  ]
                },
                biggest_limiting_factor: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    category: { type: 'string' },
                    reason: { type: 'string' }
                  },
                  required: ['category', 'reason']
                },
                top_5_issues: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 5,
                  maxItems: 5
                },
                top_5_quick_wins: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 5,
                  maxItems: 5
                },
                what_this_means: { type: 'string' }
              },
              required: [
                'business_name',
                'website',
                'overall_score',
                'visibility_interpretation',
                'primary_visibility_insight',
                'ai_confidence_level',
                'executive_summary',
                'found_scores',
                'biggest_limiting_factor',
                'top_5_issues',
                'top_5_quick_wins',
                'what_this_means'
              ]
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return res.status(500).json({
        message: data?.error?.message || 'OpenAI request failed'
      });
    }

    let parsed;

    try {
      const raw = data?.choices?.[0]?.message?.content || '';
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error('Structured output parse failed:', data);

      return res.status(200).json({
        first_name: first_name || '',
        business_name: 'Analysis Partial',
        website,
        overall_score: 5,
        visibility_interpretation: 'Moderate visibility',
        primary_visibility_insight:
          'Your website content was accessible, but the analysis could not be fully structured.',
        ai_confidence_level: 'Medium',
        executive_summary:
          'AI systems were able to access your website content. However, the full structured analysis could not be completed. A deeper review is recommended.',
        found_scores: {
          foundation: {
            score: 5,
            reason: 'Analysis unavailable due to formatting issue.'
          },
          optimization: {
            score: 5,
            reason: 'Analysis unavailable due to formatting issue.'
          },
          utility: {
            score: 5,
            reason: 'Analysis unavailable due to formatting issue.'
          },
          niche_authority: {
            score: 5,
            reason: 'Analysis unavailable due to formatting issue.'
          },
          data_driven_improvements: {
            score: 5,
            reason: 'Analysis unavailable due to formatting issue.'
          }
        },
        biggest_limiting_factor: {
          category: 'Analysis Limitation',
          reason:
            'The website content was retrieved, but the analysis could not be fully structured due to a formatting issue.'
        },
        top_5_issues: [
          'The analysis output could not be fully structured.',
          'Some details from the website may not have been fully interpreted.',
          'The final scoring detail may be less reliable than intended.',
          'Specific visibility issues may not have been fully extracted.',
          'A deeper manual review would provide more confidence.'
        ],
        top_5_quick_wins: [
          'Review the homepage for clarity of the core service.',
          'Simplify service descriptions using direct language.',
          'Add stronger trust signals and proof of results.',
          'Make key pages easier to scan with clear headings.',
          'Use the VIP Audit for a complete strategic review.'
        ],
        what_this_means:
          'Your site likely has moderate visibility potential, but the analysis could not be fully completed. A deeper review is the best next step.'
      });
    }

    return res.status(200).json({
      first_name: first_name || '',
      ...parsed
    });

  } catch (error) {
    console.error('Snapshot error:', error);

    return res.status(500).json({
      message: error.message || 'Internal server error'
    });
  }
};
