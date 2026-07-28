import type { MailAttachmentMeta } from "@/lib/labels";

/** Parse formatted notes stored in workflow_transitions by WorkflowActions. */

export interface ParsedWorkflowNotes {
  annotation: string | null;
  attachmentUrl: string | null;
  attachmentUrls: string[];
  attachmentMeta: MailAttachmentMeta[];
  assigneeNames: string | null;
  additionalNotes: string | null;
  rdvLine: string | null;
  raw: string;
}

const MARKERS = ["📝", "📎", "👥", "💬", "📅", "📄", "📋"];

export function isStructuredWorkflowNotes(text: string | null | undefined): boolean {
  if (!text) return false;
  return MARKERS.some((m) => text.includes(m));
}

export function parseWorkflowTransitionNotes(
  notes: string | null | undefined,
  attachmentInput?: unknown
): ParsedWorkflowNotes | null {
  const structuredMeta = normalizeAttachmentMeta(attachmentInput);
  const raw = notes?.trim() || "";
  if (!raw && structuredMeta.length === 0) return null;

  const annotationMatch = raw.match(/📝 Annotation:\s*([\s\S]*?)(?=\n(?:📎|👥|💬|📅)|$)/);
  const assigneesMatch = raw.match(/👥 Personnes assignées:\s*(.+?)(?=\n|$)/);
  const notesMatch = raw.match(/💬 Notes:\s*([\s\S]*?)(?=\n📅|$)/);
  const rdvMatch = raw.match(/📅 RDV planifié:\s*(.+?)(?=\n|$)/);
  const legacyUrls = [...raw.matchAll(/📎 Document joint:\s*(\S+)/g)].map((m) => m[1]?.trim()).filter(Boolean) as string[];
  const attachmentMeta =
    structuredMeta.length > 0 ? structuredMeta : legacyUrls.map((url) => ({ url, name: url.split("/").pop() || "Pièce jointe", path: url }));
  const attachmentUrls = attachmentMeta.map((a) => a.url).filter(Boolean);

  return {
    annotation: annotationMatch?.[1]?.trim() || null,
    attachmentUrl: attachmentUrls[0] || null,
    attachmentUrls,
    attachmentMeta,
    assigneeNames: assigneesMatch?.[1]?.trim() || null,
    additionalNotes: notesMatch?.[1]?.trim() || null,
    rdvLine: rdvMatch?.[1]?.trim() || null,
    raw,
  };
}

/** Human-readable lines for timeline (no raw URLs). */
export function formatTransitionNotesForDisplay(
  notes: string | null | undefined,
  attachmentInput?: unknown
): string[] {
  const parsed = parseWorkflowTransitionNotes(notes, attachmentInput);
  if (!parsed) return notes?.trim() ? [notes.trim()] : [];

  const lines: string[] = [];
  if (parsed.annotation) lines.push(`Annotation : ${parsed.annotation}`);
  if (parsed.assigneeNames) lines.push(`Assignés au traitement : ${parsed.assigneeNames}`);
  if (parsed.rdvLine) lines.push(`RDV : ${parsed.rdvLine}`);
  if (parsed.additionalNotes) lines.push(`Notes : ${parsed.additionalNotes}`);
  if (parsed.attachmentUrls.length > 0) {
    lines.push(
      parsed.attachmentUrls.length > 1
        ? `Documents joints (${parsed.attachmentUrls.length})`
        : "Document joint (voir aperçu ci-dessous)"
    );
  }

  if (lines.length === 0 && !isStructuredWorkflowNotes(parsed.raw)) {
    return [parsed.raw];
  }
  return lines;
}

function normalizeAttachmentMeta(input: unknown): MailAttachmentMeta[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (value): value is MailAttachmentMeta =>
        !!value &&
        typeof value === "object" &&
        typeof (value as MailAttachmentMeta).url === "string"
    )
    .map((value) => ({
      url: value.url,
      name: value.name || value.url.split("/").pop() || "Pièce jointe",
      path: value.path || value.url,
      bucket: value.bucket,
    }));
}
