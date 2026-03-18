import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";

interface MailEditDialogProps {
  mail: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function MailEditDialog({ mail, open, onOpenChange, onSaved }: MailEditDialogProps) {
  const [form, setForm] = useState({
    subject: mail?.subject || "",
    sender_name: mail?.sender_name || "",
    sender_organization: mail?.sender_organization || "",
    priority: mail?.priority || "normal",
    mail_type: mail?.mail_type || "",
    addressed_to: mail?.addressed_to || "",
    description: mail?.description || "",
    comments: mail?.comments || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("mails").update({
      subject: form.subject,
      sender_name: form.sender_name,
      sender_organization: form.sender_organization || null,
      priority: form.priority as any,
      mail_type: form.mail_type || null,
      addressed_to: form.addressed_to || null,
      description: form.description || null,
      comments: form.comments || null,
    }).eq("id", mail.id);

    setSaving(false);
    if (error) {
      toast.error("Erreur: " + error.message);
    } else {
      toast.success("Courrier modifié avec succès");
      onOpenChange(false);
      onSaved();
    }
  };

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Modifier le courrier — {mail?.reference_number}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Objet</Label>
            <Input value={form.subject} onChange={e => update("subject", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Expéditeur</Label>
              <Input value={form.sender_name} onChange={e => update("sender_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Organisation</Label>
              <Input value={form.sender_organization} onChange={e => update("sender_organization", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select value={form.priority} onValueChange={v => update("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Faible</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Élevée</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destinataire</Label>
              <Input value={form.addressed_to} onChange={e => update("addressed_to", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => update("description", e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Commentaires</Label>
            <Textarea value={form.comments} onChange={e => update("comments", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sauvegarder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MailDeleteDialogProps {
  mail: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function MailDeleteDialog({ mail, open, onOpenChange, onDeleted }: MailDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    // Delete related records first
    await supabase.from("mail_assignments").delete().eq("mail_id", mail.id);
    await supabase.from("workflow_transitions").delete().eq("mail_id", mail.id);
    await supabase.from("notifications").delete().eq("mail_id", mail.id);
    await supabase.from("mail_processing_history").delete().eq("mail_id", mail.id);
    
    const { error } = await supabase.from("mails").delete().eq("id", mail.id);
    setDeleting(false);
    if (error) {
      toast.error("Erreur suppression: " + error.message);
    } else {
      toast.success("Courrier supprimé définitivement");
      onOpenChange(false);
      onDeleted();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce courrier ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Le courrier <strong>{mail?.reference_number}</strong> ({mail?.subject}) 
            et tout son historique seront supprimés définitivement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
