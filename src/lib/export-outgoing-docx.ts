import { Document, Packer, Paragraph, TextRun } from "docx";

function htmlToPlainParagraphs(html: string): string[] {
  const stripped = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  return stripped.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

export async function exportOutgoingDraftDocx(
  htmlContent: string,
  fileName: string
): Promise<void> {
  const paragraphs = htmlToPlainParagraphs(htmlContent);
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map(
          (text) =>
            new Paragraph({
              children: [new TextRun({ text })],
              spacing: { after: 200 },
            })
        ),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".docx") ? fileName : `${fileName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPlainTextDocx(text: string, fileName: string): Promise<void> {
  return exportOutgoingDraftDocx(
    text.split("\n").map((line) => `<p>${line}</p>`).join(""),
    fileName
  );
}
