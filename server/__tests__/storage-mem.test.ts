import { describe, it, expect } from "vitest";
import { MemStorage } from "../storage";

describe("MemStorage — previously-stubbed domains", () => {
  describe("person profiles", () => {
    it("create + get + update + delete + list round-trips", async () => {
      const s = new MemStorage();
      const created = await s.createPersonProfile({
        description: "Tall man with a red jacket",
        name: "Alice",
      });
      expect(created.id).toBeTruthy();
      expect(await s.getPersonProfile(created.id)).toEqual(created);
      expect((await s.getPersonProfiles()).length).toBe(1);

      const updated = await s.updatePersonProfile(created.id, { nickname: "A" });
      expect(updated?.nickname).toBe("A");
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

      expect(await s.deletePersonProfile(created.id)).toBe(true);
      expect(await s.getPersonProfile(created.id)).toBeUndefined();
    });

    it("findSimilarPersons matches on description tokens, ranked by match count", async () => {
      const s = new MemStorage();
      await s.createPersonProfile({ description: "Tall man wearing a red jacket" });
      await s.createPersonProfile({ description: "Short woman with a blue hat" });
      await s.createPersonProfile({ description: "Tall woman with a red scarf" });

      const matches = await s.findSimilarPersons("tall red", null);
      expect(matches.length).toBe(2);
      // The "Tall man wearing a red jacket" matches both tokens; should rank first.
      expect(matches[0].description).toMatch(/Tall man/);
    });
  });

  describe("animal profiles", () => {
    it("CRUD + species filter via findSimilarAnimals", async () => {
      const s = new MemStorage();
      const dog = await s.createAnimalProfile({
        species: "dog",
        description: "Brown labrador",
      });
      await s.createAnimalProfile({ species: "cat", description: "Black cat" });

      expect((await s.getAnimalProfiles()).length).toBe(2);
      const dogs = await s.findSimilarAnimals("brown", "dog");
      expect(dogs.length).toBe(1);
      expect(dogs[0].id).toBe(dog.id);
    });
  });

  describe("vehicles", () => {
    it("CRUD + getVehiclesByPerson filter", async () => {
      const s = new MemStorage();
      const owner = await s.createPersonProfile({ description: "owner" });
      const v1 = await s.createVehicle({
        vehicleType: "sedan",
        description: "Blue sedan",
        personId: owner.id,
      });
      await s.createVehicle({
        vehicleType: "truck",
        description: "Red truck",
        personId: null,
      });

      expect((await s.getVehicles()).length).toBe(2);
      const owned = await s.getVehiclesByPerson(owner.id);
      expect(owned.map((v) => v.id)).toEqual([v1.id]);
    });
  });

  describe("recognition events", () => {
    it("createRecognitionEvent and recent ordering", async () => {
      const s = new MemStorage();
      const e1 = await s.createRecognitionEvent({
        detectionId: "d1",
        cameraId: "c1",
        entityType: "person",
        entityId: "p1",
        confidence: 0.9,
        matchingMethod: "description",
      });
      // Force a 2ms delay to ensure ordering
      await new Promise((r) => setTimeout(r, 2));
      const e2 = await s.createRecognitionEvent({
        detectionId: "d2",
        cameraId: "c2",
        entityType: "person",
        entityId: "p2",
        confidence: 0.8,
        matchingMethod: "description",
      });

      const recent = await s.getRecentRecognitionEvents(5);
      expect(recent.map((e) => e.id)).toEqual([e2.id, e1.id]);

      const cam1 = await s.getRecognitionEvents("c1");
      expect(cam1.map((e) => e.id)).toEqual([e1.id]);
    });
  });

  describe("daily summaries", () => {
    it("createDailySummary + getLatestDailySummary + getDailySummary by date", async () => {
      const s = new MemStorage();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const today = new Date();
      await s.createDailySummary({ date: yesterday, summary: "yesterday" });
      const t = await s.createDailySummary({ date: today, summary: "today" });

      const latest = await s.getLatestDailySummary();
      expect(latest?.id).toBe(t.id);

      const found = await s.getDailySummary(today);
      expect(found?.id).toBe(t.id);
    });
  });
});
