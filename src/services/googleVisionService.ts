import { ClothingItem } from '../types';

// Configuration
const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';
const PRODUCT_SEARCH_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

// Types for Google Vision API responses
export interface GoogleVisionAnalysis {
  category: 'tops' | 'bottoms' | 'dresses' | 'outerwear' | 'shoes' | 'accessories';
  subcategory: string;
  colors: string[];
  dominantColor: string;
  brand?: string;
  description: string;
  confidence: number;
  suggestedName: string;
  season: ('spring' | 'summer' | 'fall' | 'winter')[];
  style: string[];
  material?: string;
  pattern?: string;
  textDetected: string[];
  similarProducts: SimilarProduct[];
}

export interface SimilarProduct {
  name: string;
  brand?: string;
  price?: string;
  url?: string;
  imageUrl: string;
  similarity: number;
}

interface GoogleVisionLabel {
  description: string;
  score: number;
  topicality: number;
}

interface GoogleVisionObject {
  name: string;
  score: number;
  boundingPoly: any;
}

interface GoogleVisionText {
  description: string;
  boundingPoly: any;
}

interface GoogleVisionColor {
  color: {
    red: number;
    green: number;
    blue: number;
  };
  score: number;
  pixelFraction: number;
}

class GoogleVisionService {
  private apiKey: string;
  private projectId: string;
  private location: string;
  private productSetId: string;

  constructor() {
    // In production, these should come from environment variables or secure storage
    this.apiKey = process.env.GOOGLE_VISION_API_KEY || '';
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    this.location = process.env.GOOGLE_VISION_LOCATION || 'us-west1';
    this.productSetId = process.env.PRODUCT_SET_ID || 'fashion-products';
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: 'Google Vision API key not configured' };
    }

    try {
      // Test with a simple label detection on a small test image
      const testImageBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
      
      const response = await fetch(`${GOOGLE_VISION_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: { content: testImageBase64 },
            features: [{ type: 'LABEL_DETECTION', maxResults: 1 }]
          }]
        })
      });

      if (response.ok) {
        return { success: true, message: 'Google Vision API connected successfully' };
      } else {
        const error = await response.text();
        return { success: false, message: `API Error: ${error}` };
      }
    } catch (error) {
      return { success: false, message: `Connection failed: ${error}` };
    }
  }

  /**
   * Analyze clothing image with Google Vision API
   */
  async analyzeClothingImage(imageUri: string): Promise<GoogleVisionAnalysis> {
    if (!this.apiKey) {
      throw new Error('Google Vision API key not configured');
    }

    try {
      // Convert image to base64 if it's a local file
      const imageBase64 = await this.imageToBase64(imageUri);
      
      const response = await fetch(`${GOOGLE_VISION_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 20 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'TEXT_DETECTION' },
              { type: 'IMAGE_PROPERTIES' },
            ]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Google Vision API error: ${response.statusText}`);
      }

      const data = await response.json();
      const analysis = this.parseVisionResponse(data.responses[0]);
      
      // Get similar products
      const similarProducts = await this.findSimilarProducts(imageBase64);
      analysis.similarProducts = similarProducts;

      return analysis;
    } catch (error) {
      console.error('Google Vision analysis error:', error);
      throw error;
    }
  }

  /**
   * Find similar products using Product Search API
   */
  async findSimilarProducts(imageBase64: string): Promise<SimilarProduct[]> {
    if (!this.projectId || !this.productSetId) {
      console.warn('Product Search not configured');
      return [];
    }

    try {
      const response = await fetch(`${PRODUCT_SEARCH_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{
              type: 'PRODUCT_SEARCH',
              maxResults: 10,
              productSearchParams: {
                productSet: `projects/${this.projectId}/locations/${this.location}/productSets/${this.productSetId}`,
                productCategories: ['apparel-v2'],
                filter: 'style=fashion'
              }
            }]
          }]
        })
      });

      if (!response.ok) {
        console.warn('Product Search API error:', response.statusText);
        return [];
      }

      const data = await response.json();
      return this.parseProductSearchResults(data.responses[0]);
    } catch (error) {
      console.warn('Product Search error:', error);
      return [];
    }
  }

  /**
   * Convert image URI to base64
   */
  private async imageToBase64(imageUri: string): Promise<string> {
    try {
      if (imageUri.startsWith('data:')) {
        // Already base64
        return imageUri.split(',')[1];
      }

      if (imageUri.startsWith('http')) {
        // Remote image - fetch and convert
        const response = await fetch(imageUri);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      // Local file - use React Native's file system
      const RNFS = require('react-native-fs');
      const base64 = await RNFS.readFile(imageUri, 'base64');
      return base64;
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw error;
    }
  }

  /**
   * Parse Google Vision API response
   */
  private parseVisionResponse(response: any): GoogleVisionAnalysis {
    const labels: GoogleVisionLabel[] = response.labelAnnotations || [];
    const objects: GoogleVisionObject[] = response.localizedObjectAnnotations || [];
    const textAnnotations: GoogleVisionText[] = response.textAnnotations || [];
    const imageProperties = response.imagePropertiesAnnotation || {};

    // Determine category
    const category = this.determineCategoryFromLabels(labels, objects);
    
    // Extract colors
    const colors = this.extractColors(imageProperties);
    
    // Extract text (brands, labels)
    const textDetected = textAnnotations.map(t => t.description);
    const brand = this.extractBrandFromText(textDetected);
    
    // Generate analysis
    const subcategory = this.determineSubcategory(category, labels, objects);
    const description = this.generateDescription(labels, objects);
    const suggestedName = this.generateSuggestedName(category, subcategory, brand);
    const season = this.determineSeason(labels, subcategory);
    const style = this.determineStyle(labels);
    const material = this.determineMaterial(labels);
    const pattern = this.determinePattern(labels);

    return {
      category,
      subcategory,
      colors: colors.map(c => c.name),
      dominantColor: colors[0]?.name || 'unknown',
      brand,
      description,
      confidence: labels[0]?.score || 0,
      suggestedName,
      season,
      style,
      material,
      pattern,
      textDetected,
      similarProducts: [] // Will be populated separately
    };
  }

  /**
   * Parse Product Search results
   */
  private parseProductSearchResults(response: any): SimilarProduct[] {
    const productSearchResults = response.productSearchResults?.results || [];
    
    return productSearchResults.map((result: any) => ({
      name: result.product?.displayName || 'Similar Item',
      brand: result.product?.productLabels?.find((label: any) => label.key === 'brand')?.value,
      price: result.product?.productLabels?.find((label: any) => label.key === 'price')?.value,
      url: result.product?.productLabels?.find((label: any) => label.key === 'url')?.value,
      imageUrl: result.image || '',
      similarity: result.score || 0
    }));
  }

  /**
   * Determine clothing category from labels and objects
   */
  private determineCategoryFromLabels(labels: GoogleVisionLabel[], objects: GoogleVisionObject[]): GoogleVisionAnalysis['category'] {
    const allDescriptions = [
      ...labels.map(l => l.description.toLowerCase()),
      ...objects.map(o => o.name.toLowerCase())
    ].join(' ');

    // Category mapping with priority
    const categoryMap = [
      { keywords: ['dress', 'gown', 'frock'], category: 'dresses' as const },
      { keywords: ['jacket', 'coat', 'blazer', 'cardigan', 'hoodie', 'sweater'], category: 'outerwear' as const },
      { keywords: ['pants', 'jeans', 'trousers', 'shorts', 'skirt', 'leggings'], category: 'bottoms' as const },
      { keywords: ['shoe', 'sneaker', 'boot', 'sandal', 'heel', 'loafer'], category: 'shoes' as const },
      { keywords: ['bag', 'purse', 'backpack', 'hat', 'cap', 'jewelry', 'watch', 'belt'], category: 'accessories' as const },
      { keywords: ['shirt', 'blouse', 't-shirt', 'tank', 'top', 'clothing'], category: 'tops' as const }
    ];

    for (const { keywords, category } of categoryMap) {
      if (keywords.some(keyword => allDescriptions.includes(keyword))) {
        return category;
      }
    }

    return 'tops'; // default
  }

  /**
   * Determine subcategory
   */
  private determineSubcategory(category: string, labels: GoogleVisionLabel[], objects: GoogleVisionObject[]): string {
    const descriptions = [...labels, ...objects.map(o => ({ description: o.name, score: o.score }))]
      .sort((a, b) => b.score - a.score)
      .map(item => item.description.toLowerCase());

    const subcategoryMap: { [key: string]: { [key: string]: string } } = {
      tops: {
        't-shirt': 'T-Shirt',
        'shirt': 'Shirt',
        'blouse': 'Blouse',
        'tank': 'Tank Top',
        'polo': 'Polo Shirt'
      },
      bottoms: {
        'jeans': 'Jeans',
        'pants': 'Pants',
        'shorts': 'Shorts',
        'skirt': 'Skirt',
        'leggings': 'Leggings'
      },
      outerwear: {
        'jacket': 'Jacket',
        'coat': 'Coat',
        'blazer': 'Blazer',
        'hoodie': 'Hoodie',
        'sweater': 'Sweater'
      },
      shoes: {
        'sneaker': 'Sneakers',
        'boot': 'Boots',
        'sandal': 'Sandals',
        'heel': 'Heels',
        'loafer': 'Loafers'
      },
      accessories: {
        'bag': 'Bag',
        'hat': 'Hat',
        'jewelry': 'Jewelry',
        'watch': 'Watch'
      },
      dresses: {
        'dress': 'Dress',
        'gown': 'Gown'
      }
    };

    const categoryMap = subcategoryMap[category] || {};
    
    for (const description of descriptions) {
      for (const [keyword, subcategory] of Object.entries(categoryMap)) {
        if (description.includes(keyword)) {
          return subcategory;
        }
      }
    }

    return category.charAt(0).toUpperCase() + category.slice(1, -1); // Remove 's' and capitalize
  }

  /**
   * Extract colors from image properties
   */
  private extractColors(imageProperties: any): Array<{name: string, confidence: number}> {
    const colors: GoogleVisionColor[] = imageProperties.dominantColors?.colors || [];
    
    return colors
      .slice(0, 5) // Top 5 colors
      .map(color => ({
        name: this.rgbToColorName(color.color),
        confidence: color.score
      }));
  }

  /**
   * Convert RGB to color name
   */
  private rgbToColorName(rgb: { red: number; green: number; blue: number }): string {
    const { red = 0, green = 0, blue = 0 } = rgb;
    
    // Enhanced color detection
    if (red > 240 && green > 240 && blue > 240) return 'white';
    if (red < 30 && green < 30 && blue < 30) return 'black';
    if (red < 50 && green < 50 && blue < 50) return 'dark gray';
    if (red > 200 && green > 200 && blue > 200) return 'light gray';
    if (red > 150 && green > 150 && blue > 150) return 'gray';
    
    // Primary colors
    if (red > green + 50 && red > blue + 50) {
      if (red > 200) return 'red';
      return 'dark red';
    }
    if (green > red + 50 && green > blue + 50) {
      if (green > 200) return 'green';
      return 'dark green';
    }
    if (blue > red + 50 && blue > green + 50) {
      if (blue > 200) return 'blue';
      return 'dark blue';
    }
    
    // Secondary colors
    if (red > 150 && green > 150 && blue < 100) return 'yellow';
    if (red > 150 && blue > 150 && green < 100) return 'purple';
    if (green > 150 && blue > 150 && red < 100) return 'cyan';
    if (red > 150 && green > 100 && blue < 100) return 'orange';
    if (red > 100 && green > 150 && blue < 100) return 'lime';
    if (red > 150 && green < 100 && blue > 100) return 'magenta';
    
    // Browns and earth tones
    if (red > 100 && green > 70 && blue < 70 && red > green) return 'brown';
    if (red > 80 && green > 60 && blue > 40 && red >= green && green >= blue) return 'tan';
    
    return 'multicolor';
  }

  /**
   * Extract brand from detected text
   */
  private extractBrandFromText(textDetected: string[]): string | undefined {
    const commonBrands = [
      'nike', 'adidas', 'puma', 'reebok', 'converse', 'vans',
      'zara', 'h&m', 'uniqlo', 'gap', 'old navy', 'banana republic',
      'levi', 'calvin klein', 'tommy hilfiger', 'ralph lauren',
      'gucci', 'prada', 'louis vuitton', 'chanel', 'dior',
      'north face', 'patagonia', 'columbia', 'under armour'
    ];
    
    const allText = textDetected.join(' ').toLowerCase();
    
    for (const brand of commonBrands) {
      if (allText.includes(brand)) {
        return brand.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      }
    }
    
    return undefined;
  }

  /**
   * Generate description
   */
  private generateDescription(labels: GoogleVisionLabel[], objects: GoogleVisionObject[]): string {
    const topLabels = labels.slice(0, 3).map(l => l.description);
    const topObjects = objects.slice(0, 2).map(o => o.name);
    
    const allDescriptors = [...topLabels, ...topObjects];
    return `A ${allDescriptors.join(', ').toLowerCase()} item`;
  }

  /**
   * Generate suggested name
   */
  private generateSuggestedName(category: string, subcategory: string, brand?: string): string {
    const brandPrefix = brand ? `${brand} ` : '';
    return `${brandPrefix}${subcategory}`;
  }

  /**
   * Determine season
   */
  private determineSeason(labels: GoogleVisionLabel[], subcategory: string): ('spring' | 'summer' | 'fall' | 'winter')[] {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    const subcat = subcategory.toLowerCase();
    
    // Winter items
    if (subcat.includes('coat') || subcat.includes('sweater') || subcat.includes('boot') || 
        descriptions.includes('wool') || descriptions.includes('fur')) {
      return ['fall', 'winter'];
    }
    
    // Summer items
    if (subcat.includes('shorts') || subcat.includes('tank') || subcat.includes('sandal') ||
        descriptions.includes('swimwear') || descriptions.includes('bikini')) {
      return ['spring', 'summer'];
    }
    
    // Versatile items
    return ['spring', 'summer', 'fall', 'winter'];
  }

  /**
   * Determine style
   */
  private determineStyle(labels: GoogleVisionLabel[]): string[] {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    const styles = [];
    
    if (descriptions.includes('formal') || descriptions.includes('suit') || descriptions.includes('dress shirt')) {
      styles.push('formal');
    }
    if (descriptions.includes('casual') || descriptions.includes('jeans') || descriptions.includes('t-shirt')) {
      styles.push('casual');
    }
    if (descriptions.includes('sport') || descriptions.includes('athletic') || descriptions.includes('gym')) {
      styles.push('sporty');
    }
    if (descriptions.includes('elegant') || descriptions.includes('chic')) {
      styles.push('elegant');
    }
    
    return styles.length > 0 ? styles : ['casual'];
  }

  /**
   * Determine material
   */
  private determineMaterial(labels: GoogleVisionLabel[]): string | undefined {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    
    const materials = ['denim', 'leather', 'cotton', 'wool', 'silk', 'polyester', 'linen', 'cashmere'];
    
    for (const material of materials) {
      if (descriptions.includes(material)) {
        return material.charAt(0).toUpperCase() + material.slice(1);
      }
    }
    
    return undefined;
  }

  /**
   * Determine pattern
   */
  private determinePattern(labels: GoogleVisionLabel[]): string | undefined {
    const descriptions = labels.map(l => l.description.toLowerCase()).join(' ');
    
    const patterns = ['striped', 'floral', 'plaid', 'polka dot', 'geometric', 'animal print'];
    
    for (const pattern of patterns) {
      if (descriptions.includes(pattern)) {
        return pattern.charAt(0).toUpperCase() + pattern.slice(1);
      }
    }
    
    return 'solid';
  }

  /**
   * Convert analysis to ClothingItem
   */
  async createClothingItemFromAnalysis(
    imageUri: string, 
    analysis: GoogleVisionAnalysis
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
}

export default GoogleVisionService;
