import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "expediteur";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let remaining = para;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(" ", maxChars);
      if (breakAt < maxChars * 0.5) breakAt = maxChars;
      lines.push(remaining.slice(0, breakAt).trim());
      remaining = remaining.slice(breakAt).trim();
    }
    if (remaining) lines.push(remaining);
  }
  return lines;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const mailId = body?.mail_id as string | undefined;
    if (!mailId) {
      return new Response(JSON.stringify({ error: "mail_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: gedSetting } = await supabase
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "ged_module_enabled")
      .maybeSingle();

    if (gedSetting?.setting_value !== "true") {
      return new Response(JSON.stringify({ skipped: true, reason: "GED module disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: mail, error: mailError } = await supabase
      .from("mails")
      .select(
        "id, reference_number, sender_name, subject, description, outgoing_draft_html, ai_draft, status, created_at, workflow_completed_at",
      )
      .eq("id", mailId)
      .single();

    if (mailError || !mail) throw mailError ?? new Error("Courrier introuvable");

    const { data: existing } = await supabase
      .from("ged_documents")
      .select("id")
      .eq("mail_id", mailId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: "GED document already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: accuseDoc } = await supabase
      .from("mail_workflow_documents")
      .select("file_name, storage_bucket, storage_path, step_number")
      .eq("mail_id", mailId)
      .eq("document_type", "accuse_reception_sortant")
      .maybeSingle();

    const { data: contributions } = await supabase
      .from("mail_contributions")
      .select("content, treatment_type, created_at, contributor_id")
      .eq("mail_id", mailId)
      .eq("step_number", 4)
      .order("created_at", { ascending: true });

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const margin = 50;
    const lineHeight = 14;
    const pageWidth = 595;
    const pageHeight = 842;
    const maxWidth = pageWidth - margin * 2;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawLine = (text: string, bold = false, size = 11) => {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(text, {
        x: margin,
        y,
        size,
        font: bold ? fontBold : font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth,
      });
      y -= lineHeight + (size > 11 ? 4 : 0);
    };

    drawLine("DOSSIER GED — ARCHIVAGE", true, 16);
    y -= 8;
    drawLine(`Référence : ${mail.reference_number}`, true);
    drawLine(`Expéditeur : ${mail.sender_name}`);
    drawLine(`Objet : ${mail.subject}`);
    drawLine(`Date archivage : ${new Date(mail.workflow_completed_at ?? Date.now()).toLocaleDateString("fr-FR")}`);
    y -= 10;
    drawLine("— Courrier sortant / brouillon —", true);

    const bodyText = stripHtml(mail.outgoing_draft_html || mail.ai_draft || mail.description || "(aucun contenu)");
    for (const line of wrapText(bodyText, 90)) {
      drawLine(line);
    }

    if (contributions?.length) {
      y -= 10;
      drawLine("— Contributions étape traitement —", true);
      for (const c of contributions) {
        drawLine(`• ${c.treatment_type ?? "Traitement"} (${new Date(c.created_at).toLocaleDateString("fr-FR")})`);
        for (const line of wrapText(stripHtml(c.content ?? ""), 88)) {
          drawLine(`  ${line}`);
        }
      }
    }

    if (accuseDoc) {
      y -= 10;
      drawLine("— Accusé de réception du courrier sortant —", true);
      drawLine(`Fichier : ${accuseDoc.file_name ?? accuseDoc.storage_path}`);
      drawLine(`Déposé à l'étape ${accuseDoc.step_number}`);
    }

    const pdfBytes = await pdfDoc.save();
    const fileName = `${sanitizeFileName(mail.sender_name)}_${mail.reference_number}.pdf`;
    const storagePath = `${mailId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("ged-documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    let generatedBy: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token !== supabaseServiceKey) {
        const { data: userData } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        }).auth.getUser(token);
        generatedBy = userData?.user?.id ?? null;
      }
    }

    const { data: gedRow, error: insertError } = await supabase
      .from("ged_documents")
      .insert({
        mail_id: mailId,
        reference_number: mail.reference_number,
        sender_name: mail.sender_name,
        pdf_storage_path: storagePath,
        file_name: fileName,
        file_size_bytes: pdfBytes.byteLength,
        generated_by: generatedBy,
        metadata: {
          has_accuse: !!accuseDoc,
          contribution_count: contributions?.length ?? 0,
        },
      })
      .select("id, file_name, pdf_storage_path")
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, ged_document: gedRow }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
