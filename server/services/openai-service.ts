import OpenAI from "openai";

// Default to widely-available, currently-supported models. Users can override via env.
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR;
const isConfigured = Boolean(apiKey && apiKey !== "your-openai-api-key-here");

const openai: OpenAI | null = isConfigured ? new OpenAI({ apiKey: apiKey! }) : null;

if (!isConfigured) {
  console.warn(
    "[OpenAIService] OPENAI_API_KEY is not configured. AI vision/text calls will return a disabled-mode response. " +
    "Set OPENAI_API_KEY in your .env or use a free alternative (see README → Free / open AI options)."
  );
}

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
    if (!openai) {
      return {
        detected: false,
        type: 'unknown',
        confidence: 0,
        description: 'AI analysis disabled (OPENAI_API_KEY not configured)',
        metadata: {},
      };
    }
    try {
      const response = await openai.chat.completions.create({
        model: VISION_MODEL,
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
    if (!openai) {
      return { type: 'unknown', classification: 'AI disabled (no API key)', confidence: 0 };
    }
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
        model: VISION_MODEL,
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

  async analyzeImageWithPrompt(imageBase64: string, prompt: string): Promise<string> {
    try {
      if (!openai) {
        return 'OpenAI API key not configured';
      }

      const response = await openai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ],
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content || 'No analysis available';
    } catch (error) {
      console.error('Error analyzing image with prompt:', error);
      return 'Error analyzing image';
    }
  }

  async generateText(prompt: string): Promise<string> {
    try {
      if (!openai) {
        return 'OpenAI API key not configured';
      }

      const response = await openai.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
      });

      return response.choices[0]?.message?.content || 'No response generated';
    } catch (error) {
      console.error('Error generating text:', error);
      return 'Error generating text';
    }
  }
}

export const openaiService = new OpenAIService();
