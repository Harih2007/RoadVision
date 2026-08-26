/**
 * RoadVision — Confidence Tier Badge Helper
 *
 * Returns a consistent HTML badge + metadata for any confidence percentage.
 * Used by history.html, detections.html, and review-queue.html.
 *
 * Usage:
 *   const { html, tier } = confidenceBadge(85);
 *   // html → '<span class="confidence-badge confidence-verified">...'
 *   // tier → 'verified' | 'review' | 'low'
 */

function confidenceBadge(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) pct = 0;
  // Normalise: if 0–1 range was passed, convert to 0–100
  const score = pct <= 1 ? Math.round(pct * 100) : Math.round(pct);

  let tier, label, icon;

  if (score > 85) {
    tier = 'verified';
    label = 'Verified';
    icon = 'check_circle';
  } else if (score >= 60) {
    tier = 'review';
    label = 'Needs Review';
    icon = 'rate_review';
  } else {
    tier = 'low';
    label = 'Low Confidence';
    icon = 'warning';
  }

  const html = `<span class="confidence-badge confidence-${tier}">
    <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span>
    ${score}% · ${label}
  </span>`;

  return { html, tier, score, label };
}

