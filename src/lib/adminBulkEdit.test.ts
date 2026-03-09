import {
  buildBulkEditAddedMovement,
  buildBulkEditRemovedMovement,
  buildBulkEditShiftPayload,
  buildBulkEditStatusNotes,
  buildBulkShiftUpdatePayload,
  collectBulkApplyTargetShifts,
  createBulkEditDrafts,
  findInvalidBulkAssigneeShift,
  getBulkApplyEffectiveTimes,
  getBulkEditAssignmentMode,
  hasBulkApplyChanges,
  normalizeBulkEditAssignmentChoice,
} from "@/lib/adminBulkEdit";

describe("adminBulkEdit helpers", () => {
  it("detects when bulk apply has meaningful changes", () => {
    expect(
      hasBulkApplyChanges({
        title: "  ",
        start_time: "",
        end_time: "",
        base_value: "",
        assigned_user_id: "",
      }),
    ).toBe(false);

    expect(
      hasBulkApplyChanges({
        title: "Novo titulo",
        start_time: "",
        end_time: "",
        base_value: "",
        assigned_user_id: "",
      }),
    ).toBe(true);
  });

  it("builds the bulk shift payload with only filled fields", () => {
    expect(
      buildBulkShiftUpdatePayload(
        {
          title: " Plantao Diurno ",
          start_time: "07:00",
          end_time: "",
        },
        "admin-1",
      ),
    ).toEqual({
      updated_by: "admin-1",
      title: "Plantao Diurno",
      start_time: "07:00",
    });
  });

  it("creates draft rows for bulk edit", () => {
    const drafts = createBulkEditDrafts(
      [
        {
          id: "shift-1",
          hospital: "Hospital A",
          location: null,
          start_time: "07:00:00",
          end_time: "19:00:00",
          base_value: 1200,
          notes: null,
          sector_id: "sector-1",
        },
      ],
      (value) => String(value ?? ""),
    );

    expect(drafts).toEqual([
      {
        id: "shift-1",
        hospital: "Hospital A",
        location: "",
        start_time: "07:00",
        end_time: "19:00",
        base_value: "1200",
        notes: "",
        sector_id: "sector-1",
        assigned_user_id: "__keep__",
      },
    ]);
  });

  it("collects selected shifts and preserves only existing ids", () => {
    const result = collectBulkApplyTargetShifts(
      ["a", "missing", "b"],
      [
        { id: "a", sector_id: "s1", start_time: "07:00:00", end_time: "19:00:00" },
        { id: "b", sector_id: "s2", start_time: "19:00:00", end_time: "07:00:00" },
      ],
    );

    expect(result.selected).toHaveLength(2);
    expect(result.byId.get("a")?.sector_id).toBe("s1");
    expect(result.byId.has("missing")).toBe(false);
  });

  it("finds invalid assignee shifts by sector membership", () => {
    const invalid = findInvalidBulkAssigneeShift(
      [
        { sector_id: "sector-1" },
        { sector_id: "sector-2" },
      ],
      "user-1",
      (_userId, sectorId) => sectorId === "sector-1",
    );

    expect(invalid).toEqual({ sector_id: "sector-2" });
  });

  it("computes effective times for bulk apply", () => {
    expect(
      getBulkApplyEffectiveTimes(
        { start_time: "", end_time: "20:00" },
        { start_time: "07:00:00", end_time: "19:00:00" },
      ),
    ).toEqual({
      start_time: "07:00",
      end_time: "20:00",
    });
  });

  it("normalizes and classifies assignment choices", () => {
    expect(normalizeBulkEditAssignmentChoice("")).toBe("__keep__");
    expect(getBulkEditAssignmentMode("__keep__")).toBe("keep");
    expect(getBulkEditAssignmentMode("disponivel")).toBe("available");
    expect(getBulkEditAssignmentMode("vago")).toBe("vacant");
    expect(getBulkEditAssignmentMode("user-1")).toBe("user");
  });

  it("builds bulk edit payloads and status notes", () => {
    expect(
      buildBulkEditShiftPayload({
        data: {
          hospital: "Hospital B",
          location: "",
          start_time: "08:00",
          end_time: "20:00",
          base_value: "1500",
          notes: "Obs",
          sector_id: "sector-9",
        },
        updatedBy: "admin-2",
        title: "Plantao 12h",
        resolvedBaseValue: 1500,
      }),
    ).toEqual({
      hospital: "Hospital B",
      location: null,
      start_time: "08:00",
      end_time: "20:00",
      base_value: 1500,
      notes: "Obs",
      sector_id: "sector-9",
      title: "Plantao 12h",
      updated_by: "admin-2",
    });

    expect(buildBulkEditStatusNotes(" Observacao ", "disponivel")).toBe("[DISPONÍVEL] Observacao");
    expect(buildBulkEditStatusNotes("", "vago")).toBe("[VAGO]");
  });

  it("builds movement payloads for added and removed assignments", () => {
    const removed = buildBulkEditRemovedMovement({
      tenantId: "tenant-1",
      userId: "user-1",
      userName: "Maria",
      assignmentId: "asg-1",
      performedBy: "admin-1",
      source: {
        shift_date: "2026-03-09",
        start_time: "07:00:00",
        end_time: "19:00:00",
        sector_id: "sector-1",
        hospital: "Hospital A",
      },
      sourceSectorName: "UTI",
      reason: "Substituida",
    });

    const added = buildBulkEditAddedMovement({
      tenantId: "tenant-1",
      userId: "user-2",
      userName: "Joao",
      performedBy: "admin-1",
      destination: {
        shift_date: "2026-03-09",
        start_time: "07:00:00",
        end_time: "19:00:00",
        sector_id: "sector-2",
        hospital: "Hospital B",
      },
      destinationSectorName: "Centro Cirurgico",
    });

    expect(removed).toMatchObject({
      tenant_id: "tenant-1",
      user_id: "user-1",
      movement_type: "removed",
      source_shift_time: "07:00-19:00",
      source_assignment_id: "asg-1",
      source_sector_name: "UTI",
    });

    expect(added).toMatchObject({
      tenant_id: "tenant-1",
      user_id: "user-2",
      movement_type: "added",
      destination_shift_time: "07:00-19:00",
      destination_sector_name: "Centro Cirurgico",
    });
  });
});
