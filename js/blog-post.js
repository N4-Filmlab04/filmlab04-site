/** Renders a single post on blog-post.html?id=... from data/posts.json.
 * Depends on cart.js for escapeHtml() and js/blog.js for loadPosts().
 */

async function renderPost() {
  const root = document.querySelector('.post-detail');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const posts = await loadPosts();
  const post = posts.find(p => p.id === id);

  if (!post) {
    root.innerHTML = '<p>Post not found. <a href="blog.html">Back to blog</a></p>';
    return;
  }

  document.title = `${post.title} — Filmlab04`;

  const content = Array.isArray(post.content) ? post.content : [post.content || ''];

  root.innerHTML = `
    <div class="post-date">${escapeHtml(post.date)}</div>
    <h1>${escapeHtml(post.title)}</h1>
    ${post.coverImage ? `<div class="product-card-img" style="border-radius:16px; aspect-ratio: 16/9; margin: 24px 0;"><img src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}"></div>` : ''}
    ${content.map(p => `<p>${escapeHtml(p)}</p>`).join('')}`;
}

document.addEventListener('DOMContentLoaded', renderPost);
