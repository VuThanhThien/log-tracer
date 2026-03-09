// ─── Grafana log row structure (from real page HTML) ──────────────────────────
//
//  <table class="css-3b16mh-logs-rows">          ← outer table
//    <tr class="css-138e3qo-logs-row  ">          ← one log entry
//      <td class="...-logs-row__level">           ← log level (empty visual)
//      <td class="...-logs-row-toggle-details__level"> ← expand toggle
//      <td class="...-logs-row__localtime">       ← timestamp
//      <td class="...-logs-row__message">         ← full log text (JSON spans)
//    </tr>
//    <tr class="...-logs-row-logDetailsDefaultCursor"> ← expanded field details
//      ...                                         ← MUST be skipped
//    </tr>
//  </table>
//
// Detail rows are distinguished by "-logs-row-[letter]" (hyphen + letter after
// "-logs-row"), while main rows end with "-logs-row" + whitespace only.
// ──────────────────────────────────────────────────────────────────────────────

function extractGrafanaLogs(): string {
  // ── Strategy 1: structured Grafana log rows ──────────────────────────────
  const allRows = document.querySelectorAll('tr[class*="-logs-row"]');
  if (allRows.length > 0) {
    const lines: string[] = [];

    for (const row of allRows) {
      // Skip expanded-detail rows (class like "…-logs-row-logDetailsDefaultCursor")
      if (/-logs-row-[a-zA-Z]/.test(row.className)) continue;

      const timeEl = row.querySelector('[class*="-logs-row__localtime"]');
      const msgEl  = row.querySelector('[class*="-logs-row__message"]');
      if (!msgEl) continue;

      const time = timeEl?.textContent?.trim() ?? "";
      // Collapse the fragmented spans/marks into one clean string
      const msg  = collapseText(msgEl);
      if (!msg) continue;

      lines.push(time ? `[${time}] ${msg}` : msg);
    }

    if (lines.length > 0) return lines.join("\n\n");
  }

  // ── Strategy 2: entire logs-rows table ──────────────────────────────────
  const table = document.querySelector('table[class*="-logs-rows"]');
  if (table) {
    const text = extractTextContent(table);
    if (text.length > 100) return text;
  }

  // ── Strategy 3: generic Grafana panel / page body ────────────────────────
  const panelSelectors = [
    '[class*="logsPanel"]',
    '[class*="logs-panel"]',
    '[class*="panel-content"]',
    "main",
    '[role="main"]',
  ];
  for (const sel of panelSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = extractTextContent(el);
      if (text.length > 200) return text;
    }
  }

  return extractTextContent(document.body);
}

/** Concatenates all text nodes inside an element, collapsing extra whitespace. */
function collapseText(root: Element): string {
  return (root.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractTextContent(root: Element): string {
  const lines: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) lines.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el  = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return;
    for (const child of el.childNodes) walk(child);
  };
  walk(root);
  return lines.map((s) => s.trim()).filter(Boolean).join("\n");
}

chrome.runtime.onMessage.addListener(
  (
    msg: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: unknown) => void
  ) => {
    if (msg.type === "EXTRACT_LOGS") {
      const logs = extractGrafanaLogs();
      sendResponse({ ok: true, logs });
    }
    return true;
  }
);
