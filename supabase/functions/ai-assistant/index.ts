import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchAttachmentAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Manual base64 encoding for Deno
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, subject, description, senderName, attachmentUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompts: Record<string, string> = {
      note_technique: `Tu es un conseiller juridique ministériel. Rédige une note technique professionnelle en français basée sur le courrier fourni et son document joint s'il y en a. Structure: Objet, Contexte, Analyse, Recommandations, Conclusion. Sois concis et formel. Appuie-toi sur le contenu exact du document joint pour être précis.`,
      accuse_reception: `Tu es un secrétaire de cabinet ministériel. Rédige un accusé de réception formel en français pour le courrier fourni. Utilise les informations du document joint s'il y en a pour personnaliser la réponse. Inclus: référence, date, confirmation de réception, prochaines étapes. Ton diplomatique et professionnel.`,
      resume: `Tu es un assistant ministériel. Résume le contenu du courrier et de son document joint en détail en français. Identifie les points d'action principaux, les demandes clés et les éléments importants du document.`,
    };

    const systemPrompt = systemPrompts[type] || systemPrompts.resume;

    const textContent = `Courrier reçu:
- Expéditeur: ${senderName || "Non spécifié"}
- Objet: ${subject || "Non spécifié"}
- Contenu/Description: ${description || "Aucune description fournie"}

${attachmentUrl ? "Un document est joint à ce courrier (voir ci-dessous). Analyse-le en profondeur pour ta réponse." : "Aucune pièce jointe."}

Génère le document demandé.`;

    // Build message content - multimodal if attachment exists
    let userMessage: any;

    if (attachmentUrl) {
      const attachment = await fetchAttachmentAsBase64(attachmentUrl);
      
      if (attachment) {
        const supportedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        const supportedDocTypes = ["application/pdf"];
        
        if (supportedImageTypes.includes(attachment.mimeType)) {
          // Image: send as image_url
          userMessage = {
            role: "user",
            content: [
              { type: "text", text: textContent },
              { 
                type: "image_url", 
                image_url: { 
                  url: `data:${attachment.mimeType};base64,${attachment.base64}` 
                } 
              },
            ],
          };
        } else if (supportedDocTypes.includes(attachment.mimeType)) {
          // PDF: send as image_url with PDF mime type (Gemini supports this)
          userMessage = {
            role: "user",
            content: [
              { type: "text", text: textContent },
              {
                type: "image_url",
                image_url: {
                  url: `data:${attachment.mimeType};base64,${attachment.base64}`
                }
              },
            ],
          };
        } else {
          // Unsupported type: text only with note
          userMessage = {
            role: "user",
            content: textContent + "\n\n(Note: le document joint est dans un format non analysable automatiquement.)",
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          userMessage,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez plus tard." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA insuffisants." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Aucune réponse générée.";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
