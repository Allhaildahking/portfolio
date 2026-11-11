(() => {
  const inputs = [document.querySelector("#site-search"), document.querySelector("#side-search")].filter(Boolean);
  inputs.forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const query = input.value.trim();
      if (!query) return;
      window.location.href = "./search.html?q=" + encodeURIComponent(query);
    });
  });

  // Load the interaction layer only on pages where its configuration is supplied.
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "./assets/css/interactions.css";
  document.head.append(stylesheet);

  const config = document.createElement("script");
  config.src = "./assets/js/supabase-config.js";
  config.onload = () => import("./interactions.js").catch(() => {});
  document.head.append(config);
})();
