<div id="ai-snapshot-tool" style="max-width:760px;margin:0 auto;">
  <form id="snapshotForm" style="display:grid;gap:12px;">
    <input type="text" id="first_name" name="first_name" placeholder="First Name" required style="padding:14px;font-size:16px;">
    <input type="text" id="last_name" name="last_name" placeholder="Last Name" required style="padding:14px;font-size:16px;">
    <input type="email" id="email" name="email" placeholder="Email" required style="padding:14px;font-size:16px;">
    <input type="url" id="website" name="website" placeholder="https://yourwebsite.com" required style="padding:14px;font-size:16px;">
    <button type="submit" style="padding:14px 18px;font-size:16px;cursor:pointer;">
      Generate My AI Visibility Snapshot
    </button>
  </form>

  <div id="loadingMessage" style="display:none;margin-top:20px;font-size:16px;">
    Analyzing your website through the FOUND Framework...
  </div>

  <div id="errorMessage" style="display:none;margin-top:20px;color:#b00020;font-size:16px;white-space:pre-wrap;"></div>

  <div id="results" style="display:none;margin-top:28px;">
    <h3 id="scoreHeading"></h3>
    <p id="summaryText"></p>

    <h4>Top 5 Quick Wins</h4>
    <ul id="quickWinsList"></ul>

    <h4>What’s Next</h4>
    <p id="nextStepsText"></p>
  </div>
</div>

<script>
(function () {
  const BACKEND_URL = "https://ai-visibility-snapshot-one.vercel.app/api/snapshot";

  const form = document.getElementById("snapshotForm");
  const loadingMessage = document.getElementById("loadingMessage");
  const errorMessage = document.getElementById("errorMessage");
  const results = document.getElementById("results");
  const scoreHeading = document.getElementById("scoreHeading");
  const summaryText = document.getElementById("summaryText");
  const quickWinsList = document.getElementById("quickWinsList");
  const nextStepsText = document.getElementById("nextStepsText");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    errorMessage.style.display = "none";
    errorMessage.textContent = "";
    results.style.display = "none";
    loadingMessage.style.display = "block";

    const payload = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      email: document.getElementById("email").value.trim(),
      website: document.getElementById("website").value.trim()
    };

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      let data = {};
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error("The server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
          data.error ||
          (data.details && JSON.stringify(data.details)) ||
          "Something went wrong."
        );
      }

      scoreHeading.textContent = `AI Visibility Score: ${data.overall_score || data.score}/10`;
      summaryText.textContent = data.executive_summary || data.summary || "";

      quickWinsList.innerHTML = "";
      const quickWins = data.top_5_quick_wins || data.quick_wins || [];
      quickWins.forEach(function (item) {
        const li = document.createElement("li");
        li.textContent = item;
        quickWinsList.appendChild(li);
      });

      if (data.whats_next && data.whats_next.recommendation_summary) {
        nextStepsText.textContent = data.whats_next.recommendation_summary;
      } else {
        nextStepsText.textContent = data.next_steps || "";
      }

      loadingMessage.style.display = "none";
      results.style.display = "block";
    } catch (err) {
      loadingMessage.style.display = "none";
      errorMessage.textContent = "Error: " + (err.message || "Unknown error");
      errorMessage.style.display = "block";
    }
  });
})();
</script>
