// CoreInventory - Shared JS Utilities
// (Toast and apiFetch are in layout.ejs for availability on all pages)

// Modal helpers
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

// Format number
function formatNum(n) {
  return parseFloat(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Format date
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Relative time
function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
