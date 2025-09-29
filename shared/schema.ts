import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, json, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cameras = pgTable("cameras", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'ring' | 'esee' | 'generic'
  ipAddress: text("ip_address").notNull(),
  port: text("port").default("554"),
  streamUrl: text("stream_url").notNull(),
  username: text("username"),
  password: text("password"),
  location: text("location").notNull(),
  resolution: text("resolution").default("1080p"),
  isOnline: boolean("is_online").default(true),
  wifiStrength: real("wifi_strength").default(100),
  aiDetectionEnabled: boolean("ai_detection_enabled").default(true),
  detectPeople: boolean("detect_people").default(true),
  detectPets: boolean("detect_pets").default(true),
  detectVehicles: boolean("detect_vehicles").default(false),
  isRecording: boolean("is_recording").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recordings = pgTable("recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cameraId: varchar("camera_id").references(() => cameras.id).notNull(),
  filename: text("filename").notNull(),
  duration: real("duration").notNull(), // in seconds
  fileSize: real("file_size").notNull(), // in MB
  cloudUrl: text("cloud_url"),
  isUploaded: boolean("is_uploaded").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const detections = pgTable("detections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cameraId: varchar("camera_id").references(() => cameras.id).notNull(),
  recordingId: varchar("recording_id").references(() => recordings.id),
  type: text("type").notNull(), // 'person' | 'pet' | 'vehicle'
  confidence: real("confidence").notNull(),
  description: text("description"),
  metadata: json("metadata").$type<{
    boundingBox?: { x: number; y: number; width: number; height: number };
    classification?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cloudFiles = pgTable("cloud_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: real("file_size").notNull(), // in MB
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Person profiles for recognition and memory
export const personProfiles = pgTable("person_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"), // Optional - can be null for unknown people
  nickname: text("nickname"),
  description: text("description").notNull(), // AI-generated physical description
  physicalCharacteristics: json("physical_characteristics").$type<{
    height?: string;
    build?: string;
    hairColor?: string;
    facialFeatures?: string;
    distinctiveMarks?: string;
    clothingStyle?: string;
  }>(),
  recognitionMetadata: json("recognition_metadata").$type<{
    facialFeatures?: string[];
    gaitAnalysis?: string;
    typicalClothing?: string[];
    voicePatterns?: string;
  }>(),
  isKnown: boolean("is_known").default(false),
  trustLevel: integer("trust_level").default(0), // 0-100 scale
  lastSeenAt: timestamp("last_seen_at"),
  totalDetections: integer("total_detections").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Animal profiles for pet and wildlife recognition
export const animalProfiles = pgTable("animal_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"), // Optional - can be null for unknown animals
  species: text("species").notNull(), // dog, cat, bird, etc.
  breed: text("breed"),
  description: text("description").notNull(), // AI-generated physical description
  physicalCharacteristics: json("physical_characteristics").$type<{
    size?: string;
    color?: string;
    markings?: string;
    distinctiveFeatures?: string;
    behaviorPatterns?: string;
  }>(),
  recognitionMetadata: json("recognition_metadata").$type<{
    markingPatterns?: string[];
    gaitPattern?: string;
    behaviorSignatures?: string[];
  }>(),
  isKnown: boolean("is_known").default(false),
  animalType: text("animal_type").notNull().default("unknown"), // 'pet' | 'wildlife' | 'unknown'
  lastSeenAt: timestamp("last_seen_at"),
  totalDetections: integer("total_detections").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Vehicles associated with people
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  personId: varchar("person_id").references(() => personProfiles.id),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  color: text("color"),
  licensePlate: text("license_plate"),
  vehicleType: text("vehicle_type").notNull(), // 'car' | 'truck' | 'motorcycle' | 'bicycle' | 'other'
  description: text("description").notNull(), // AI-generated description
  recognitionMetadata: json("recognition_metadata").$type<{
    bodyStyle?: string;
    distinctiveFeatures?: string[];
    condition?: string;
  }>(),
  isKnown: boolean("is_known").default(false),
  lastSeenAt: timestamp("last_seen_at"),
  totalDetections: integer("total_detections").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recognition events - when known people/animals/vehicles are detected
export const recognitionEvents = pgTable("recognition_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  detectionId: varchar("detection_id").references(() => detections.id).notNull(),
  cameraId: varchar("camera_id").references(() => cameras.id).notNull(),
  entityType: text("entity_type").notNull(), // 'person' | 'animal' | 'vehicle'
  entityId: varchar("entity_id").notNull(), // References personProfiles.id, animalProfiles.id, or vehicles.id
  confidence: real("confidence").notNull(),
  matchingMethod: text("matching_method").notNull(), // 'facial' | 'physical' | 'behavioral' | 'visual'
  isNewDetection: boolean("is_new_detection").default(true), // First time seeing this entity today
  behaviorNotes: text("behavior_notes"), // What they were doing
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily summaries generated by AI
export const dailySummaries = pgTable("daily_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  summary: text("summary").notNull(), // AI-generated natural language summary
  totalDetections: integer("total_detections").default(0),
  knownPeople: integer("known_people").default(0),
  unknownPeople: integer("unknown_people").default(0),
  animals: integer("animals").default(0),
  vehicles: integer("vehicles").default(0),
  notableEvents: json("notable_events").$type<{
    event: string;
    time: string;
    camera: string;
    description: string;
  }[]>(),
  cameraActivity: json("camera_activity").$type<{
    [cameraId: string]: {
      name: string;
      detections: number;
      highlights: string[];
    };
  }>(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

// Relations
export const personProfilesRelations = relations(personProfiles, ({ many }) => ({
  vehicles: many(vehicles),
  recognitionEvents: many(recognitionEvents),
}));

export const animalProfilesRelations = relations(animalProfiles, ({ many }) => ({
  recognitionEvents: many(recognitionEvents),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  person: one(personProfiles, {
    fields: [vehicles.personId],
    references: [personProfiles.id],
  }),
  recognitionEvents: many(recognitionEvents),
}));

export const camerasRelations = relations(cameras, ({ many }) => ({
  recordings: many(recordings),
  detections: many(detections),
  recognitionEvents: many(recognitionEvents),
}));

export const detectionsRelations = relations(detections, ({ one, many }) => ({
  camera: one(cameras, {
    fields: [detections.cameraId],
    references: [cameras.id],
  }),
  recording: one(recordings, {
    fields: [detections.recordingId],
    references: [recordings.id],
  }),
  recognitionEvents: many(recognitionEvents),
}));

export const recognitionEventsRelations = relations(recognitionEvents, ({ one }) => ({
  detection: one(detections, {
    fields: [recognitionEvents.detectionId],
    references: [detections.id],
  }),
  camera: one(cameras, {
    fields: [recognitionEvents.cameraId],
    references: [cameras.id],
  }),
}));

// Insert schemas
export const insertCameraSchema = createInsertSchema(cameras).omit({
  id: true,
  createdAt: true,
});

export const insertRecordingSchema = createInsertSchema(recordings).omit({
  id: true,
  createdAt: true,
});

export const insertDetectionSchema = createInsertSchema(detections).omit({
  id: true,
  createdAt: true,
});

export const insertCloudFileSchema = createInsertSchema(cloudFiles).omit({
  id: true,
  uploadedAt: true,
});

export const insertPersonProfileSchema = createInsertSchema(personProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnimalProfileSchema = createInsertSchema(animalProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRecognitionEventSchema = createInsertSchema(recognitionEvents).omit({
  id: true,
  createdAt: true,
});

export const insertDailySummarySchema = createInsertSchema(dailySummaries).omit({
  id: true,
  generatedAt: true,
});

// Types
export type Camera = typeof cameras.$inferSelect;
export type InsertCamera = z.infer<typeof insertCameraSchema>;
export type Recording = typeof recordings.$inferSelect;
export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Detection = typeof detections.$inferSelect;
export type InsertDetection = z.infer<typeof insertDetectionSchema>;
export type CloudFile = typeof cloudFiles.$inferSelect;
export type InsertCloudFile = z.infer<typeof insertCloudFileSchema>;

export type PersonProfile = typeof personProfiles.$inferSelect;
export type InsertPersonProfile = z.infer<typeof insertPersonProfileSchema>;
export type AnimalProfile = typeof animalProfiles.$inferSelect;
export type InsertAnimalProfile = z.infer<typeof insertAnimalProfileSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type RecognitionEvent = typeof recognitionEvents.$inferSelect;
export type InsertRecognitionEvent = z.infer<typeof insertRecognitionEventSchema>;
export type DailySummary = typeof dailySummaries.$inferSelect;
export type InsertDailySummary = z.infer<typeof insertDailySummarySchema>;

// System stats type
export type SystemStats = {
  activeCameras: number;
  totalCameras: number;
  detectionsToday: number;
  cloudStorageUsed: number;
  alertCount: number;
  isRecording: boolean;
  cloudSyncStatus: 'ok' | 'syncing' | 'error';
};
