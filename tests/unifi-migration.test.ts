import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateVisitorGateCode } from "@/lib/unifi-access";

type Envelope = { code: string; data?: unknown; msg?: string };

function response(envelope: Envelope, status = 200) {
  return Response.json(envelope, { status });
}

const input = {
  oldVisitorId: "visitor-old",
  householdName: "Home A",
  label: "Gardener",
  pin: "2468",
  startsAt: new Date("2026-08-29T19:00:00.000Z"),
  endsAt: new Date("2040-01-01T00:00:00.000Z"),
};

describe("UniFi visitor PIN migration", () => {
  beforeEach(() => {
    process.env.GATEY_UNIFI_WRITES = "true";
    process.env.UNIFI_HOST = "controller.test";
    process.env.UNIFI_ACCESS_API_TOKEN = "token";
    process.env.UNIFI_DOOR_NAME = "Gate";
    delete process.env.UNIFI_INSECURE_TLS;
  });

  afterEach(() => vi.unstubAllGlobals());

  function mockResponses(...responses: Response[]) {
    const fetchMock = vi.fn();
    for (const item of responses) fetchMock.mockResolvedValueOnce(item);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const door = () => response({ code: "SUCCESS", data: [{ id: "door-1", name: "Gate", type: "door" }] });
  const visitor = () => response({ code: "SUCCESS", data: { id: "visitor-new" } });
  const ok = () => response({ code: "SUCCESS", data: null });
  const failed = (message: string) => response({ code: "FAILED", msg: message }, 500);

  it("moves the PIN, persists the new visitor, then archives the old one", async () => {
    const fetchMock = mockResponses(door(), visitor(), ok(), ok(), ok());
    const persist = vi.fn(() => "saved");

    await expect(migrateVisitorGateCode(input, persist)).resolves.toEqual({
      visitorId: "visitor-new",
      persisted: "saved",
    });

    expect(persist).toHaveBeenCalledWith("visitor-new");
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), (init as RequestInit).method])).toEqual([
      [expect.stringContaining("/doors"), undefined],
      [expect.stringContaining("/visitors"), "POST"],
      [expect.stringContaining("/visitors/visitor-old/pin_codes"), "DELETE"],
      [expect.stringContaining("/visitors/visitor-new/pin_codes"), "PUT"],
      [expect.stringContaining("/visitors/visitor-old"), "DELETE"],
    ]);
  });

  it("restores the original PIN if assigning it to the replacement fails", async () => {
    const fetchMock = mockResponses(door(), visitor(), ok(), failed("PIN collision"), ok(), ok(), ok());

    await expect(migrateVisitorGateCode(input, vi.fn())).rejects.toThrow("PIN collision");

    const calls = fetchMock.mock.calls;
    expect(String(calls.at(-1)?.[0])).toContain("/visitors/visitor-old/pin_codes");
    expect((calls.at(-1)?.[1] as RequestInit).method).toBe("PUT");
  });

  it("rolls the controller back if local persistence fails", async () => {
    const fetchMock = mockResponses(door(), visitor(), ok(), ok(), ok(), ok(), ok());

    await expect(migrateVisitorGateCode(input, () => {
      throw new Error("database full");
    })).rejects.toThrow("database full");

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("/visitors/visitor-old/pin_codes");
  });

  it("keeps a durable replacement successful when archiving the old visitor fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockResponses(door(), visitor(), ok(), ok(), failed("cleanup unavailable"));

    await expect(migrateVisitorGateCode(input, () => "saved")).resolves.toMatchObject({ persisted: "saved" });
    expect(errorSpy).toHaveBeenCalledWith(
      "UniFi could not archive the migrated visitor",
      expect.objectContaining({ oldVisitorId: "visitor-old" }),
    );
  });

  it("reports when rollback cannot restore the original PIN", async () => {
    mockResponses(door(), visitor(), ok(), failed("replacement rejected"), ok(), ok(), failed("restore rejected"));

    await expect(migrateVisitorGateCode(input, vi.fn())).rejects.toThrow(
      "Migration failed and UniFi could not restore the original PIN: restore rejected",
    );
  });
});
