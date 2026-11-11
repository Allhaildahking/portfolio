(() => {
  const url = window.AHK_SUPABASE_URL;
  const anonKey = window.AHK_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  const posts = [...document.querySelectorAll(".feed > .post")];
  if (!posts.length) return;

  const getVisitorId = () => {
    const key = "ahk-anonymous-visitor";
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      return crypto.randomUUID();
    }
  };

  const visitorId = getVisitorId();
  const postIds = posts.map((post, index) => {
    const id = post.dataset.postId || `home-post-${String(index + 1).padStart(2, "0")}`;
    post.dataset.postId = id;
    return id;
  });

  const callFunction = async (payload) => {
    const response = await fetch(`${url}/functions/v1/portfolio-interactions`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...payload, visitorId })
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "The request could not be completed.");
    }
    return data;
  };

  const interfaces = [];
  posts.forEach((post, index) => {
    const postId = postIds[index];
    const actions = document.createElement("div");
    actions.className = "social-actions";

    const likeButton = document.createElement("button");
    likeButton.className = "social-action like-action";
    likeButton.type = "button";
    likeButton.setAttribute("aria-label", "Like this post");
    likeButton.setAttribute("aria-pressed", "false");

    actions.append(likeButton);
    const existingActions = post.querySelector(".post-actions");
    if (existingActions) existingActions.insertAdjacentElement("afterend", actions);
    else post.querySelector(".post-content")?.append(actions);

    const ui = { postId, likeButton, likeCount: 0, liked: false };
    interfaces.push(ui);

    likeButton.addEventListener("click", async () => {
      const previousCount = ui.likeCount;
      const previousLiked = ui.liked;

      ui.liked = !previousLiked;
      ui.likeCount = Math.max(0, previousCount + (ui.liked ? 1 : -1));
      likeButton.textContent = `♥ ${ui.likeCount}`;
      likeButton.classList.toggle("is-liked", ui.liked);
      likeButton.setAttribute("aria-pressed", String(ui.liked));
      likeButton.disabled = true;

      try {
        await callFunction({ action: "like", postId });
        refresh();
      } catch {
        ui.likeCount = previousCount;
        ui.liked = previousLiked;
        likeButton.textContent = `♥ ${ui.likeCount}`;
        likeButton.classList.toggle("is-liked", ui.liked);
        likeButton.setAttribute("aria-pressed", String(ui.liked));
      } finally {
        likeButton.disabled = false;
      }
    });
  });

  const refresh = async () => {
    try {
      const summary = await callFunction({ action: "summary", postIds });
      interfaces.forEach((ui) => {
        const data = summary.posts?.[ui.postId] || {};
        ui.likeCount = Number(data.likes || 0);
        ui.liked = Boolean(data.likedByMe);
        ui.likeButton.textContent = `♥ ${ui.likeCount}`;
        ui.likeButton.classList.toggle("is-liked", ui.liked);
        ui.likeButton.setAttribute("aria-pressed", String(ui.liked));
      });
    } catch {
      // Interactions are optional; the feed remains usable if the service is unavailable.
    }
  };

  refresh();
})();
