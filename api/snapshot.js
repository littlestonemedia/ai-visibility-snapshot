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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { website } = body;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: `Analyze this website and give a short AI visibility summary and 5 quick wins: ${website}`
      })
    });

    const data = await response.json();

    const outputText = data.output?.[1]?.content?.[0]?.text || "No output";

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
      next_steps: "Upgrade to full AI visibility analysis for deeper insights."
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};
