// Copy buttons: <button data-copy="element-id"> copies that element's text.
document.querySelectorAll("button[data-copy]").forEach((btn) => {
  const status = btn.parentElement.querySelector(".copy-status");
  btn.addEventListener("click", async () => {
    const text = document.getElementById(btn.dataset.copy).textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      if (status) status.textContent = "Copied to clipboard";
    } catch {
      btn.textContent = "Press Ctrl+C";
      if (status) status.textContent = "Copy failed; select the text and copy it";
    }
    setTimeout(() => {
      btn.textContent = "Copy";
      if (status) status.textContent = "";
    }, 2000);
  });
});
