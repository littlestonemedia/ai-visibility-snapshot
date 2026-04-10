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

    const { website } = body;

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

    // 🔥 OpenAI Call
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: `
You are an AI Visibility Strategist.

Analyze this website: ${website}

Give a short, clear AI Visibility Snapshot.

Follow this exact structure:

AI Visibility Score: [1-10]

Executive Summary:
(1 short paragraph explaining whether AI can understand and recommend this business)

Top 5 Quick Wins:
- bullet
- bullet
- bullet
- bullet
- bullet

What’s Next:
(1–2 sentences recommending next steps, mentioning checklist or audit naturally)

Rules:
- Be concise
- Do not mention browsing limitations
- Do not ramble
- Be direct and practical
`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        message: data?.error?.message || 'OpenAI request failed'
      });
    }

    // Extract AI text safely
    let outputText = "No response generated";

    try {
      outputText =
        data.output?.[1]?.content?.[0]?.text ||
        data.output_text ||
        "No response generated";
    } catch (e) {
      outputText = "Error reading AI response";
    }

    // Return formatted response to frontend
    return res.status(200).json({
      score: 7,
      summary: outputText,
      quick_wins: [
        "Improve clarity",
        "Add structured content",
        "Strengthen authority",
        "Answer customer questions",
        "Align messaging"
      ],
      next_steps: "Use the checklist or upgrade to a full VIP audit for deeper insights."
    });

  } catch (error) {
    console.error('Snapshot API error:', error);

    return res.status(500).json({
      message: error.message || 'Internal server error'
    });
  }
};
