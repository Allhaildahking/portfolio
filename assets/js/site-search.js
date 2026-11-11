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
})();