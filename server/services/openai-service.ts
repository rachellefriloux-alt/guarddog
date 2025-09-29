import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface MotionDetectionResult {
  detected: boolean;
  type: 'person' | 'pet' | 'vehicle' | 'unknown';
  confidence: number;
  description: string;
  metadata?: {
    classification?: string;
    count?: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
  };
}

export class OpenAIService {
  async analyzeImageForMotion(base64Image: string): Promise<MotionDetectionResult> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are an AI surveillance analyst. Analyze the image for motion detection and classify any detected subjects. Focus on identifying:
            - People (adults, children)
            - Pets (cats, dogs, etc.)
            - Vehicles (cars, trucks, motorcycles, bicycles)
            
            Respond with JSON in this exact format:
            {
              "detected": boolean,
              "type": "person" | "pet" | "vehicle" | "unknown",
              "confidence": number between 0 and 1,
              "description": "Brief description of what was detected",
              "metadata": {
                "classification": "Specific classification (e.g., 'Adult human', 'Domestic cat', 'Sedan')",
                "count": number of subjects detected,
                "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 }
              }
            }
            
            If nothing significant is detected, set detected to false and type to "unknown".`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this surveillance camera image for motion detection. Identify any people, pets, or vehicles."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        detected: result.detected || false,
        type: result.type || 'unknown',
        confidence: Math.max(0, Math.min(1, result.confidence || 0)),
        description: result.description || 'No motion detected',
        metadata: result.metadata || {}
      };
    } catch (error) {
      console.error('OpenAI Vision API error:', error);
      return {
        detected: false,
        type: 'unknown',
        confidence: 0,
        description: 'Analysis failed',
        metadata: {}
      };
    }
  }

  async classifyDetection(description: string, imageBase64?: string): Promise<{
    type: 'person' | 'pet' | 'vehicle' | 'unknown';
    classification: string;
    confidence: number;
  }> {
    try {
      const messages: any[] = [
        {
          role: "system",
          content: `You are a surveillance classification expert. Classify the detected object based on the description${imageBase64 ? ' and image' : ''}. 
          Respond with JSON in this format:
          {
            "type": "person" | "pet" | "vehicle" | "unknown",
            "classification": "Specific classification",
            "confidence": number between 0 and 1
          }`
        },
        {
          role: "user",
          content: imageBase64 ? [
            { type: "text", text: `Classify this detection: ${description}` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ] : `Classify this detection: ${description}`
        }
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        type: result.type || 'unknown',
        classification: result.classification || 'Unclassified',
        confidence: Math.max(0, Math.min(1, result.confidence || 0))
      };
    } catch (error) {
      console.error('OpenAI classification error:', error);
      return {
        type: 'unknown',
        classification: 'Classification failed',
        confidence: 0
      };
    }
  }
}

export const openaiService = new OpenAIService();
