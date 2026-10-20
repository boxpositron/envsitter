(() => {
  if (!navigator.clipboard || !window.isSecureContext) return;

  const status = document.getElementById("copy-status");
  const announce = (message) => {
    if (status) status.textContent = message;
  };

  document.querySelectorAll("button[data-copy]").forEach((button) => {
    let resetTimer;
    button.hidden = false;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.dataset.state = "copied";
        announce("Copied to clipboard");
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          delete button.dataset.state;
          announce("");
        }, 2000);
      } catch {
        announce("Copy failed. Select the text and copy it manually.");
      }
    });
  });
})();
