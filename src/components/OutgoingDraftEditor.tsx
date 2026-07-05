import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FileDown,
  Italic,
  Printer,
  Save,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { printWithLetterhead } from "@/lib/print-letterhead";
import { exportOutgoingDraftDocx } from "@/lib/export-outgoing-docx";

interface Props {
  mailId: string;
  initialHtml?: string | null;
  initialPlain?: string | null;
  referenceNumber?: string | null;
  onSaved?: (html: string) => void;
}

export function OutgoingDraftEditor({
  mailId,
  initialHtml,
  initialPlain,
  referenceNumber,
  onSaved,
}: Props) {
  const { settings } = useSiteSettings();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: initialHtml || (initialPlain ? `<p>${initialPlain.replace(/\n/g, "</p><p>")}</p>` : ""),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[200px] p-3 border rounded-md focus:outline-none bg-background",
      },
    },
  });

  const saveDraft = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const { error } = await supabase
      .from("mails")
      .update({ outgoing_draft_html: html } as Record<string, unknown>)
      .eq("id", mailId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Brouillon enregistré");
    onSaved?.(html);
  };

  const handlePrint = () => {
    if (!editor) return;
    printWithLetterhead(editor.getHTML(), {
      siteTitle: settings.site_title,
      siteSubtitle: settings.site_subtitle,
      sidebarLogoUrl: settings.sidebar_logo_url,
    }, {
      referenceNumber: referenceNumber || undefined,
      title: settings.site_title,
    });
  };

  const handleExportWord = async () => {
    if (!editor) return;
    const ref = referenceNumber || mailId.slice(0, 8);
    await exportOutgoingDraftDocx(editor.getHTML(), `courrier_${ref}.docx`);
    toast.success("Export Word téléchargé");
  };

  if (!editor) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 border rounded-md p-1 bg-muted/30">
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="h-4 w-4" />
        </Button>
      </div>

      <EditorContent editor={editor} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={saveDraft}>
          <Save className="h-3.5 w-3.5 mr-1" /> Enregistrer brouillon
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5 mr-1" /> Imprimer sur papier en-tête
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleExportWord}>
          <FileDown className="h-3.5 w-3.5 mr-1" /> Exporter Word
        </Button>
      </div>
    </div>
  );
}
