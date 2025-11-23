export const wrap = (sections: Element[]) => {
  sections.forEach((section) => {
    const doc = section.ownerDocument;
    if (!doc) return;

    // Only JSON blocks? Use 'pre.json'
    const preNodes = section.querySelectorAll(
      "pre.json, pre[data-lang], pre[data-language]",
    );

    preNodes.forEach((pre) => {
      const parent = pre.parentNode;
      if (!parent) return;

      // Read any existing hints from the <pre>
      const lang =
        pre.getAttribute("data-language") ||
        pre.getAttribute("data-lang") ||
        pre.classList.contains("json")
          ? "json"
          : "";

      const filename =
        pre.getAttribute("data-filename") || pre.getAttribute("title") || "";

      // --- Build wrapper structure ---
      const wrapper = doc.createElement("div");
      wrapper.className = "code-block";
      if (lang) wrapper.setAttribute("data-language", lang);
      if (filename) wrapper.setAttribute("data-filename", filename);

      const header = doc.createElement("div");
      header.className = "code-block__header";

      const meta = doc.createElement("div");
      meta.className = "code-block__meta";

      if (filename) {
        const filenameSpan = doc.createElement("span");
        filenameSpan.className = "code-block__filename";
        filenameSpan.textContent = filename;
        meta.appendChild(filenameSpan);
      }

      if (lang) {
        const langSpan = doc.createElement("span");
        langSpan.className = "code-block__language";
        langSpan.textContent = lang.toUpperCase();
        meta.appendChild(langSpan);
      }

      const copyBtn = doc.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-block__copy-btn";
      copyBtn.setAttribute("data-copy", "");
      copyBtn.setAttribute("aria-label", "Copy code");
      copyBtn.textContent = "Copy";

      header.appendChild(meta);
      header.appendChild(copyBtn);

      // mark the pre as "inner" code element
      pre.classList.add("code-block__pre");

      // Replace <pre> with wrapper, then put pre inside wrapper
      parent.replaceChild(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });
  });
};
