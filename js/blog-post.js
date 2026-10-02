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
  const images = Array.isArray(post.images) ? post.images : [];
  // Same uncropped, full-natural-aspect-ratio treatment as the cover
  // image — these are other slides from the same poster/carousel, not a
  // uniform photo grid, so cropping them to match each other would cut
  // off content.
  const extraImage = (src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(post.title)}" style="display:block; width:100%; height:auto; border-radius:16px; margin: 24px 0;">`;

  root.innerHTML = `
    <div class="post-date">${escapeHtml(post.date)}</div>
    <h1>${escapeHtml(post.title)}</h1>
    ${post.coverImage ? extraImage(post.coverImage) : ''}
    ${content.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
    ${images.map(extraImage).join('')}`;
}

document.addEventListener('DOMContentLoaded', renderPost);
