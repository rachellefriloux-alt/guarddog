import { randomUUID } from "crypto";
import { 
  type Camera, type InsertCamera, 
  type Recording, type InsertRecording, 
  type Detection, type InsertDetection, 
  type CloudFile, type InsertCloudFile, 
  type PersonProfile, type InsertPersonProfile,
  type AnimalProfile, type InsertAnimalProfile,
  type Vehicle, type InsertVehicle,
  type RecognitionEvent, type InsertRecognitionEvent,
  type DailySummary, type InsertDailySummary,
  type SystemStats,
  cameras, recordings, detections, cloudFiles, 
  personProfiles, animalProfiles, vehicles, 
  recognitionEvents, dailySummaries
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, count } from "drizzle-orm";

export interface IStorage {
  // Camera operations
  getCameras(): Promise<Camera[]>;
  getCamera(id: string): Promise<Camera | undefined>;
  createCamera(camera: InsertCamera): Promise<Camera>;
  /**
   * Idempotent upsert keyed by an explicit id. Used by vendor sync (Ring,
   * eSeeCloud, ...) to mirror externally-managed cameras into the unified
   * `cameras` collection so they show up alongside generic RTSP cameras in
   * the dashboard, supervisor, and HLS streaming pipeline. Re-running sync
   * is safe: existing rows are updated in-place, preserving their `id` and
   * `createdAt`.
   */
  upsertCamera(id: string, camera: InsertCamera): Promise<Camera>;
  updateCamera(id: string, updates: Partial<InsertCamera>): Promise<Camera | undefined>;
  deleteCamera(id: string): Promise<boolean>;

  // Recording operations
  getRecordings(cameraId?: string): Promise<Recording[]>;
  getRecording(id: string): Promise<Recording | undefined>;
  createRecording(recording: InsertRecording): Promise<Recording>;
  updateRecording(id: string, updates: Partial<InsertRecording>): Promise<Recording | undefined>;
  deleteRecording(id: string): Promise<boolean>;

  // Detection operations
  getDetections(cameraId?: string): Promise<Detection[]>;
  getRecentDetections(limit?: number): Promise<Detection[]>;
  createDetection(detection: InsertDetection): Promise<Detection>;

  // Cloud file operations
  getCloudFiles(): Promise<CloudFile[]>;
  createCloudFile(file: InsertCloudFile): Promise<CloudFile>;
  deleteCloudFile(id: string): Promise<boolean>;

  // Person profile operations
  getPersonProfiles(): Promise<PersonProfile[]>;
  getPersonProfile(id: string): Promise<PersonProfile | undefined>;
  createPersonProfile(profile: InsertPersonProfile): Promise<PersonProfile>;
  updatePersonProfile(id: string, updates: Partial<InsertPersonProfile>): Promise<PersonProfile | undefined>;
  deletePersonProfile(id: string): Promise<boolean>;
  findSimilarPersons(description: string, physicalCharacteristics: any): Promise<PersonProfile[]>;

  // Animal profile operations
  getAnimalProfiles(): Promise<AnimalProfile[]>;
  getAnimalProfile(id: string): Promise<AnimalProfile | undefined>;
  createAnimalProfile(profile: InsertAnimalProfile): Promise<AnimalProfile>;
  updateAnimalProfile(id: string, updates: Partial<InsertAnimalProfile>): Promise<AnimalProfile | undefined>;
  deleteAnimalProfile(id: string): Promise<boolean>;
  findSimilarAnimals(description: string, species: string): Promise<AnimalProfile[]>;

  // Vehicle operations
  getVehicles(): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string): Promise<boolean>;
  getVehiclesByPerson(personId: string): Promise<Vehicle[]>;

  // Recognition event operations
  getRecognitionEvents(cameraId?: string): Promise<RecognitionEvent[]>;
  getRecentRecognitionEvents(limit?: number): Promise<RecognitionEvent[]>;
  createRecognitionEvent(event: InsertRecognitionEvent): Promise<RecognitionEvent>;

  // Daily summary operations
  getDailySummaries(limit?: number): Promise<DailySummary[]>;
  getDailySummary(date: Date): Promise<DailySummary | undefined>;
  createDailySummary(summary: InsertDailySummary): Promise<DailySummary>;
  getLatestDailySummary(): Promise<DailySummary | undefined>;

  // System stats
  getSystemStats(): Promise<SystemStats>;
}

export class MemStorage implements IStorage {
  private cameras: Map<string, Camera> = new Map();
  private recordings: Map<string, Recording> = new Map();
  private detections: Map<string, Detection> = new Map();
  private cloudFiles: Map<string, CloudFile> = new Map();
  private personProfiles: Map<string, PersonProfile> = new Map();
  private animalProfiles: Map<string, AnimalProfile> = new Map();
  private vehicles: Map<string, Vehicle> = new Map();
  private recognitionEvents: Map<string, RecognitionEvent> = new Map();
  private dailySummaries: Map<string, DailySummary> = new Map();

  constructor() {
    // Seed demo data only in DEMO_MODE — keeps real deployments clean.
    if ((process.env.DEMO_MODE || "").toLowerCase() === "true") {
      this.initializeMockData();
    }
  }

  private initializeMockData() {
    // Initialize with some cameras
    const mockCameras: Camera[] = [
      {
        id: "1",
        name: "Front Door",
        type: "ring",
        ipAddress: "192.168.1.101",
        port: "554",
        streamUrl: "rtsp://192.168.1.101:554/stream",
        username: "admin",
        password: "password",
        location: "front_door",
        resolution: "1080p",
        isOnline: true,
        wifiStrength: 95,
        aiDetectionEnabled: true,
        detectPeople: true,
        detectPets: false,
        detectVehicles: false,
        isRecording: true,
        createdAt: new Date(),
      },
      {
        id: "2",
        name: "Backyard",
        type: "esee",
        ipAddress: "192.168.1.102",
        port: "554",
        streamUrl: "rtsp://192.168.1.102:554/stream",
        username: "admin",
        password: "password",
        location: "backyard",
        resolution: "4K",
        isOnline: true,
        wifiStrength: 89,
        aiDetectionEnabled: true,
        detectPeople: true,
        detectPets: true,
        detectVehicles: false,
        isRecording: true,
        createdAt: new Date(),
      },
      {
        id: "3",
        name: "Driveway",
        type: "esee",
        ipAddress: "192.168.1.103",
        port: "554",
        streamUrl: "rtsp://192.168.1.103:554/stream",
        username: "admin",
        password: "password",
        location: "driveway",
        resolution: "1080p",
        isOnline: true,
        wifiStrength: 92,
        aiDetectionEnabled: true,
        detectPeople: true,
        detectPets: false,
        detectVehicles: true,
        isRecording: true,
        createdAt: new Date(),
      },
      {
        id: "4",
        name: "Side Gate",
        type: "ring",
        ipAddress: "192.168.1.104",
        port: "554",
        streamUrl: "rtsp://192.168.1.104:554/stream",
        username: "admin",
        password: "password",
        location: "side_gate",
        resolution: "1080p",
        isOnline: true,
        wifiStrength: 87,
        aiDetectionEnabled: true,
        detectPeople: true,
        detectPets: true,
        detectVehicles: false,
        isRecording: false,
        createdAt: new Date(),
      },
    ];

    mockCameras.forEach(camera => this.cameras.set(camera.id, camera));

    // Initialize some recent detections
    const mockDetections: Detection[] = [
      {
        id: "1",
        cameraId: "1",
        recordingId: null,
        type: "person",
        confidence: 0.95,
        description: "Person detected at front entrance",
        metadata: { classification: "Adult human" },
        createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      },
      {
        id: "2",
        cameraId: "2",
        recordingId: null,
        type: "pet",
        confidence: 0.88,
        description: "Domestic cat detected in backyard",
        metadata: { classification: "Cat" },
        createdAt: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
      },
      {
        id: "3",
        cameraId: "3",
        recordingId: null,
        type: "vehicle",
        confidence: 0.92,
        description: "Familiar vehicle in driveway",
        metadata: { classification: "Sedan" },
        createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      },
    ];

    mockDetections.forEach(detection => this.detections.set(detection.id, detection));

    // Initialize some cloud files
    const mockCloudFiles: CloudFile[] = [
      {
        id: "1",
        filename: "front_door_20241201_14:23.mp4",
        originalName: "front_door_recording.mp4",
        mimeType: "video/mp4",
        fileSize: 45.2,
        uploadedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
      {
        id: "2",
        filename: "backyard_20241201_14:15.mp4",
        originalName: "backyard_recording.mp4",
        mimeType: "video/mp4",
        fileSize: 23.8,
        uploadedAt: new Date(Date.now() - 20 * 60 * 1000),
      },
      {
        id: "3",
        filename: "driveway_20241201_13:42.mp4",
        originalName: "driveway_recording.mp4",
        mimeType: "video/mp4",
        fileSize: 67.4,
        uploadedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    ];

    mockCloudFiles.forEach(file => this.cloudFiles.set(file.id, file));
  }

  async getCameras(): Promise<Camera[]> {
    return Array.from(this.cameras.values());
  }

  async getCamera(id: string): Promise<Camera | undefined> {
    return this.cameras.get(id);
  }

  async createCamera(insertCamera: InsertCamera): Promise<Camera> {
    const id = randomUUID();
    const camera: Camera = {
      id,
      type: insertCamera.type,
      name: insertCamera.name,
      location: insertCamera.location,
      ipAddress: insertCamera.ipAddress,
      port: insertCamera.port ?? "554",
      streamUrl: insertCamera.streamUrl,
      username: insertCamera.username ?? null,
      password: insertCamera.password ?? null,
      resolution: insertCamera.resolution ?? "1080p",
      isOnline: insertCamera.isOnline ?? true,
      wifiStrength: insertCamera.wifiStrength ?? 100,
      aiDetectionEnabled: insertCamera.aiDetectionEnabled ?? true,
      detectPeople: insertCamera.detectPeople ?? true,
      detectPets: insertCamera.detectPets ?? true,
      detectVehicles: insertCamera.detectVehicles ?? false,
      isRecording: insertCamera.isRecording ?? true,
      createdAt: new Date(),
    };
    this.cameras.set(id, camera);
    return camera;
  }

  async updateCamera(id: string, updates: Partial<InsertCamera>): Promise<Camera | undefined> {
    const camera = this.cameras.get(id);
    if (!camera) return undefined;

    const updatedCamera = { ...camera, ...updates };
    this.cameras.set(id, updatedCamera);
    return updatedCamera;
  }

  async upsertCamera(id: string, insertCamera: InsertCamera): Promise<Camera> {
    const existing = this.cameras.get(id);
    if (existing) {
      // Update in-place — `id` and `createdAt` are preserved so re-running
      // a vendor sync doesn't churn downstream consumers (recordings,
      // detections) that reference the camera by id.
      const updated: Camera = {
        ...existing,
        type: insertCamera.type,
        name: insertCamera.name,
        location: insertCamera.location,
        ipAddress: insertCamera.ipAddress,
        port: insertCamera.port ?? existing.port ?? "554",
        streamUrl: insertCamera.streamUrl,
        username: insertCamera.username ?? existing.username ?? null,
        password: insertCamera.password ?? existing.password ?? null,
        resolution: insertCamera.resolution ?? existing.resolution ?? "1080p",
        // Booleans intentionally fall back to the existing value — vendor
        // sync should not silently flip a user's "isRecording" toggle off
        // just because the vendor API didn't carry that field.
        isOnline: insertCamera.isOnline ?? existing.isOnline ?? true,
        wifiStrength: insertCamera.wifiStrength ?? existing.wifiStrength ?? 100,
        aiDetectionEnabled:
          insertCamera.aiDetectionEnabled ?? existing.aiDetectionEnabled ?? true,
        detectPeople: insertCamera.detectPeople ?? existing.detectPeople ?? true,
        detectPets: insertCamera.detectPets ?? existing.detectPets ?? true,
        detectVehicles: insertCamera.detectVehicles ?? existing.detectVehicles ?? false,
        isRecording: insertCamera.isRecording ?? existing.isRecording ?? true,
      };
      this.cameras.set(id, updated);
      return updated;
    }

    const camera: Camera = {
      id,
      type: insertCamera.type,
      name: insertCamera.name,
      location: insertCamera.location,
      ipAddress: insertCamera.ipAddress,
      port: insertCamera.port ?? "554",
      streamUrl: insertCamera.streamUrl,
      username: insertCamera.username ?? null,
      password: insertCamera.password ?? null,
      resolution: insertCamera.resolution ?? "1080p",
      isOnline: insertCamera.isOnline ?? true,
      wifiStrength: insertCamera.wifiStrength ?? 100,
      aiDetectionEnabled: insertCamera.aiDetectionEnabled ?? true,
      detectPeople: insertCamera.detectPeople ?? true,
      detectPets: insertCamera.detectPets ?? true,
      detectVehicles: insertCamera.detectVehicles ?? false,
      isRecording: insertCamera.isRecording ?? true,
      createdAt: new Date(),
    };
    this.cameras.set(id, camera);
    return camera;
  }

  async deleteCamera(id: string): Promise<boolean> {
    return this.cameras.delete(id);
  }

  async getRecordings(cameraId?: string): Promise<Recording[]> {
    const recordings = Array.from(this.recordings.values());
    return cameraId ? recordings.filter(r => r.cameraId === cameraId) : recordings;
  }

  async getRecording(id: string): Promise<Recording | undefined> {
    return this.recordings.get(id);
  }

  async createRecording(insertRecording: InsertRecording): Promise<Recording> {
    const id = randomUUID();
    const recording: Recording = {
      id,
      duration: insertRecording.duration,
      cameraId: insertRecording.cameraId,
      filename: insertRecording.filename,
      fileSize: insertRecording.fileSize,
      cloudUrl: insertRecording.cloudUrl ?? null,
      isUploaded: insertRecording.isUploaded ?? false,
      createdAt: new Date(),
    };
    this.recordings.set(id, recording);
    return recording;
  }

  async updateRecording(id: string, updates: Partial<InsertRecording>): Promise<Recording | undefined> {
    const recording = this.recordings.get(id);
    if (!recording) return undefined;

    const updatedRecording = { ...recording, ...updates };
    this.recordings.set(id, updatedRecording);
    return updatedRecording;
  }

  async deleteRecording(id: string): Promise<boolean> {
    return this.recordings.delete(id);
  }

  async getDetections(cameraId?: string): Promise<Detection[]> {
    const detections = Array.from(this.detections.values());
    return cameraId ? detections.filter(d => d.cameraId === cameraId) : detections;
  }

  async getRecentDetections(limit = 10): Promise<Detection[]> {
    return Array.from(this.detections.values())
      .filter(d => d.createdAt !== null)
      .sort((a, b) => (b.createdAt!.getTime() - a.createdAt!.getTime()))
      .slice(0, limit);
  }

  async createDetection(insertDetection: InsertDetection): Promise<Detection> {
    const id = randomUUID();
    const detection: Detection = {
      id,
      type: insertDetection.type,
      cameraId: insertDetection.cameraId,
      confidence: insertDetection.confidence,
      metadata: insertDetection.metadata ?? null,
      description: insertDetection.description ?? null,
      recordingId: insertDetection.recordingId ?? null,
      createdAt: new Date(),
    };
    this.detections.set(id, detection);
    return detection;
  }

  async getCloudFiles(): Promise<CloudFile[]> {
    return Array.from(this.cloudFiles.values())
      .filter(f => f.uploadedAt !== null)
      .sort((a, b) => (b.uploadedAt!.getTime() - a.uploadedAt!.getTime()));
  }

  async createCloudFile(insertCloudFile: InsertCloudFile): Promise<CloudFile> {
    const id = randomUUID();
    const cloudFile: CloudFile = {
      ...insertCloudFile,
      id,
      uploadedAt: new Date(),
    };
    this.cloudFiles.set(id, cloudFile);
    return cloudFile;
  }

  async deleteCloudFile(id: string): Promise<boolean> {
    return this.cloudFiles.delete(id);
  }

  async getSystemStats(): Promise<SystemStats> {
    const cameras = Array.from(this.cameras.values());
    const activeCameras = cameras.filter(c => c.isOnline).length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const detectionsToday = Array.from(this.detections.values())
      .filter(d => d.createdAt && d.createdAt >= today).length;

    const cloudStorageUsed = Array.from(this.cloudFiles.values())
      .reduce((total, file) => total + file.fileSize, 0);

    const alertCount = Array.from(this.detections.values())
      .filter(d => d.createdAt && d.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)).length;

    const isRecording = cameras.some(c => c.isRecording);

    return {
      activeCameras,
      totalCameras: cameras.length,
      detectionsToday,
      cloudStorageUsed,
      alertCount,
      isRecording,
      cloudSyncStatus: 'ok',
    };
  }

  // Person profile operations
  async getPersonProfiles(): Promise<PersonProfile[]> {
    return Array.from(this.personProfiles.values());
  }

  async getPersonProfile(id: string): Promise<PersonProfile | undefined> {
    return this.personProfiles.get(id);
  }

  async createPersonProfile(profile: InsertPersonProfile): Promise<PersonProfile> {
    const id = randomUUID();
    const personProfile: PersonProfile = {
      id,
      name: profile.name ?? null,
      nickname: profile.nickname ?? null,
      description: profile.description,
      physicalCharacteristics: profile.physicalCharacteristics ?? null,
      recognitionMetadata: profile.recognitionMetadata ?? null,
      isKnown: profile.isKnown ?? false,
      trustLevel: profile.trustLevel ?? 0,
      lastSeenAt: profile.lastSeenAt ?? null,
      totalDetections: profile.totalDetections ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.personProfiles.set(id, personProfile);
    return personProfile;
  }

  async updatePersonProfile(id: string, updates: Partial<InsertPersonProfile>): Promise<PersonProfile | undefined> {
    const existing = this.personProfiles.get(id);
    if (!existing) return undefined;
    const updated: PersonProfile = { ...existing, ...updates, updatedAt: new Date() };
    this.personProfiles.set(id, updated);
    return updated;
  }

  async deletePersonProfile(id: string): Promise<boolean> {
    return this.personProfiles.delete(id);
  }

  async findSimilarPersons(description: string, _physicalCharacteristics: unknown): Promise<PersonProfile[]> {
    const needle = description.toLowerCase().trim();
    if (!needle) return [];
    const tokens = needle.split(/\s+/).filter((t) => t.length > 2);
    return Array.from(this.personProfiles.values())
      .map((p) => {
        const hay = `${p.description ?? ""} ${p.name ?? ""} ${p.nickname ?? ""}`.toLowerCase();
        const score = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
        return { profile: p, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((m) => m.profile);
  }

  // Animal profile operations
  async getAnimalProfiles(): Promise<AnimalProfile[]> {
    return Array.from(this.animalProfiles.values());
  }

  async getAnimalProfile(id: string): Promise<AnimalProfile | undefined> {
    return this.animalProfiles.get(id);
  }

  async createAnimalProfile(profile: InsertAnimalProfile): Promise<AnimalProfile> {
    const id = randomUUID();
    const animalProfile: AnimalProfile = {
      id,
      name: profile.name ?? null,
      species: profile.species,
      breed: profile.breed ?? null,
      description: profile.description,
      physicalCharacteristics: profile.physicalCharacteristics ?? null,
      recognitionMetadata: profile.recognitionMetadata ?? null,
      isKnown: profile.isKnown ?? false,
      animalType: profile.animalType ?? 'unknown',
      lastSeenAt: profile.lastSeenAt ?? null,
      totalDetections: profile.totalDetections ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.animalProfiles.set(id, animalProfile);
    return animalProfile;
  }

  async updateAnimalProfile(id: string, updates: Partial<InsertAnimalProfile>): Promise<AnimalProfile | undefined> {
    const existing = this.animalProfiles.get(id);
    if (!existing) return undefined;
    const updated: AnimalProfile = { ...existing, ...updates, updatedAt: new Date() };
    this.animalProfiles.set(id, updated);
    return updated;
  }

  async deleteAnimalProfile(id: string): Promise<boolean> {
    return this.animalProfiles.delete(id);
  }

  async findSimilarAnimals(description: string, species: string): Promise<AnimalProfile[]> {
    const needle = description.toLowerCase().trim();
    const speciesLower = species.toLowerCase().trim();
    return Array.from(this.animalProfiles.values()).filter((a) => {
      const speciesMatch = !speciesLower || a.species.toLowerCase() === speciesLower;
      const descMatch = !needle || (a.description ?? "").toLowerCase().includes(needle);
      return speciesMatch && descMatch;
    });
  }

  // Vehicle operations
  async getVehicles(): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values());
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    return this.vehicles.get(id);
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const id = randomUUID();
    const vehicleRecord: Vehicle = {
      id,
      personId: vehicle.personId ?? null,
      make: vehicle.make ?? null,
      model: vehicle.model ?? null,
      year: vehicle.year ?? null,
      color: vehicle.color ?? null,
      licensePlate: vehicle.licensePlate ?? null,
      vehicleType: vehicle.vehicleType,
      description: vehicle.description,
      recognitionMetadata: vehicle.recognitionMetadata ?? null,
      isKnown: vehicle.isKnown ?? false,
      lastSeenAt: vehicle.lastSeenAt ?? null,
      totalDetections: vehicle.totalDetections ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.vehicles.set(id, vehicleRecord);
    return vehicleRecord;
  }

  async updateVehicle(id: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const existing = this.vehicles.get(id);
    if (!existing) return undefined;
    const updated: Vehicle = { ...existing, ...updates, updatedAt: new Date() };
    this.vehicles.set(id, updated);
    return updated;
  }

  async deleteVehicle(id: string): Promise<boolean> {
    return this.vehicles.delete(id);
  }

  async getVehiclesByPerson(personId: string): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values()).filter((v) => v.personId === personId);
  }

  // Recognition event operations
  async getRecognitionEvents(cameraId?: string): Promise<RecognitionEvent[]> {
    const events = Array.from(this.recognitionEvents.values());
    return cameraId ? events.filter((e) => e.cameraId === cameraId) : events;
  }

  async getRecentRecognitionEvents(limit = 10): Promise<RecognitionEvent[]> {
    return Array.from(this.recognitionEvents.values())
      .filter((e) => e.createdAt !== null)
      .sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime())
      .slice(0, limit);
  }

  async createRecognitionEvent(event: InsertRecognitionEvent): Promise<RecognitionEvent> {
    const id = randomUUID();
    const recognitionEvent: RecognitionEvent = {
      id,
      detectionId: event.detectionId,
      cameraId: event.cameraId,
      entityType: event.entityType,
      entityId: event.entityId,
      confidence: event.confidence,
      matchingMethod: event.matchingMethod,
      isNewDetection: event.isNewDetection ?? true,
      behaviorNotes: event.behaviorNotes ?? null,
      createdAt: new Date(),
    };
    this.recognitionEvents.set(id, recognitionEvent);
    return recognitionEvent;
  }

  // Daily summary operations
  async getDailySummaries(limit = 30): Promise<DailySummary[]> {
    return Array.from(this.dailySummaries.values())
      .filter((s) => s.date !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  async getDailySummary(date: Date): Promise<DailySummary | undefined> {
    const target = this.dayKey(date);
    return Array.from(this.dailySummaries.values()).find((s) => this.dayKey(s.date) === target);
  }

  async createDailySummary(summary: InsertDailySummary): Promise<DailySummary> {
    const id = randomUUID();
    const dailySummary: DailySummary = {
      id,
      date: summary.date,
      summary: summary.summary,
      totalDetections: summary.totalDetections ?? 0,
      knownPeople: summary.knownPeople ?? 0,
      unknownPeople: summary.unknownPeople ?? 0,
      animals: summary.animals ?? 0,
      vehicles: summary.vehicles ?? 0,
      notableEvents: summary.notableEvents ?? null,
      cameraActivity: summary.cameraActivity ?? null,
      generatedAt: new Date(),
    };
    this.dailySummaries.set(id, dailySummary);
    return dailySummary;
  }

  async getLatestDailySummary(): Promise<DailySummary | undefined> {
    const all = await this.getDailySummaries(1);
    return all[0];
  }

  private dayKey(d: Date | string): string {
    const date = typeof d === "string" ? new Date(d) : d;
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  }
}

export const storage = new MemStorage();
