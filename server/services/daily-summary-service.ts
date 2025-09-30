import { storage } from '../storage';
import { openaiService } from './openai-service';
import { googleDriveService } from './google-drive-service';
import { recognitionService } from './recognition-service';
import { type DailySummary, type InsertDailySummary, type Detection, type RecognitionEvent } from '@shared/schema';

export class DailySummaryService {
  async generateDailySummary(date: Date = new Date()): Promise<DailySummary | null> {
    try {
      console.log(`Generating daily summary for ${date.toDateString()}`);

      // Set date to start of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Gather all data for the day
      const dayData = await this.gatherDayData(startOfDay, endOfDay);
      
      // Generate AI summary
      const aiSummary = await this.generateAISummary(dayData);
      
      // Create daily summary record
      const summaryData: InsertDailySummary = {
        date: startOfDay,
        summary: aiSummary,
        totalDetections: dayData.totalDetections,
        knownPeople: dayData.knownPeople,
        unknownPeople: dayData.unknownPeople,
        animals: dayData.animals,
        vehicles: dayData.vehicles,
        notableEvents: dayData.notableEvents,
        cameraActivity: dayData.cameraActivity,
      };

      const dailySummary = await storage.createDailySummary(summaryData);

      // Generate and upload report to Google Drive
      await this.generateAndUploadReport(date, dailySummary);

      console.log('Daily summary generated successfully');
      return dailySummary;
    } catch (error) {
      console.error('Error generating daily summary:', error);
      return null;
    }
  }

  private async gatherDayData(startOfDay: Date, endOfDay: Date): Promise<any> {
    try {
      // Get all detections for the day
      const allDetections = await storage.getDetections();
      const dayDetections = allDetections.filter(detection => 
        detection.createdAt && 
        detection.createdAt >= startOfDay && 
        detection.createdAt <= endOfDay
      );

      // Get all recognition events for the day
      const allRecognitionEvents = await storage.getRecognitionEvents();
      const dayRecognitionEvents = allRecognitionEvents.filter(event =>
        event.createdAt && 
        event.createdAt >= startOfDay && 
        event.createdAt <= endOfDay
      );

      // Get cameras for reference
      const cameras = await storage.getCameras();
      const cameraMap = new Map(cameras.map(c => [c.id, c]));

      // Count different types of detections
      const personDetections = dayDetections.filter(d => d.type === 'person');
      const animalDetections = dayDetections.filter(d => d.type === 'pet');
      const vehicleDetections = dayDetections.filter(d => d.type === 'vehicle');

      // Count known vs unknown
      const knownPeopleEvents = dayRecognitionEvents.filter(e => 
        e.entityType === 'person' && !e.isNewDetection
      );
      const unknownPeopleEvents = dayRecognitionEvents.filter(e => 
        e.entityType === 'person' && e.isNewDetection
      );

      // Generate notable events
      const notableEvents = await this.extractNotableEvents(dayDetections, dayRecognitionEvents, cameraMap);

      // Generate camera activity summary
      const cameraActivity = await this.generateCameraActivity(dayDetections, dayRecognitionEvents, cameraMap);

      return {
        totalDetections: dayDetections.length,
        knownPeople: knownPeopleEvents.length,
        unknownPeople: unknownPeopleEvents.length,
        animals: animalDetections.length,
        vehicles: vehicleDetections.length,
        notableEvents,
        cameraActivity,
        rawDetections: dayDetections,
        rawRecognitionEvents: dayRecognitionEvents,
      };
    } catch (error) {
      console.error('Error gathering day data:', error);
      return {
        totalDetections: 0,
        knownPeople: 0,
        unknownPeople: 0,
        animals: 0,
        vehicles: 0,
        notableEvents: [],
        cameraActivity: {},
        rawDetections: [],
        rawRecognitionEvents: [],
      };
    }
  }

  private async extractNotableEvents(detections: Detection[], recognitionEvents: RecognitionEvent[], cameraMap: Map<string, any>): Promise<any[]> {
    const notableEvents: any[] = [];

    try {
      // High confidence detections
      const highConfidenceDetections = detections.filter(d => d.confidence > 0.9);
      
      // New person/animal discoveries
      const newDiscoveries = recognitionEvents.filter(e => e.isNewDetection);
      
      // Known person visits
      const knownPersonVisits = recognitionEvents.filter(e => 
        e.entityType === 'person' && !e.isNewDetection
      );

      // Process high confidence detections
      for (const detection of highConfidenceDetections.slice(0, 5)) { // Limit to top 5
        const camera = cameraMap.get(detection.cameraId);
        const time = detection.createdAt?.toLocaleTimeString() || 'Unknown time';
        
        notableEvents.push({
          event: 'high_confidence_detection',
          time,
          camera: camera?.name || 'Unknown Camera',
          description: `High confidence ${detection.type} detection (${Math.round(detection.confidence * 100)}%)`,
          type: 'detection'
        });
      }

      // Process new discoveries
      for (const discovery of newDiscoveries.slice(0, 3)) { // Limit to top 3
        const camera = cameraMap.get(discovery.cameraId);
        const time = discovery.createdAt?.toLocaleTimeString() || 'Unknown time';
        
        notableEvents.push({
          event: 'new_discovery',
          time,
          camera: camera?.name || 'Unknown Camera',
          description: `New ${discovery.entityType} discovered and catalogued`,
          type: 'discovery'
        });
      }

      // Process known person visits
      for (const visit of knownPersonVisits.slice(0, 5)) { // Limit to top 5
        const camera = cameraMap.get(visit.cameraId);
        const time = visit.createdAt?.toLocaleTimeString() || 'Unknown time';
        
        notableEvents.push({
          event: 'known_person_visit',
          time,
          camera: camera?.name || 'Unknown Camera',
          description: visit.behaviorNotes || `Known person detected`,
          type: 'recognition'
        });
      }

      // Sort by time
      notableEvents.sort((a, b) => {
        const timeA = new Date(`1970/01/01 ${a.time}`).getTime();
        const timeB = new Date(`1970/01/01 ${b.time}`).getTime();
        return timeA - timeB;
      });

      return notableEvents;
    } catch (error) {
      console.error('Error extracting notable events:', error);
      return [];
    }
  }

  private async generateCameraActivity(detections: Detection[], recognitionEvents: RecognitionEvent[], cameraMap: Map<string, any>): Promise<any> {
    const cameraActivity: any = {};

    try {
      const cameraEntries = Array.from(cameraMap.entries());
      for (const [cameraId, camera] of cameraEntries) {
        const cameraDetections = detections.filter(d => d.cameraId === cameraId);
        const cameraRecognitions = recognitionEvents.filter(e => e.cameraId === cameraId);

        if (cameraDetections.length > 0 || cameraRecognitions.length > 0) {
          const highlights: string[] = [];

          // Add detection highlights
          const personCount = cameraDetections.filter(d => d.type === 'person').length;
          const animalCount = cameraDetections.filter(d => d.type === 'pet').length;
          const vehicleCount = cameraDetections.filter(d => d.type === 'vehicle').length;

          if (personCount > 0) highlights.push(`${personCount} person detection${personCount > 1 ? 's' : ''}`);
          if (animalCount > 0) highlights.push(`${animalCount} animal detection${animalCount > 1 ? 's' : ''}`);
          if (vehicleCount > 0) highlights.push(`${vehicleCount} vehicle detection${vehicleCount > 1 ? 's' : ''}`);

          // Add recognition highlights
          const newDiscoveries = cameraRecognitions.filter(e => e.isNewDetection).length;
          const knownRecognitions = cameraRecognitions.filter(e => !e.isNewDetection).length;

          if (newDiscoveries > 0) highlights.push(`${newDiscoveries} new entity${newDiscoveries > 1 ? 'ies' : 'y'} discovered`);
          if (knownRecognitions > 0) highlights.push(`${knownRecognitions} known entity recognition${knownRecognitions > 1 ? 's' : ''}`);

          cameraActivity[cameraId] = {
            name: camera.name,
            detections: cameraDetections.length,
            highlights: highlights.slice(0, 3), // Limit to top 3 highlights
          };
        }
      }

      return cameraActivity;
    } catch (error) {
      console.error('Error generating camera activity:', error);
      return {};
    }
  }

  private async generateAISummary(dayData: any): Promise<string> {
    try {
      const prompt = `Generate a comprehensive daily surveillance summary based on this data:

Total Detections: ${dayData.totalDetections}
Known People: ${dayData.knownPeople}
Unknown People: ${dayData.unknownPeople}
Animals: ${dayData.animals}
Vehicles: ${dayData.vehicles}

Notable Events: ${JSON.stringify(dayData.notableEvents, null, 2)}

Camera Activity: ${JSON.stringify(dayData.cameraActivity, null, 2)}

Generate a professional, detailed summary in a natural language format that covers:
1. Overall activity level for the day
2. Key events and patterns observed
3. Security observations and insights
4. Any unusual or noteworthy activities
5. Recognition system performance (new discoveries vs known entities)

Keep it professional but readable, like a security report. Limit to 3-4 paragraphs.`;

      const summary = await openaiService.generateText(prompt);
      return summary || 'Daily surveillance summary could not be generated.';
    } catch (error) {
      console.error('Error generating AI summary:', error);
      return 'Daily surveillance summary could not be generated due to an error.';
    }
  }

  private async generateAndUploadReport(date: Date, summary: DailySummary): Promise<void> {
    try {
      // Generate HTML report and upload to Google Drive
      const reportUrl = await googleDriveService.generateDailySummaryReport(date, summary);
      
      if (reportUrl) {
        console.log(`Daily report uploaded to Google Drive: ${reportUrl}`);
      }
    } catch (error) {
      console.error('Error generating and uploading report:', error);
    }
  }

  async getWeeklySummary(): Promise<any> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const summaries = await storage.getDailySummaries(7);
      
      if (summaries.length === 0) {
        return null;
      }

      // Aggregate weekly stats
      const weeklyStats = {
        totalDetections: summaries.reduce((sum, s) => sum + (s.totalDetections || 0), 0),
        totalKnownPeople: summaries.reduce((sum, s) => sum + (s.knownPeople || 0), 0),
        totalUnknownPeople: summaries.reduce((sum, s) => sum + (s.unknownPeople || 0), 0),
        totalAnimals: summaries.reduce((sum, s) => sum + (s.animals || 0), 0),
        totalVehicles: summaries.reduce((sum, s) => sum + (s.vehicles || 0), 0),
        activeDays: summaries.filter(s => (s.totalDetections || 0) > 0).length,
        averageDetectionsPerDay: Math.round(summaries.reduce((sum, s) => sum + (s.totalDetections || 0), 0) / summaries.length),
      };

      // Generate weekly insights
      const weeklyInsights = await this.generateWeeklyInsights(summaries, weeklyStats);

      return {
        period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        stats: weeklyStats,
        insights: weeklyInsights,
        dailySummaries: summaries,
      };
    } catch (error) {
      console.error('Error generating weekly summary:', error);
      return null;
    }
  }

  private async generateWeeklyInsights(summaries: DailySummary[], stats: any): Promise<string> {
    try {
      const prompt = `Generate weekly surveillance insights based on this data:

Weekly Statistics:
- Total Detections: ${stats.totalDetections}
- Known People: ${stats.totalKnownPeople}
- Unknown People: ${stats.totalUnknownPeople}  
- Animals: ${stats.totalAnimals}
- Vehicles: ${stats.totalVehicles}
- Active Days: ${stats.activeDays}/7
- Average Detections/Day: ${stats.averageDetectionsPerDay}

Daily Summaries: ${summaries.map(s => `${s.date.toDateString()}: ${s.summary}`).join('\n')}

Provide insights about:
1. Activity patterns and trends
2. Security observations
3. Recognition system learning progress
4. Any unusual patterns or recommendations
Keep it concise but informative.`;

      return await openaiService.generateText(prompt);
    } catch (error) {
      console.error('Error generating weekly insights:', error);
      return 'Weekly insights could not be generated.';
    }
  }

  async scheduleDailySummary(): Promise<void> {
    // Schedule daily summary generation at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0); // 12:01 AM

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(async () => {
      await this.generateDailySummary(new Date(now.getTime() - 24 * 60 * 60 * 1000)); // Yesterday
      
      // Schedule for next day
      setInterval(async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await this.generateDailySummary(yesterday);
      }, 24 * 60 * 60 * 1000); // Every 24 hours
      
    }, msUntilMidnight);

    console.log(`Daily summary scheduled for ${tomorrow.toLocaleString()}`);
  }

  async getRecognitionLearningProgress(): Promise<any> {
    try {
      const stats = await recognitionService.getRecognitionStats();
      
      // Get recent recognition events to show learning activity
      const recentEvents = await storage.getRecentRecognitionEvents(20);
      
      const learningProgress = {
        totalEntitiesLearned: stats.totalPeople + stats.totalAnimals + stats.totalVehicles,
        knownEntities: stats.knownPeople + stats.pets + stats.knownVehicles,
        recentLearning: recentEvents.filter(e => e.isNewDetection).length,
        recognitionAccuracy: recentEvents.length > 0 
          ? Math.round((recentEvents.filter(e => !e.isNewDetection).length / recentEvents.length) * 100)
          : 0,
        breakdown: {
          people: { total: stats.totalPeople, known: stats.knownPeople },
          animals: { total: stats.totalAnimals, pets: stats.pets, wildlife: stats.wildlife },
          vehicles: { total: stats.totalVehicles, known: stats.knownVehicles },
        },
      };

      return learningProgress;
    } catch (error) {
      console.error('Error getting recognition learning progress:', error);
      return null;
    }
  }
}

export const dailySummaryService = new DailySummaryService();