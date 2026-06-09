import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickableUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

const MIN_SEARCH_LEN = 2;

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function userMatchesQuery(
  user: PickableUser,
  query: string,
  roleLabel?: (role: string) => string
): boolean {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;
  const haystack = [
    user.full_name,
    user.email,
    user.role && roleLabel ? roleLabel(user.role) : user.role,
  ]
    .filter(Boolean)
    .map((s) => normalizeForSearch(String(s)));
  return haystack.some((part) => part.includes(q));
}

type SearchableUserMultiSelectProps = {
  users: PickableUser[];
  selectedIds: string[];
  onToggle: (userId: string) => void;
  disabledIds?: string[];
  showRole?: boolean;
  roleLabel?: (role: string) => string;
  emptyMessage?: string;
  className?: string;
  listClassName?: string;
};

export function SearchableUserMultiSelect({
  users,
  selectedIds,
  onToggle,
  disabledIds = [],
  showRole = false,
  roleLabel,
  emptyMessage = "Aucun utilisateur",
  className,
  listClassName,
}: SearchableUserMultiSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (query.trim().length > 0 && query.trim().length < MIN_SEARCH_LEN) {
      return [];
    }
    if (!query.trim()) {
      return users;
    }
    return users.filter((u) => userMatchesQuery(u, query, roleLabel));
  }, [users, query, roleLabel]);

  const needsMoreChars = query.trim().length > 0 && query.trim().length < MIN_SEARCH_LEN;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher (min. 2 lettres) — nom, e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      {needsMoreChars && (
        <p className="text-xs text-muted-foreground">
          Saisissez au moins {MIN_SEARCH_LEN} caractères pour filtrer ({users.length} utilisateurs).
        </p>
      )}
      <div
        className={cn(
          "space-y-0.5 max-h-72 overflow-auto border rounded-lg p-2",
          listClassName
        )}
      >
        {users.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">{emptyMessage}</p>
        ) : needsMoreChars ? (
          <p className="text-xs text-muted-foreground p-2 text-center">
            Saisissez au moins {MIN_SEARCH_LEN} lettres pour filtrer la liste.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Aucun résultat pour « {query} »</p>
        ) : (
          filtered.map((u) => {
            const disabled = disabledIds.includes(u.id);
            return (
              <label
                key={u.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Checkbox
                  checked={selectedIds.includes(u.id)}
                  onCheckedChange={() => !disabled && onToggle(u.id)}
                  disabled={disabled}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || u.email || "Sans nom"}</p>
                  {showRole && u.role && roleLabel && (
                    <p className="text-xs text-muted-foreground">{roleLabel(u.role)}</p>
                  )}
                  {u.email && u.full_name && (
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-xs text-muted-foreground">{selectedIds.length} personne(s) sélectionnée(s)</p>
      )}
    </div>
  );
}

type SearchableUserSingleSelectProps = {
  users: PickableUser[];
  value: string;
  onValueChange: (userId: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchableUserSingleSelect({
  users,
  value,
  onValueChange,
  placeholder = "Choisir un utilisateur",
  className,
}: SearchableUserSingleSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (query.trim().length > 0 && query.trim().length < MIN_SEARCH_LEN) {
      return [];
    }
    if (!query.trim()) {
      return users;
    }
    return users.filter((u) => userMatchesQuery(u, query));
  }, [users, query]);

  const needsMoreChars = query.trim().length > 0 && query.trim().length < MIN_SEARCH_LEN;
  const selected = users.find((u) => u.id === value);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher (min. 2 lettres)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      {selected && !query && (
        <p className="text-xs text-muted-foreground">
          Sélectionné : <strong>{selected.full_name || selected.email}</strong>
        </p>
      )}
      {needsMoreChars && (
        <p className="text-xs text-muted-foreground">
          Saisissez au moins {MIN_SEARCH_LEN} caractères ({users.length} utilisateurs).
        </p>
      )}
      <div className="max-h-56 overflow-auto border rounded-lg p-1">
        {needsMoreChars ? (
          <p className="text-xs text-muted-foreground p-2 text-center">
            Saisissez au moins {MIN_SEARCH_LEN} lettres pour filtrer.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Aucun résultat</p>
        ) : (
          filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onValueChange(u.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors",
                value === u.id && "bg-primary/10 font-medium"
              )}
            >
              <span className="block truncate">{u.full_name || u.email}</span>
              {u.email && u.full_name && (
                <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
