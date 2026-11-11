(() => {
  const form = document.querySelector("#global-search-form");
  const input = document.querySelector("#global-search-input");
  const output = document.querySelector("#global-search-results");
  if (!form || !input || !output) return;
  const params = new URLSearchParams(window.location.search);
  const initialQuery = (params.get("q") || "").trim();
  input.value = initialQuery;
  const pages = [
    { path: "index.html", label: "POST" },
    { path: "about.html", label: "PROFILE" },
    { path: "projects.html", label: "PROJECT" },
    { path: "contact.html", label: "CONTACT" }
  ];
  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const getText = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const collect = async () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { output.innerHTML = '<div class="news-empty">Enter a word or phrase to search.</div>'; return; }
    output.innerHTML = '<div class="news-loading"><span class="loading-pulse"></span>Searching posts and projects...</div>';
    const docs = await Promise.all(pages.map(async (page) => {
      try {
        const response = await fetch("./" + page.path);
        if (!response.ok) return [];
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const selectors = page.label === "POST" ? ".post" :
          page.label === "PROJECT" ? ".project-tile" :
          page.label === "CONTACT" ? ".contact-card" : ".profile-body, .profile-details";
        return [...doc.querySelectorAll(selectors)].map((node) => {
          const title = node.querySelector("h1,h2,h3,strong")?.textContent?.trim() || page.label;
          const text = getText(node);
          const anchor = node.matches("a[href]") ? node : node.querySelector("a[href]");
          let href = anchor?.getAttribute("href") || page.path;
          if (/^https?:/i.test(href)) href = page.path;
          return { title, text, href, page: page.path, label: page.label };
        });
      } catch (error) { return []; }
    }));
    const results = docs.flat().filter((item) => (item.title + " " + item.text).toLowerCase().includes(query));
    if (!results.length) {
      output.innerHTML = '<div class="news-empty"><strong>No matches found.</strong><p>Try a different word, project name, or topic.</p></div>';
      return;
    }
    output.innerHTML = results.slice(0, 40).map((item) =>
      '<a class="search-result-card" href="' + escapeHtml(item.href) + '"><span>' + escapeHtml(item.label) + '</span><strong>' +
      escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.text.slice(0, 230)) + '</p><small>Open ' +
      escapeHtml(item.page.replace(".html", "")) + ' ↗</small></a>'
    ).join("");
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); const q = input.value.trim(); if (q) window.location.search = "?q=" + encodeURIComponent(q); });
  collect();
})();