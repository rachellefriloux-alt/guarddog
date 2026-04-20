import { storage } from '../storage';
import { openaiService } from './openai-service';
import { fileStorageService } from './file-storage-service';
import { googleDriveService } from './google-drive-service';
import { type PersonProfile, type AnimalProfile, type Vehicle, type RecognitionEvent, type InsertPersonProfile, type InsertAnimalProfile, type InsertVehicle, type InsertRecognitionEvent } from '@shared/schema';

interface RecognitionData {
  people: Map<string, PersonProfile>;
  animals: Map<string, AnimalProfile>;
  vehicles: Map<string, Vehicle>;
  similarityThreshold: number;
}

export class RecognitionService {
  private recognitionData: RecognitionData = {
    people: new Map(),
    animals: new Map(),
    vehicles: new Map(),
    similarityThreshold: 0.7,
  };

  async initialize(): Promise<void> {
    console.log('Initializing AI Recognition Service...');
    await this.loadKnownEntities();
    console.log(`Loaded ${this.recognitionData.people.size} people, ${this.recognitionData.animals.size} animals, ${this.recognitionData.vehicles.size} vehicles`);
  }

  private async loadKnownEntities(): Promise<void> {
    try {
      // Load existing profiles from storage
      const people = await storage.getPersonProfiles();
      const animals = await storage.getAnimalProfiles();
      const vehicles = await storage.getVehicles();

      people.forEach(person => this.recognitionData.people.set(person.id, person));
      animals.forEach(animal => this.recognitionData.animals.set(animal.id, animal));
      vehicles.forEach(vehicle => this.recognitionData.vehicles.set(vehicle.id, vehicle));
    } catch (error) {
      console.error('Error loading known entities:', error);
    }
  }

  async analyzeAndRecognize(imageBase64: string, cameraId: string, detectionId: string): Promise<RecognitionEvent | null> {
    try {
      // First, detect what's in the image
      const detection = await openaiService.analyzeImageForMotion(imageBase64);
      
      if (!detection.detected) {
        return null;
      }

      let recognitionEvent: RecognitionEvent | null = null;

      switch (detection.type) {
        case 'person':
          recognitionEvent = await this.recognizePerson(imageBase64, cameraId, detectionId, detection);
          break;
        case 'pet':
          recognitionEvent = await this.recognizeAnimal(imageBase64, cameraId, detectionId, detection);
          break;
        case 'vehicle':
          recognitionEvent = await this.recognizeVehicle(imageBase64, cameraId, detectionId, detection);
          break;
      }

      return recognitionEvent;
    } catch (error) {
      console.error('Error in recognition analysis:', error);
      return null;
    }
  }

  private async recognizePerson(imageBase64: string, cameraId: string, detectionId: string, detection: any): Promise<RecognitionEvent | null> {
    try {
      // Generate detailed description of the person
      const personDescription = await this.generatePersonDescription(imageBase64);
      
      // Try to match with known people
      const matchedPerson = await this.findSimilarPerson(personDescription);
      
      if (matchedPerson) {
        // Update last seen
        matchedPerson.lastSeenAt = new Date();
        matchedPerson.totalDetections = (matchedPerson.totalDetections || 0) + 1;
        await storage.updatePersonProfile(matchedPerson.id, {
          lastSeenAt: matchedPerson.lastSeenAt,
          totalDetections: matchedPerson.totalDetections,
        });

        // Create recognition event
        const recognitionEvent = await storage.createRecognitionEvent({
          detectionId,
          cameraId,
          entityType: 'person',
          entityId: matchedPerson.id,
          confidence: detection.confidence,
          matchingMethod: 'visual',
          isNewDetection: false,
          behaviorNotes: `Recognized ${matchedPerson.isKnown ? 'known' : 'unknown'} person: ${matchedPerson.name || 'Unnamed'}`,
        });

        console.log(`Recognized known person: ${matchedPerson.name || 'Unnamed'} (confidence: ${detection.confidence})`);
        return recognitionEvent;
      } else {
        // Create new person profile
        const newPerson = await this.createPersonProfile(personDescription, imageBase64, cameraId);
        
        if (newPerson) {
          this.recognitionData.people.set(newPerson.id, newPerson);

          const recognitionEvent = await storage.createRecognitionEvent({
            detectionId,
            cameraId,
            entityType: 'person',
            entityId: newPerson.id,
            confidence: detection.confidence,
            matchingMethod: 'visual',
            isNewDetection: true,
            behaviorNotes: 'New person detected and added to recognition database',
          });

          console.log(`New person detected and catalogued (confidence: ${detection.confidence})`);
          return recognitionEvent;
        }
      }

      return null;
    } catch (error) {
      console.error('Error recognizing person:', error);
      return null;
    }
  }

  private async recognizeAnimal(imageBase64: string, cameraId: string, detectionId: string, detection: any): Promise<RecognitionEvent | null> {
    try {
      const animalDescription = await this.generateAnimalDescription(imageBase64);
      const matchedAnimal = await this.findSimilarAnimal(animalDescription);
      
      if (matchedAnimal) {
        matchedAnimal.lastSeenAt = new Date();
        matchedAnimal.totalDetections = (matchedAnimal.totalDetections || 0) + 1;
        await storage.updateAnimalProfile(matchedAnimal.id, {
          lastSeenAt: matchedAnimal.lastSeenAt,
          totalDetections: matchedAnimal.totalDetections,
        });

        const recognitionEvent = await storage.createRecognitionEvent({
          detectionId,
          cameraId,
          entityType: 'animal',
          entityId: matchedAnimal.id,
          confidence: detection.confidence,
          matchingMethod: 'visual',
          isNewDetection: false,
          behaviorNotes: `Recognized ${matchedAnimal.isKnown ? 'pet' : 'wildlife'}: ${matchedAnimal.name || matchedAnimal.species}`,
        });

        console.log(`Recognized known animal: ${matchedAnimal.name || matchedAnimal.species} (confidence: ${detection.confidence})`);
        return recognitionEvent;
      } else {
        const newAnimal = await this.createAnimalProfile(animalDescription, imageBase64, cameraId);
        
        if (newAnimal) {
          this.recognitionData.animals.set(newAnimal.id, newAnimal);

          const recognitionEvent = await storage.createRecognitionEvent({
            detectionId,
            cameraId,
            entityType: 'animal',
            entityId: newAnimal.id,
            confidence: detection.confidence,
            matchingMethod: 'visual',
            isNewDetection: true,
            behaviorNotes: `New ${newAnimal.species} detected and catalogued`,
          });

          console.log(`New animal detected: ${newAnimal.species} (confidence: ${detection.confidence})`);
          return recognitionEvent;
        }
      }

      return null;
    } catch (error) {
      console.error('Error recognizing animal:', error);
      return null;
    }
  }

  private async recognizeVehicle(imageBase64: string, cameraId: string, detectionId: string, detection: any): Promise<RecognitionEvent | null> {
    try {
      const vehicleDescription = await this.generateVehicleDescription(imageBase64);
      const matchedVehicle = await this.findSimilarVehicle(vehicleDescription);
      
      if (matchedVehicle) {
        matchedVehicle.lastSeenAt = new Date();
        matchedVehicle.totalDetections = (matchedVehicle.totalDetections || 0) + 1;
        await storage.updateVehicle(matchedVehicle.id, {
          lastSeenAt: matchedVehicle.lastSeenAt,
          totalDetections: matchedVehicle.totalDetections,
        });

        const recognitionEvent = await storage.createRecognitionEvent({
          detectionId,
          cameraId,
          entityType: 'vehicle',
          entityId: matchedVehicle.id,
          confidence: detection.confidence,
          matchingMethod: 'visual',
          isNewDetection: false,
          behaviorNotes: `Recognized ${matchedVehicle.isKnown ? 'known' : 'unknown'} vehicle: ${matchedVehicle.make} ${matchedVehicle.model}`,
        });

        console.log(`Recognized known vehicle: ${matchedVehicle.make} ${matchedVehicle.model} (confidence: ${detection.confidence})`);
        return recognitionEvent;
      } else {
        const newVehicle = await this.createVehicleProfile(vehicleDescription, imageBase64, cameraId);
        
        if (newVehicle) {
          this.recognitionData.vehicles.set(newVehicle.id, newVehicle);

          const recognitionEvent = await storage.createRecognitionEvent({
            detectionId,
            cameraId,
            entityType: 'vehicle',
            entityId: newVehicle.id,
            confidence: detection.confidence,
            matchingMethod: 'visual',
            isNewDetection: true,
            behaviorNotes: `New vehicle detected: ${newVehicle.vehicleType}`,
          });

          console.log(`New vehicle detected: ${newVehicle.vehicleType} (confidence: ${detection.confidence})`);
          return recognitionEvent;
        }
      }

      return null;
    } catch (error) {
      console.error('Error recognizing vehicle:', error);
      return null;
    }
  }

  private async generatePersonDescription(imageBase64: string): Promise<string> {
    try {
      const prompt = `Analyze this image and provide a detailed description of the person for recognition purposes. Include:
      - Physical characteristics (height, build, hair color, facial features, distinctive marks)
      - Clothing style and colors
      - Any distinctive features that would help identify them in future images
      Be specific and detailed for accurate recognition.`;

      return await openaiService.analyzeImageWithPrompt(imageBase64, prompt);
    } catch (error) {
      console.error('Error generating person description:', error);
      return 'Unable to generate description';
    }
  }

  private async generateAnimalDescription(imageBase64: string): Promise<string> {
    try {
      const prompt = `Analyze this image and provide a detailed description of the animal. Include:
      - Species and breed (if identifiable)
      - Size and build
      - Color patterns and markings
      - Distinctive features
      - Whether it appears to be a pet or wildlife
      Be specific for accurate recognition.`;

      return await openaiService.analyzeImageWithPrompt(imageBase64, prompt);
    } catch (error) {
      console.error('Error generating animal description:', error);
      return 'Unable to generate description';
    }
  }

  private async generateVehicleDescription(imageBase64: string): Promise<string> {
    try {
      const prompt = `Analyze this image and provide a detailed description of the vehicle. Include:
      - Make and model (if identifiable)
      - Color and type (sedan, SUV, truck, etc.)
      - License plate (if visible)
      - Distinctive features or damage
      - Year or generation if recognizable
      Be specific for accurate recognition.`;

      return await openaiService.analyzeImageWithPrompt(imageBase64, prompt);
    } catch (error) {
      console.error('Error generating vehicle description:', error);
      return 'Unable to generate description';
    }
  }

  private async findSimilarPerson(description: string): Promise<PersonProfile | null> {
    const people = Array.from(this.recognitionData.people.values());
    
    for (const person of people) {
      const similarity = await this.calculateSimilarity(description, person.description);
      if (similarity > this.recognitionData.similarityThreshold) {
        return person;
      }
    }
    
    return null;
  }

  private async findSimilarAnimal(description: string): Promise<AnimalProfile | null> {
    const animals = Array.from(this.recognitionData.animals.values());
    
    for (const animal of animals) {
      const similarity = await this.calculateSimilarity(description, animal.description);
      if (similarity > this.recognitionData.similarityThreshold) {
        return animal;
      }
    }
    
    return null;
  }

  private async findSimilarVehicle(description: string): Promise<Vehicle | null> {
    const vehicles = Array.from(this.recognitionData.vehicles.values());
    
    for (const vehicle of vehicles) {
      const similarity = await this.calculateSimilarity(description, vehicle.description);
      if (similarity > this.recognitionData.similarityThreshold) {
        return vehicle;
      }
    }
    
    return null;
  }

  private async calculateSimilarity(description1: string, description2: string): Promise<number> {
    try {
      const prompt = `Compare these two descriptions and rate their similarity from 0.0 to 1.0:
      Description 1: ${description1}
      Description 2: ${description2}
      
      Respond with just a number between 0.0 and 1.0 representing how similar they are.`;

      const result = await openaiService.generateText(prompt);
      const similarity = parseFloat(result);
      return isNaN(similarity) ? 0 : Math.max(0, Math.min(1, similarity));
    } catch (error) {
      console.error('Error calculating similarity:', error);
      return 0;
    }
  }

  private async createPersonProfile(description: string, imageBase64: string, cameraId: string): Promise<PersonProfile | null> {
    try {
      // Save snapshot for reference
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotPath = await fileStorageService.saveSnapshot(cameraId, imageBuffer);

      // Upload to Google Drive
      const driveUrl = await googleDriveService.uploadSnapshot(snapshotPath, `person_${timestamp}.jpg`, cameraId);

      const personData: InsertPersonProfile = {
        name: null, // Will be set manually by user
        nickname: null,
        description,
        physicalCharacteristics: await this.extractPhysicalCharacteristics(description, 'person'),
        recognitionMetadata: {
          facialFeatures: [],
          gaitAnalysis: '',
          typicalClothing: [],
          voicePatterns: '',
        },
        isKnown: false,
        trustLevel: 0,
        lastSeenAt: new Date(),
        totalDetections: 1,
      };

      return await storage.createPersonProfile(personData);
    } catch (error) {
      console.error('Error creating person profile:', error);
      return null;
    }
  }

  private async createAnimalProfile(description: string, imageBase64: string, cameraId: string): Promise<AnimalProfile | null> {
    try {
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotPath = await fileStorageService.saveSnapshot(cameraId, imageBuffer);

      const driveUrl = await googleDriveService.uploadSnapshot(snapshotPath, `animal_${timestamp}.jpg`, cameraId);

      // Extract species from description
      const species = await this.extractSpecies(description);

      const animalData: InsertAnimalProfile = {
        name: null,
        species,
        breed: null,
        description,
        physicalCharacteristics: await this.extractPhysicalCharacteristics(description, 'animal'),
        recognitionMetadata: {
          markingPatterns: [],
          gaitPattern: '',
          behaviorSignatures: [],
        },
        isKnown: false,
        animalType: species.toLowerCase().includes('dog') || species.toLowerCase().includes('cat') ? 'pet' : 'wildlife',
        lastSeenAt: new Date(),
        totalDetections: 1,
      };

      return await storage.createAnimalProfile(animalData);
    } catch (error) {
      console.error('Error creating animal profile:', error);
      return null;
    }
  }

  private async createVehicleProfile(description: string, imageBase64: string, cameraId: string): Promise<Vehicle | null> {
    try {
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotPath = await fileStorageService.saveSnapshot(cameraId, imageBuffer);

      const driveUrl = await googleDriveService.uploadSnapshot(snapshotPath, `vehicle_${timestamp}.jpg`, cameraId);

      // Extract vehicle details from description
      const vehicleDetails = await this.extractVehicleDetails(description);

      const vehicleData: InsertVehicle = {
        personId: null,
        make: vehicleDetails.make,
        model: vehicleDetails.model,
        year: vehicleDetails.year,
        color: vehicleDetails.color,
        licensePlate: vehicleDetails.licensePlate,
        vehicleType: vehicleDetails.type,
        description,
        recognitionMetadata: {
          bodyStyle: vehicleDetails.bodyStyle,
          distinctiveFeatures: vehicleDetails.distinctiveFeatures,
          condition: vehicleDetails.condition,
        },
        isKnown: false,
        lastSeenAt: new Date(),
        totalDetections: 1,
      };

      return await storage.createVehicle(vehicleData);
    } catch (error) {
      console.error('Error creating vehicle profile:', error);
      return null;
    }
  }

  private async extractPhysicalCharacteristics(description: string, type: 'person' | 'animal'): Promise<any> {
    try {
      const prompt = type === 'person' 
        ? `Extract physical characteristics from this description and format as JSON: ${description}
           Return: {"height": "", "build": "", "hairColor": "", "facialFeatures": "", "distinctiveMarks": "", "clothingStyle": ""}`
        : `Extract physical characteristics from this description and format as JSON: ${description}
           Return: {"size": "", "color": "", "markings": "", "distinctiveFeatures": "", "behaviorPatterns": ""}`;

      const result = await openaiService.generateText(prompt);
      return JSON.parse(result);
    } catch (error) {
      console.error('Error extracting characteristics:', error);
      return {};
    }
  }

  private async extractSpecies(description: string): Promise<string> {
    try {
      const prompt = `Extract the animal species from this description: ${description}
      Return just the species name (e.g., "Dog", "Cat", "Bird", "Raccoon", etc.)`;

      const result = await openaiService.generateText(prompt);
      return result.trim() || 'Unknown';
    } catch (error) {
      console.error('Error extracting species:', error);
      return 'Unknown';
    }
  }

  private async extractVehicleDetails(description: string): Promise<any> {
    try {
      const prompt = `Extract vehicle details from this description and format as JSON: ${description}
      Return: {
        "make": "", "model": "", "year": null, "color": "", "licensePlate": "", 
        "type": "", "bodyStyle": "", "distinctiveFeatures": [], "condition": ""
      }`;

      const result = await openaiService.generateText(prompt);
      return JSON.parse(result);
    } catch (error) {
      console.error('Error extracting vehicle details:', error);
      return {
        make: null, model: null, year: null, color: null, 
        licensePlate: null, type: 'unknown', bodyStyle: '', 
        distinctiveFeatures: [], condition: ''
      };
    }
  }

  async getRecognitionStats(): Promise<any> {
    return {
      totalPeople: this.recognitionData.people.size,
      totalAnimals: this.recognitionData.animals.size,
      totalVehicles: this.recognitionData.vehicles.size,
      knownPeople: Array.from(this.recognitionData.people.values()).filter(p => p.isKnown).length,
      pets: Array.from(this.recognitionData.animals.values()).filter(a => a.animalType === 'pet').length,
      wildlife: Array.from(this.recognitionData.animals.values()).filter(a => a.animalType === 'wildlife').length,
      knownVehicles: Array.from(this.recognitionData.vehicles.values()).filter(v => v.isKnown).length,
    };
  }

  async markPersonAsKnown(personId: string, name: string, trustLevel: number = 50): Promise<boolean> {
    try {
      const person = this.recognitionData.people.get(personId);
      if (person) {
        person.name = name;
        person.isKnown = true;
        person.trustLevel = trustLevel;
        
        await storage.updatePersonProfile(personId, {
          name,
          isKnown: true,
          trustLevel,
        });

        console.log(`Marked person as known: ${name}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error marking person as known:', error);
      return false;
    }
  }

  async markAnimalAsKnown(animalId: string, name: string, isPet: boolean = true): Promise<boolean> {
    try {
      const animal = this.recognitionData.animals.get(animalId);
      if (animal) {
        animal.name = name;
        animal.isKnown = true;
        animal.animalType = isPet ? 'pet' : 'wildlife';
        
        await storage.updateAnimalProfile(animalId, {
          name,
          isKnown: true,
          animalType: isPet ? 'pet' : 'wildlife',
        });

        console.log(`Marked animal as known: ${name}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error marking animal as known:', error);
      return false;
    }
  }
}

export const recognitionService = new RecognitionService();