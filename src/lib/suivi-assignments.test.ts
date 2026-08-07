import { describe, expect, it } from "vitest";
import {
  buildAssigneeViewsForMail,
  resolveDisplayStep,
} from "@/lib/suivi-assignments";

describe("suivi-assignments", () => {
  const profiles = new Map([
    ["u1", "Soraya"],
    ["u2", "Aziz"],
    ["u3", "Moto"],
    ["dg", "DG Test"],
  ]);

  it("prioritise les assignés étape 4 même si le courrier est encore à l'étape 2", () => {
    const assignments = [
      {
        id: "a1",
        mail_id: "m1",
        assigned_to: "dg",
        step_number: 2,
        access_mode: "contributor",
        status: "pending",
        created_at: "2026-06-01T10:00:00Z",
        completed_at: null,
      },
      {
        id: "a2",
        mail_id: "m1",
        assigned_to: "u1",
        step_number: 4,
        access_mode: "contributor",
        status: "proposed",
        created_at: "2026-06-08T10:00:00Z",
        completed_at: null,
      },
      {
        id: "a3",
        mail_id: "m1",
        assigned_to: "u2",
        step_number: 4,
        access_mode: "contributor",
        status: "proposed",
        created_at: "2026-06-08T11:00:00Z",
        completed_at: null,
      },
    ];

    expect(resolveDisplayStep(2, assignments)).toBe(4);

    const rows = buildAssigneeViewsForMail(
      { id: "m1", current_step: 2, assigned_agent_id: "dg" },
      assignments,
      [],
      profiles,
      { 4: 48 },
      Date.parse("2026-06-08T12:00:00Z")
    );

    expect(rows.map((r) => r.full_name)).toEqual(["Soraya", "Aziz"]);
    expect(rows.every((r) => r.treatment_label === "Proposé")).toBe(true);
  });

  it("fallback sur assigned_agent_id avec statut En retard si échéance dépassée", () => {
    const rows = buildAssigneeViewsForMail(
      {
        id: "m2",
        current_step: 2,
        assigned_agent_id: "dg",
        deadline_at: "2026-06-01T17:00:00Z",
      },
      [],
      [],
      profiles,
      { 2: 48 },
      Date.parse("2026-06-08T12:00:00Z")
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe("DG Test");
    expect(rows[0].treatment_label).toBe("En retard");
    expect(rows[0].is_overdue).toBe(true);
  });
});
