import { Mail } from "lucide-react";
import { EmailNotificationTester } from "@/components/admin/EmailNotificationTester";

export default function NotificationsTestPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          Test notifications e-mail
        </h1>
        <p className="page-description">
          Vérifiez que Resend (ou SMTP) délivre bien les e-mails aux utilisateurs du workflow.
        </p>
      </div>
      <EmailNotificationTester />
    </div>
  );
}
