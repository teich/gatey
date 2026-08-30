import { beforeEach, describe, expect, it } from "vitest";
import { database } from "@/lib/database";
import { listAccessActivity } from "@/lib/access-history";
import { unifiAccessEvents, unifiServiceAccounts } from "@/lib/schema";

function addEvent(input: { id: string; actorId: string; actorName: string; actorType: string }) {
  database.insert(unifiAccessEvents).values({
    id: input.id,
    occurredAt: "2026-08-29T12:00:00.000Z",
    actorControllerId: input.actorId,
    actorDisplayName: input.actorName,
    actorType: input.actorType,
    credentialProvider: "REMOTE_THROUGH_UAH",
    eventType: "access.door.unlock",
    result: "ACCESS",
    doorId: "gate-1",
    doorName: "Gate",
    receivedAt: "2026-08-29T12:00:01.000Z",
  }).run();
}

describe("access activity service accounts", () => {
  beforeEach(() => {
    database.delete(unifiAccessEvents).run();
    database.delete(unifiServiceAccounts).run();
    database.insert(unifiServiceAccounts).values({
      controllerUserId: "inventory-user-1",
      label: "Home Assistant",
      markedAt: "2026-08-29T11:00:00.000Z",
      markedByUserId: "admin-1",
      markedByName: "Admin",
    }).run();
  });

  it("recognizes a service account by its inventory user ID", () => {
    addEvent({ id: "event-1", actorId: "inventory-user-1", actorName: "Different log label", actorType: "user" });

    expect(listAccessActivity()).toEqual([
      expect.objectContaining({ id: "event-1", actorKind: "service_account", actorName: "Home Assistant", attributable: true }),
    ]);
  });

  it("recognizes an open API actor by service-account label when UniFi uses a different ID", () => {
    addEvent({ id: "event-1", actorId: "open-api-client-1", actorName: " home assistant ", actorType: "open_api" });

    expect(listAccessActivity()).toEqual([
      expect.objectContaining({ id: "event-1", actorKind: "service_account", actorName: "Home Assistant", attributable: true }),
    ]);
  });

  it("does not classify a same-named resident actor as a service account", () => {
    addEvent({ id: "event-1", actorId: "resident-1", actorName: "Home Assistant", actorType: "user" });

    expect(listAccessActivity()).toEqual([
      expect.objectContaining({ id: "event-1", actorKind: "other", actorName: "Home Assistant", attributable: false }),
    ]);
  });
});
