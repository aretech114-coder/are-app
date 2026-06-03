/** Parse formatted notes stored in workflow_transitions by WorkflowActions. */

export interface ParsedWorkflowNotes {
  annotation: string | null;
  attachmentUrl: string | null;
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
  notes: string | null | undefined
): ParsedWorkflowNotes | null {
  if (!notes?.trim()) return null;

  const raw = notes.trim();
  const annotationMatch = raw.match(/📝 Annotation:\s*([\s\S]*?)(?=\n(?:📎|👥|💬|📅)|$)/);
  const attachmentMatch = raw.match(/📎 Document joint:\s*(\S+)/);
  const assigneesMatch = raw.match(/👥 Personnes assignées:\s*(.+?)(?=\n|$)/);
  const notesMatch = raw.match(/💬 Notes:\s*([\s\S]*?)(?=\n📅|$)/);
  const rdvMatch = raw.match(/📅 RDV planifié:\s*(.+?)(?=\n|$)/);

  return {
    annotation: annotationMatch?.[1]?.trim() || null,
    attachmentUrl: attachmentMatch?.[1]?.trim() || null,
    assigneeNames: assigneesMatch?.[1]?.trim() || null,
    additionalNotes: notesMatch?.[1]?.trim() || null,
    rdvLine: rdvMatch?.[1]?.trim() || null,
    raw,
  };
}

/** Human-readable lines for timeline (no raw URLs). */
export function formatTransitionNotesForDisplay(notes: string | null | undefined): string[] {
  const parsed = parseWorkflowTransitionNotes(notes);
  if (!parsed) return notes?.trim() ? [notes.trim()] : [];

  const lines: string[] = [];
  if (parsed.annotation) lines.push(`Annotation : ${parsed.annotation}`);
  if (parsed.assigneeNames) lines.push(`Assignés au traitement : ${parsed.assigneeNames}`);
  if (parsed.rdvLine) lines.push(`RDV : ${parsed.rdvLine}`);
  if (parsed.additionalNotes) lines.push(`Notes : ${parsed.additionalNotes}`);
  if (parsed.attachmentUrl) lines.push("Document joint (voir aperçu ci-dessous)");

  if (lines.length === 0 && !isStructuredWorkflowNotes(parsed.raw)) {
    return [parsed.raw];
  }
  return lines;
}
