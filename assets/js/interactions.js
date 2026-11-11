import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

(() => {
  const url = window.AHK_SUPABASE_URL;
  const anonKey = window.AHK_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
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
    const { data, error } = await supabase.functions.invoke("portfolio-interactions", {
      body: { ...payload, visitorId }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "The request could not be completed.");
    return data;
  };

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const renderComments = (container, comments) => {
    container.replaceChildren();
    if (!comments?.length) {
      container.append(make("p", "comment-empty", "No comments yet. Start the conversation."));
      return;
    }
    comments.forEach((comment) => {
      const item = make("article", "comment-item");
      const heading = make("div", "comment-heading");
      heading.append(make("strong", "", comment.display_name), make("time", "", new Date(comment.created_at).toLocaleDateString()));
      item.append(heading, make("p", "comment-body", comment.body));
      container.append(item);
    });
  };

  const renderSummary = (summary, ui) => {
    const data = summary.posts?.[ui.postId] || {};
    ui.likeButton.textContent = `♥ ${Number(data.likes || 0)}`;
    ui.likeButton.classList.toggle("is-liked", Boolean(data.likedByMe));
    ui.likeButton.setAttribute("aria-pressed", String(Boolean(data.likedByMe)));
    ui.commentButton.textContent = `Comments ${Number(data.commentCount || 0)}`;
    ui.viewCount.textContent = `${Number(data.views || 0)} views`;
    renderComments(ui.commentList, data.comments || []);
  };

  const interfaces = [];
  posts.forEach((post, index) => {
    const postId = postIds[index];
    const actions = make("div", "social-actions");
    const likeButton = make("button", "social-action like-action", "♥ 0");
    likeButton.type = "button";
    likeButton.setAttribute("aria-label", "Like this post");
    likeButton.setAttribute("aria-pressed", "false");

    const commentButton = make("button", "social-action comment-action", "Comments 0");
    commentButton.type = "button";
    const viewCount = make("span", "social-view-count", "Views");

    const commentPanel = make("section", "comment-panel");
    commentPanel.hidden = true;
    const commentList = make("div", "comment-list");
    const form = make("form", "comment-form");
    const nameInput = make("input", "comment-name");
    nameInput.type = "text";
    nameInput.name = "displayName";
    nameInput.placeholder = "Your name";
    nameInput.maxLength = 32;
    nameInput.required = true;
    nameInput.autocomplete = "name";
    const bodyInput = make("textarea", "comment-message");
    bodyInput.name = "body";
    bodyInput.placeholder = "Write a thoughtful comment...";
    bodyInput.maxLength = 500;
    bodyInput.minLength = 2;
    bodyInput.rows = 3;
    bodyInput.required = true;
    const submit = make("button", "comment-submit", "Send comment");
    submit.type = "submit";
    const note = make("p", "comment-note", "Comments are reviewed before they appear publicly.");
    const status = make("p", "interaction-status");
    status.setAttribute("role", "status");
    form.append(nameInput, bodyInput, submit);
    commentPanel.append(commentList, form, note, status);
    actions.append(likeButton, commentButton, viewCount);

    const existingActions = post.querySelector(".post-actions");
    if (existingActions) existingActions.insertAdjacentElement("afterend", actions);
    else post.querySelector(".post-content")?.append(actions);
    actions.insertAdjacentElement("afterend", commentPanel);

    const ui = { postId, likeButton, commentButton, viewCount, commentList, status, submit };
    interfaces.push(ui);

    likeButton.addEventListener("click", async () => {
      likeButton.disabled = true;
      try {
        await callFunction({ action: "like", postId });
        await refresh();
      } catch (error) {
        ui.status.textContent = "Couldn't save your like. Please try again.";
      } finally {
        likeButton.disabled = false;
      }
    });

    commentButton.addEventListener("click", () => {
      commentPanel.hidden = !commentPanel.hidden;
      if (!commentPanel.hidden) nameInput.focus();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const displayName = nameInput.value.trim();
      const body = bodyInput.value.trim();
      if (!displayName || !body) return;
      submit.disabled = true;
      status.textContent = "Sending...";
      try {
        await callFunction({ action: "comment", postId, displayName, body });
        bodyInput.value = "";
        status.textContent = "Thanks. Your comment is waiting for review.";
      } catch (error) {
        status.textContent = error.message?.includes("rate") ?
          "You've sent comments recently. Please try again later." :
          "Couldn't send your comment. Please try again.";
      } finally {
        submit.disabled = false;
      }
    });
  });

  const refresh = async () => {
    try {
      const summary = await callFunction({ action: "summary", postIds });
      interfaces.forEach((ui) => renderSummary(summary, ui));
      if (window.ahkRenderActivity) window.ahkRenderActivity(summary.activity || []);
    } catch (error) {
      interfaces.forEach((ui) => {
        ui.status.textContent = "Interactions are temporarily unavailable.";
      });
    }
  };

  const recordViews = async () => {
    try {
      await callFunction({ action: "views", postIds });
    } catch {
      // View counts are non-blocking; the feed should still load if they fail.
    }
  };

  const rightRail = document.querySelector(".right-rail");
  if (rightRail) {
    const activityCard = make("section", "side-card interaction-activity");
    activityCard.append(make("div", "side-title", "RECENT ACTIVITY"));
    const activityList = make("div", "activity-list");
    activityCard.append(activityList);
    const footer = rightRail.querySelector(".right-footer");
    if (footer) rightRail.insertBefore(activityCard, footer);
    else rightRail.append(activityCard);
    window.ahkRenderActivity = (items) => {
      activityList.replaceChildren();
      if (!items?.length) {
        activityList.append(make("p", "activity-empty", "New conversations will show up here."));
        return;
      }
      items.forEach((item) => {
        const row = make("article", "activity-item");
        row.append(make("strong", "", item.display_name), make("p", "", item.body));
        activityList.append(row);
      });
    };
  }

  recordViews().finally(refresh);
})();
