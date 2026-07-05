export interface LetterheadBranding {
  siteTitle?: string;
  siteSubtitle?: string;
  sidebarLogoUrl?: string;
}

export function printWithLetterhead(
  htmlBody: string,
  branding: LetterheadBranding,
  options?: { referenceNumber?: string; title?: string }
) {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const title = escapeHtml(options?.title || branding.siteTitle || "Courrier sortant");
  const ref = options?.referenceNumber ? `<div class="ref">Réf : ${escapeHtml(options.referenceNumber)}</div>` : "";
  const logo = branding.sidebarLogoUrl
    ? `<img src="${escapeHtml(branding.sidebarLogoUrl)}" alt="" class="logo" />`
    : "";
  const subtitle = branding.siteSubtitle
    ? `<div class="subtitle">${escapeHtml(branding.siteSubtitle)}</div>`
    : "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page { margin: 20mm 15mm 25mm 15mm; }
          body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; }
          .header { border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 24px; text-align: center; }
          .logo { max-height: 64px; max-width: 200px; margin-bottom: 8px; }
          .org { font-size: 14pt; font-weight: bold; color: #1e3a5f; }
          .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
          .ref { font-size: 10pt; color: #666; margin-bottom: 16px; }
          .body { text-align: justify; }
          .body p { margin: 0 0 0.75em 0; }
          .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9pt; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logo}
          <div class="org">${title}</div>
          ${subtitle}
        </div>
        ${ref}
        <div class="body">${htmlBody}</div>
        <div class="footer">${escapeHtml(branding.siteSubtitle || branding.siteTitle || "")}</div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
