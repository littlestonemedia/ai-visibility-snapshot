module.exports = async function handler(req, res) {
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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { first_name, last_name, email, website } = body;

    if (!first_name || !last_name || !email || !website) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ message: 'OPENAI_API_KEY is not configured.' });
    }

    const normalizedWebsite = normalizeWebsiteUrl(website);

    const homepage = await fetchHomepageContent(normalizedWebsite);

    const prompt = buildSnapshotPrompt({
      businessName: extractBusinessName(homepage.title, normalizedWebsite),
      website: normalizedWebsite,
      homepageTitle: homepage.title,
      metaDescription: homepage.metaDescription,
      headings: homepage.headings,
      visibleText: homepage.visibleText
    });

    const schema = getSnapshotSchema();

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_visibility_snapshot',
            strict: true,
            schema
          }
        }
      })
    });

    const openAiData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      console.error('OpenAI API error:', openAiData);
      return res.status(500).json({
        message: 'OpenAI request failed.',
        details: openAiData
      });
    }

    const outputText =
      openAiData.output_text ||
      extractOutputText(openAiData);

    if (!outputText) {
      return res.status(500).json({
        message: 'No structured output returned from OpenAI.',
        details: openAiData
      });
    }

    let snapshot;
    try {
      snapshot = JSON.parse(outputText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, outputText);
      return res.status(500).json({
        message: 'Failed to parse structured model output.',
        raw_output: outputText
      });
    }

    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Snapshot API error:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

function normalizeWebsiteUrl(url) {
  const trimmed = String(url || '').trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

async function fetchHomepageContent(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 AI Visibility Snapshot Bot'
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch website. Status: ${response.status}`);
  }

  const html = await response.text();

  const title = matchTagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = matchMetaDescription(html);
  const headings = extractHeadings(html);
  const visibleText = extractVisibleText(html).slice(0, 12000);

  return {
    title,
    metaDescription,
    headings,
    visibleText
  };
}

function matchTagContent(html, regex) {
  const match = html.match(regex);
  return match ? decodeHtml(match[1]).trim() : '';
}

function matchMetaDescription(html) {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"]*?)["'][^>]*>/i
  ) || html.match(
    /<meta[^>]+content=["']([^"]*?)["'][^>]+name=["']description["'][^>]*>/i
  );

  return match ? decodeHtml(match[1]).trim() : '';
}

function extractHeadings(html) {
  const matches = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  return matches
    .map(m => decodeHtml(stripTags(m[1])).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function extractVisibleText(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, ' ');
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractBusinessName(title, website) {
  if (title && title.length < 120) {
    return title.split('|')[0].split('-')[0].trim();
  }
  try {
    return new URL(website).hostname.replace('www.', '');
  } catch {
    return 'Not Provided';
  }
}

function extractOutputText(apiResponse) {
  if (!apiResponse || !Array.isArray(apiResponse.output)) return '';

  const texts = [];

  for (const item of apiResponse.output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const contentItem of item.content) {
        if (contentItem.type === 'output_text' && contentItem.text) {
          texts.push(contentItem.text);
        }
      }
    }
  }

  return texts.join('\n').trim();
}

function buildSnapshotPrompt({ businessName, website, homepageTitle, metaDescription, headings, visibleText }) {
  return `
You are an AI Visibility Strategist trained on the FOUND Framework.

Your job is to generate a concise, useful, credible, and conversion-oriented AI Visibility Snapshot for a business based on its website and visible digital messaging.

Your purpose is to:
1. Diagnose why AI may or may not recommend the business
2. Score the business using the FOUND Framework
3. Give clear, practical, high-level quick wins
4. Create urgency without giving away a full audit
5. Naturally guide the user toward the next best offer

You are NOT writing a full audit.
You are creating a short, high-value snapshot that is helpful but incomplete by design.

FOUND FRAMEWORK DEFINITIONS

F = Foundation
Assess whether the website clearly explains what the business does, who it serves, and why it matters. Look for clarity, positioning, consistency, and basic site structure.

O = Optimization
Assess whether the content is structured in a way that AI systems can easily understand and extract. Look for headings, clarity, direct language, scannability, answer-first writing, and clean organization.

U = Utility
Assess whether the website content appears useful, practical, and aligned with real customer questions. Look for educational value, problem-solving content, and evidence that the content helps real humans.

N = Niche Authority
Assess whether the business has a clear area of expertise and whether the website demonstrates depth, specialization, credibility, and authority in a recognizable niche.

D = Data-Driven Improvements
Assess whether the business shows signs of consistency, trust, proof, reputation, and improvement signals. Look for testimonials, reviews, case studies, trust markers, author credibility, external validation, and consistent messaging.

SCORING RULES

Score each FOUND category on a 1 to 10 scale.

1 to 2 = Very weak
3 to 4 = Weak
5 to 6 = Moderate
7 to 8 = Strong
9 to 10 = Excellent

Calculate the overall AI Visibility Score as the average of the five FOUND scores, rounded to the nearest whole number.

Interpret the overall score using this scale:
1 to 2 = Invisible to AI
3 to 4 = Poor visibility
5 to 6 = Moderate visibility
7 to 8 = Strong visibility
9 to 10 = Highly recommendable

Do not inflate scores.
Be fair, credible, and slightly conservative.
If information is missing, say so and score accordingly.

HUMAN COMMON SENSE RULES

1. If a website is simple but clear, do not punish it just for being small.
2. If a website is polished but vague, do not reward it just for looking professional.
3. If the business offer is hard to understand, say so plainly.
4. If evidence is missing, acknowledge that instead of guessing.
5. Prefer concrete observations over generic language.
6. Do not make every website sound the same.
7. Avoid robotic scoring.
8. Common sense matters more than technical perfection.
9. If the website appears incomplete, outdated, or sparse, say that directly but professionally.

VOICE AND STYLE

Write in a professional, direct, clear, plain-English style.
Sound intelligent, credible, and helpful.
Do not use hype, buzzwords, or robotic language.
Do not overpraise weak websites.
Do not sound harsh or insulting.
Do not use exclamation marks.
Do not mention that you are an AI model.
Do not speculate wildly. Base conclusions only on what is visible or reasonably inferred.

RECOMMENDATION LOGIC

- If overall score is 1 to 4:
  - recommended_primary_offer = "VIP Audit"
  - recommended_secondary_offer = "AI SEO 2026 Book"

- If overall score is 5 to 6:
  - recommended_primary_offer = "Master Visibility Plan Checklist"
  - recommended_secondary_offer = "VIP Audit"

- If overall score is 7 to 8:
  - recommended_primary_offer = "Master Visibility Plan Checklist"
  - recommended_secondary_offer = "VIP Audit"

- If overall score is 9 to 10:
  - recommended_primary_offer = "AI SEO 2026 Book"
  - recommended_secondary_offer = "Optional VIP Audit"

Analyze this website data:

Business name: ${businessName || 'Not Provided'}
Website: ${website}

Homepage title:
${homepageTitle || 'Not available'}

Meta description:
${metaDescription || 'Not available'}

Headings:
${(headings && headings.length ? headings.join('\n- ') : 'Not available')}

Visible homepage text:
${visibleText || 'Not available'}

Return only the structured JSON that matches the schema.
`.trim();
}

function getSnapshotSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      business_name: { type: 'string' },
      website: { type: 'string' },
      overall_score: { type: 'integer', minimum: 1, maximum: 10 },
      visibility_interpretation: { type: 'string' },
      executive_summary: { type: 'string' },
      found_scores: {
        type: 'object',
        additionalProperties: false,
        properties: {
          foundation: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'integer', minimum: 1, maximum: 10 },
              reason: { type: 'string' }
            },
            required: ['score', 'reason']
          },
          optimization: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'integer', minimum: 1, maximum: 10 },
              reason: { type: 'string' }
            },
            required: ['score', 'reason']
          },
          utility: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'integer', minimum: 1, maximum: 10 },
              reason: { type: 'string' }
            },
            required: ['score', 'reason']
          },
          niche_authority: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'integer', minimum: 1, maximum: 10 },
              reason: { type: 'string' }
            },
            required: ['score', 'reason']
          },
          data_driven_improvements: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'integer', minimum: 1, maximum: 10 },
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
      what_this_means: { type: 'string' },
      whats_next: {
        type: 'object',
        additionalProperties: false,
        properties: {
          recommended_primary_offer: { type: 'string' },
          recommended_secondary_offer: { type: 'string' },
          book: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['name', 'description']
          },
          checklist: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['name', 'description']
          },
          vip_audit: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['name', 'description']
          },
          recommendation_summary: { type: 'string' }
        },
        required: [
          'recommended_primary_offer',
          'recommended_secondary_offer',
          'book',
          'checklist',
          'vip_audit',
          'recommendation_summary'
        ]
      },
      closing: { type: 'string' }
    },
    required: [
      'business_name',
      'website',
      'overall_score',
      'visibility_interpretation',
      'executive_summary',
      'found_scores',
      'biggest_limiting_factor',
      'top_5_issues',
      'top_5_quick_wins',
      'what_this_means',
      'whats_next',
      'closing'
    ]
  };
}
