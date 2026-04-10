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

    return res.status(200).json({
      score: 7,
      summary: "Backend is working correctly.",
      quick_wins: [
        "Test connection successful",
        "Frontend and backend connected",
        "Ready for AI integration",
        "System functioning properly",
        "Next step is AI logic"
      ],
      next_steps: "Now we can safely move to the AI integration step."
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error"
    });
  }
};
