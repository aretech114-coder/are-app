import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Clock, MapPin, Users, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface CalendarEvent {
  id: string;
  mail_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  participants: string[] | null;
  participant_ids: string[] | null;
  created_by: string;
  created_at: string;
}

interface CreatorProfile {
  id: string;
  full_name: string;
}

export default function ReunionsPage() {
  const { user, role } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [creators, setCreators] = useState<Record<string, string>>({});
  const [mailSubjects, setMailSubjects] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    // RLS handles visibility automatically
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .order("event_date", { ascending: true }) as any;

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const evts = (data || []) as CalendarEvent[];
    setEvents(evts);

    // Fetch creator profiles
    const creatorIds = [...new Set(evts.map(e => e.created_by))];
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", creatorIds);
      if (profiles) {
        const map: Record<string, string> = {};
        profiles.forEach((p: CreatorProfile) => { map[p.id] = p.full_name; });
        setCreators(map);
      }
    }

    // Fetch mail subjects for linked mails
    const mailIds = [...new Set(evts.filter(e => e.mail_id).map(e => e.mail_id!))];
    if (mailIds.length > 0) {
      const { data: mails } = await supabase
        .from("mails")
        .select("id, subject, reference_number")
        .in("id", mailIds);
      if (mails) {
        const map: Record<string, string> = {};
        mails.forEach((m: any) => { map[m.id] = `${m.reference_number} — ${m.subject}`; });
        setMailSubjects(map);
      }
    }

    setLoading(false);
  };

  const filtered = events.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.description?.toLowerCase().includes(search.toLowerCase()) ||
    e.location?.toLowerCase().includes(search.toLowerCase()) ||
    e.participants?.some(p => p.toLowerCase().includes(search.toLowerCase()))
  );

  const today = new Date();
  const upcoming = filtered.filter(e => new Date(e.event_date) >= new Date(today.toISOString().split("T")[0]));
  const past = filtered.filter(e => new Date(e.event_date) < new Date(today.toISOString().split("T")[0]));

  const isLeader = role === "ministre" || role === "dircab" || role === "superadmin" || role === "admin";

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Réunions & RDV
        </h1>
        <p className="page-description">
          {isLeader
            ? "Vue complète de toutes les réunions planifiées"
            : "Vos réunions et rendez-vous programmés"}
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par titre, lieu ou participant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Chargement des réunions...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Aucune réunion trouvée</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
                À venir ({upcoming.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {upcoming.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    creatorName={creators[event.created_by]}
                    mailSubject={event.mail_id ? mailSubjects[event.mail_id] : undefined}
                    isUpcoming
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Passées ({past.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {past.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    creatorName={creators[event.created_by]}
                    mailSubject={event.mail_id ? mailSubjects[event.mail_id] : undefined}
                    isUpcoming={false}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  creatorName,
  mailSubject,
  isUpcoming,
}: {
  event: CalendarEvent;
  creatorName?: string;
  mailSubject?: string;
  isUpcoming: boolean;
}) {
  const eventDate = new Date(event.event_date);
  const isToday = new Date().toISOString().split("T")[0] === event.event_date;

  return (
    <Card className={`transition-all hover:shadow-md ${isUpcoming ? "border-primary/20" : "opacity-70"} ${isToday ? "ring-2 ring-primary/40" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{event.title}</CardTitle>
          {isToday && <Badge className="shrink-0 bg-primary text-primary-foreground text-[10px]">Aujourd'hui</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{format(eventDate, "EEEE dd MMMM yyyy", { locale: fr })}</span>
        </div>

        {(event.event_time || event.end_time) && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>
              {event.event_time && event.event_time.substring(0, 5)}
              {event.end_time && ` — ${event.end_time.substring(0, 5)}`}
            </span>
          </div>
        )}

        {event.location && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{event.location}</span>
          </div>
        )}

        {event.participants && event.participants.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3 w-3" />
              Participants ({event.participants.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {event.participants.map((p, i) => (
                <Badge key={i} variant="secondary" className="text-[11px] font-normal">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {event.description && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
          </>
        )}

        {mailSubject && (
          <div className="flex items-start gap-1.5 text-xs text-primary/80 bg-primary/5 rounded p-2">
            <FileText className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{mailSubject}</span>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60">
          Créé par {creatorName || "—"}
        </p>
      </CardContent>
    </Card>
  );
}
