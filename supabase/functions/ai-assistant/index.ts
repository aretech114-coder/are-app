// Auto-deployed via GitHub Actions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchAttachmentAsBase64(
  url: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return { base64, mimeType: contentType.split(";")[0].trim() };
  } catch (e) {
    console.error("Failed to fetch attachment:", e);
    return null;
  }
}

const SYSTEM_PROMPTS: Record<string, string> = {
  note_technique: `Tu es un conseiller juridique. Rédige une note technique professionnelle en français. Structure: Objet, Contexte, Analyse, Recommandations, Conclusion. Sois concis et formel.`,
  accuse_reception: `Tu es un secrétaire de direction. Rédige un accusé de réception ou un texte d'accueil formel en français. Inclus référence, date, confirmation de réception et prochaines étapes. Ton professionnel et courtois.`,
  resume: `Tu es un assistant administratif. Résume le courrier et son contexte en français. Identifie les points d'action et demandes clés.`,
  note_orientation: `Tu es le Directeur général ou son cabinet. Rédige une note d'orientation concise en français pour orienter le traitement du courrier: enjeux, priorité, instructions aux équipes.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      type,
      contextStep,
      subject,
      description,
      senderName,
      attachmentUrl,
      workflowHistory,
      aiDraft,
    } = await req.json();

    if (attachmentUrl && !attachmentUrl.startsWith(supabaseUrl + "/storage/")) {
      return new Response(JSON.stringify({ error: "URL de pièce jointe non autorisée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({
          error:
            "OPENAI_API_KEY non configurée. Exécutez: supabase secrets set OPENAI_API_KEY=sk-... puis redéployez ai-assistant.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.resume;

    const textContent = `Courrier reçu:
- Expéditeur: ${senderName || "Non spécifié"}
- Objet: ${subject || "Non spécifié"}
- Contenu/Description: ${description || "Aucune description fournie"}
${contextStep ? `- Étape workflow courante: ${contextStep}` : ""}

${workflowHistory ? `--- HISTORIQUE WORKFLOW ---\n${workflowHistory}\n--- FIN ---` : ""}

${aiDraft ? `--- TRAITEMENTS / BROUILLONS ---\n${aiDraft}\n--- FIN ---` : ""}

${attachmentUrl ? "Un document est joint (analyse-le si possible)." : "Aucune pièce jointe."}

Génère le document demandé en tenant compte du contexte.`;

    type ChatMessage = { role: string; content: string | unknown[] };
    let userMessage: ChatMessage;

    if (attachmentUrl) {
      const attachment = await fetchAttachmentAsBase64(attachmentUrl);

      if (attachment) {
        const supportedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (supportedImageTypes.includes(attachment.mimeType)) {
          userMessage = {
            role: "user",
            content: [
              { type: "text", text: textContent },
              {
                type: "image_url",
                image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64}` },
              },
            ],
          };
        } else {
          userMessage = {
            role: "user",
            content:
              textContent +
              "\n\n(Note: le document joint n'est pas une image analysable par le modèle.)",
          };
        }
      } else {
        userMessage = {
          role: "user",
          content: textContent + "\n\n(Note: impossible de récupérer le document joint.)",
        };
      }
    } else {
      userMessage = { role: "user", content: textContent };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          userMessage,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes IA, réessayez plus tard." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: `Erreur OpenAI (${response.status}). Vérifiez la clé API et le modèle.` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Aucune réponse générée.";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
