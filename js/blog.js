/** Renders the post list on blog.html from the live "Filmlab04 Blog"
 * Google Sheet (via admin-api.gs's Apps Script Web App — same endpoint
 * products use, see PRODUCTS_ENDPOINT in cart.js). Depends on cart.js for
 * escapeHtml() and PRODUCTS_ENDPOINT. Each post links out to its own page
 * (blog-post.html?id=...), rendered by js/blog-post.js.
 */

let __posts = null;

async function loadPosts() {
  if (__posts) return __posts;
  const res = await fetch(`${PRODUCTS_ENDPOINT}?action=blog-posts`);
  __posts = await res.json();
  return __posts;
}

function postCard(post) {
  const idAttr = encodeURIComponent(post.id);
  return `
    <article class="post-card">
      <div class="post-date">${escapeHtml(post.date)}</div>
      <a href="blog-post.html?id=${idAttr}"><h2>${escapeHtml(post.title)}</h2></a>
      <p>${escapeHtml(post.excerpt || '')}</p>
      <a href="blog-post.html?id=${idAttr}" class="muted">Read more →</a>
    </article>`;
}

async function renderBlogList() {
  const root = document.querySelector('.blog-list');
  if (!root) return;
  const posts = await loadPosts();
  root.innerHTML = posts.map(postCard).join('') || '<p class="muted">No posts yet.</p>';
}

document.addEventListener('DOMContentLoaded', renderBlogList);
