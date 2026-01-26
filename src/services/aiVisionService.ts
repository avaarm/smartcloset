import { ClothingItem } from '../types';

// Configuration for different AI services
const AI_SERVICES = {
  GOOGLE_VISION: 'google-vision',
  AMAZON_REKOGNITION: 'amazon-rekognition',
  AZURE_VISION: 'azure-vision',
  OPENAI_VISION: 'openai-vision'
};

// Types for AI analysis results
export interface AIAnalysisResult {
  category: 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';
  subcategory?: string;
  colors: string[];
  dominantColor: string;
  brand?: string;
  description: string;
  confidence: number;
  suggestedName: string;
  season?: ('spring' | 'summer' | 'fall' | 'winter')[];
  style?: string[];
  material?: string;
  pattern?: string;
  similarProducts?: SimilarProduct[];
}

export interface SimilarProduct {
  name: string;
  brand: string;
  price?: string;
  url: string;
  imageUrl: string;
  similarity: number;
}

class AIVisionService {
  private apiKey: string;
  private service: string;

  constructor(service: string = AI_SERVICES.GOOGLE_VISION) {
    this.service = service;
    this.apiKey = this.getApiKey(service);
  }

  private getApiKey(service: string): string {
    // In production, these would come from environment variables
    switch (service) {
      case AI_SERVICES.GOOGLE_VISION:
        return process.env.GOOGLE_VISION_API_KEY || '';
      case AI_SERVICES.OPENAI_VISION:
        return process.env.OPENAI_API_KEY || '';
      case AI_SERVICES.AMAZON_REKOGNITION:
        return process.env.AWS_ACCESS_KEY || '';
      case AI_SERVICES.AZURE_VISION:
        return process.env.AZURE_VISION_KEY || '';
      default:
        return '';
    }
  }

  /**
   * Analyze clothing image using Google Vision API
   */
  async analyzeWithGoogleVision(imageUri: string): Promise<AIAnalysisResult> {
    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  source: { imageUri }
                },
                features: [
                  { type: 'LABEL_DETECTION', maxResults: 10 },
                  { type: 'TEXT_DETECTION' },
                  { type: 'OBJECT_LOCALIZATION' },
                  { type: 'IMAGE_PROPERTIES' },
                  { type: 'PRODUCT_SEARCH', maxResults: 5 }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();
      return this.parseGoogleVisionResponse(data);
    } catch (error) {
      console.error('Google Vision API error:', error);
      throw error;
    }
  }

  /**
   * Analyze clothing image using OpenAI Vision (GPT-4V)
   */
  async analyzeWithOpenAI(imageUri: string): Promise<AIAnalysisResult> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this clothing item and return a JSON response with:
                  - category (tops/bottoms/dresses/outerwear/shoes/accessories)
                  - subcategory (e.g., t-shirt, jeans, sneakers)
                  - colors (array of colors present)
                  - dominantColor (main color)
                  - brand (if visible)
                  - description (detailed description)
                  - suggestedName (what to call this item)
                  - season (which seasons it's suitable for)
                  - style (casual, formal, sporty, etc.)
                  - material (cotton, denim, leather, etc.)
                  - pattern (solid, striped, floral, etc.)
                  - confidence (0-1 score)`
                },
                {
                  type: 'image_url',
                  image_url: { url: imageUri }
                }
              ]
            }
          ],
          max_tokens: 500
        })
      });

      const data = await response.json();
      return this.parseOpenAIResponse(data);
    } catch (error) {
      console.error('OpenAI Vision API error:', error);
      throw error;
    }
  }

  /**
   * Find similar products online (Google Lens-like functionality)
   */
  async findSimilarProducts(imageUri: string): Promise<SimilarProduct[]> {
    try {
      // Using Google's Product Search API
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  source: { imageUri }
                },
                features: [
                  { 
                    type: 'PRODUCT_SEARCH', 
                    maxResults: 10,
                    productSearchParams: {
                      productSet: 'projects/your-project/locations/us-west1/productSets/fashion-products',
                      productCategories: ['apparel-v2'],
                      filter: 'style=fashion'
                    }
                  }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();
      return this.parseSimilarProducts(data);
    } catch (error) {
      console.error('Product search error:', error);
      return [];
    }
  }

  /**
   * Main analysis function that combines multiple AI services
   */
  async analyzeClothingImage(imageUri: string): Promise<AIAnalysisResult> {
    switch (this.service) {
      case AI_SERVICES.GOOGLE_VISION:
        return this.analyzeWithGoogleVision(imageUri);
      case AI_SERVICES.OPENAI_VISION:
        return this.analyzeWithOpenAI(imageUri);
      default:
        throw new Error(`Unsupported AI service: ${this.service}`);
    }
  }

  /**
   * Convert AI analysis to ClothingItem
   */
  async createClothingItemFromAnalysis(
    imageUri: string, 
    analysis: AIAnalysisResult
  ): Promise<Partial<ClothingItem>> {
    return {
      name: analysis.suggestedName,
      category: analysis.category,
      color: analysis.dominantColor,
      season: analysis.season,
      brand: analysis.brand,
      userImage: imageUri,
      dateAdded: new Date().toISOString(),
    };
  }

  private parseGoogleVisionResponse(data: any): AIAnalysisResult {
    const annotations = data.responses[0];
    
    // Extract labels for category detection
    const labels = annotations.labelAnnotations || [];
    const objects = annotations.localizedObjectAnnotations || [];
    const textAnnotations = annotations.textAnnotations || [];
    const imageProperties = annotations.imagePropertiesAnnotation || {};
    
    // Determine category from labels
    const category = this.determineCategoryFromLabels(labels);
    
    // Extract colors
    const colors = this.extractColors(imageProperties);
    
    // Extract brand from text
    const brand = this.extractBrandFromText(textAnnotations);
    
    // Generate description
    const description = this.generateDescription(labels, objects);
    
    return {
      category,
      colors: colors.map(c => c.name),
      dominantColor: colors[0]?.name || 'unknown',
      brand,
      description,
      confidence: labels[0]?.score || 0,
      suggestedName: this.generateSuggestedName(category, labels),
      season: this.determineSeason(labels),
      style: this.determineStyle(labels),
      material: this.determineMaterial(labels),
      pattern: this.determinePattern(labels)
    };
  }

  private parseOpenAIResponse(data: any): AIAnalysisResult {
    try {
      const content = data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in OpenAI response');
    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
      throw error;
    }
  }

  private parseSimilarProducts(data: any): SimilarProduct[] {
    // Parse Google Product Search results
    const productSearchResults = data.responses[0]?.productSearchResults?.results || [];
    
    return productSearchResults.map((result: any) => ({
      name: result.product?.displayName || 'Unknown Product',
      brand: result.product?.productLabels?.find((label: any) => label.key === 'brand')?.value || 'Unknown Brand',
      url: result.product?.productLabels?.find((label: any) => label.key === 'url')?.value || '',
      imageUrl: result.image || '',
      similarity: result.score || 0
    }));
  }

  // Helper methods for parsing Google Vision results
  private determineCategoryFromLabels(labels: any[]): AIAnalysisResult['category'] {
    const categoryMap = {
      'clothing': 'tops',
      'shirt': 'tops',
      'blouse': 'tops',
      't-shirt': 'tops',
      'sweater': 'tops',
      'jacket': 'outerwear',
      'coat': 'outerwear',
      'pants': 'bottoms',
      'jeans': 'bottoms',
      'trousers': 'bottoms',
      'skirt': 'bottoms',
      'dress': 'dresses',
      'shoe': 'shoes',
      'sneaker': 'shoes',
      'boot': 'shoes',
      'sandal': 'shoes',
      'bag': 'accessories',
      'hat': 'accessories',
      'jewelry': 'accessories'
    };

    for (const label of labels) {
      const description = label.description.toLowerCase();
      for (const [key, category] of Object.entries(categoryMap)) {
        if (description.includes(key)) {
          return category as AIAnalysisResult['category'];
        }
      }
    }
    
    return 'tops'; // default
  }

  private extractColors(imageProperties: any): Array<{name: string, confidence: number}> {
    const colors = imageProperties.dominantColors?.colors || [];
    return colors.map((color: any) => ({
      name: this.rgbToColorName(color.color),
      confidence: color.score
    }));
  }

  private rgbToColorName(rgb: any): string {
    // Simple color mapping - in production, use a more sophisticated color library
    const { red = 0, green = 0, blue = 0 } = rgb;
    
    if (red > 200 && green > 200 && blue > 200) return 'white';
    if (red < 50 && green < 50 && blue < 50) return 'black';
    if (red > green && red > blue) return 'red';
    if (green > red && green > blue) return 'green';
    if (blue > red && blue > green) return 'blue';
    if (red > 150 && green > 150) return 'yellow';
    if (red > 150 && blue > 150) return 'purple';
    if (green > 150 && blue > 150) return 'cyan';
    
    return 'multicolor';
  }

  private extractBrandFromText(textAnnotations: any[]): string | undefined {
    // Look for common fashion brand names in detected text
    const commonBrands = ['nike', 'adidas', 'zara', 'h&m', 'uniqlo', 'gap', 'levi', 'calvin klein'];
    
    for (const annotation of textAnnotations) {
      const text = annotation.description.toLowerCase();
      for (const brand of commonBrands) {
        if (text.includes(brand)) {
          return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
      }
    }
    
    return undefined;
  }

  private generateDescription(labels: any[], objects: any[]): string {
    const topLabels = labels.slice(0, 3).map(l => l.description);
    return `A ${topLabels.join(', ').toLowerCase()} item`;
  }

  private generateSuggestedName(category: string, labels: any[]): string {
    const topLabel = labels[0]?.description || category;
    return topLabel.charAt(0).toUpperCase() + topLabel.slice(1);
  }

  private determineSeason(labels: any[]): ('spring' | 'summer' | 'fall' | 'winter')[] {
    // Logic to determine season based on clothing type
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    
    if (descriptions.includes('coat') || descriptions.includes('sweater')) {
      return ['fall', 'winter'];
    }
    if (descriptions.includes('shorts') || descriptions.includes('tank')) {
      return ['spring', 'summer'];
    }
    
    return ['spring', 'summer', 'fall', 'winter']; // versatile item
  }

  private determineStyle(labels: any[]): string[] {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    const styles = [];
    
    if (descriptions.includes('formal') || descriptions.includes('suit')) styles.push('formal');
    if (descriptions.includes('casual') || descriptions.includes('jeans')) styles.push('casual');
    if (descriptions.includes('sport') || descriptions.includes('athletic')) styles.push('sporty');
    
    return styles.length > 0 ? styles : ['casual'];
  }

  private determineMaterial(labels: any[]): string {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    
    if (descriptions.includes('denim')) return 'denim';
    if (descriptions.includes('leather')) return 'leather';
    if (descriptions.includes('cotton')) return 'cotton';
    if (descriptions.includes('wool')) return 'wool';
    
    return 'unknown';
  }

  private determinePattern(labels: any[]): string {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    
    if (descriptions.includes('striped')) return 'striped';
    if (descriptions.includes('floral')) return 'floral';
    if (descriptions.includes('plaid')) return 'plaid';
    
    return 'solid';
  }
}

export default AIVisionService;
