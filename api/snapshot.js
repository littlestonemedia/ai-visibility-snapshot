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

    console.log('New submission:', {
      first_name,
      last_name,
      email,
      website
    });

    return res.status(200).json({
      score: 7,
      summary: 'Your website has moderate AI visibility but lacks clear positioning and strong authority signals.',
      quick_wins: [
        'Clarify your homepage headline',
        'Add structured, answer-based content',
        'Improve internal linking between pages',
        'Create niche authority articles',
        'Align messaging across your site'
      ],
      next_steps: 'Start with the Master Visibility Plan Checklist or upgrade to a full VIP Audit for deeper insights.'
    });
  } catch (error) {
    console.error('Snapshot API error:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};
