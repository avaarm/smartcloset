import { ClothingCategory } from '../types/clothing';

// Define pattern types for clothing
export type PatternType = 'solid' | 'striped' | 'plaid' | 'floral' | 'polka_dot' | 'graphic' | 'other';

// Types for the AI image recognition service
export interface RecognitionResult {
  category?: ClothingCategory;
  brand?: string;
  occasion?: string; // e.g., 'casual', 'formal', 'business', 'sports'
  color?: string;
  pattern?: PatternType;
  material?: string; // e.g., 'cotton', 'wool', 'polyester', 'leather'
  confidence: {
    category?: number;
    brand?: number;
    occasion?: number;
    color?: number;
    pattern?: number;
    material?: number;
  };
}

/**
 * Analyzes a clothing image and returns predicted attributes
 * 
 * @param imageUri - The URI of the image to analyze
 * @returns Promise<RecognitionResult> - The predicted clothing attributes
 */
export const analyzeClothingImage = async (imageUri: string): Promise<RecognitionResult> => {
  try {
    // For demonstration, we're using a mock implementation
    // In a real app, you would call an actual AI service API here
    
    // Mock API call delay - simulating real API latency
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // PRODUCTION IMPLEMENTATION EXAMPLE WITH CLARIFAI:
    // 
    // 1. Install Clarifai: npm install clarifai
    // 
    // 2. Import and initialize the client:
    // import { ClarifaiStub, grpc } from 'clarifai-nodejs-grpc';
    // const stub = ClarifaiStub.grpc();
    // const metadata = new grpc.Metadata();
    // metadata.set('authorization', 'Key YOUR_CLARIFAI_API_KEY');
    // 
    // 3. Prepare the request:
    // const request = {
    //   user_app_id: {
    //     user_id: 'clarifai',
    //     app_id: 'main'
    //   },
    //   inputs: [
    //     {
    //       data: {
    //         image: {
    //           url: imageUri
    //         }
    //       }
    //     }
    //   ],
    //   model_id: 'apparel-recognition'
    // };
    // 
    // 4. Make the prediction:
    // const response = await new Promise((resolve, reject) => {
    //   stub.PostModelOutputs(request, metadata, (err, response) => {
    //     if (err) reject(err);
    //     else resolve(response);
    //   });
    // });
    // 
    // 5. Process the response to extract attributes
    // const concepts = response.outputs[0].data.concepts;
    // const result = processClothingConcepts(concepts);
    // return result;
    
    // For now, return enhanced mock data based on the image URI
    const mockResults = getMockRecognitionResult(imageUri);
    
    return mockResults;
  } catch (error) {
    console.error('Error analyzing clothing image:', error);
    return {
      confidence: {}
    };
  }
};

/**
 * Process concepts returned from Clarifai API into clothing attributes
 * This would be used with a real API implementation
 */
const processClothingConcepts = (concepts: any[]): RecognitionResult => {
  // This is a simplified example of how you might process real API results
  const result: RecognitionResult = { confidence: {} };
  
  // Find category
  const categories: {[key: string]: ClothingCategory} = {
    'shirt': 'tops',
    't-shirt': 'tops',
    'blouse': 'tops',
    'sweater': 'tops',
    'pants': 'bottoms',
    'jeans': 'bottoms',
    'skirt': 'bottoms',
    'shorts': 'bottoms',
    'dress': 'dresses',
    'jacket': 'outerwear',
    'coat': 'outerwear',
    'shoes': 'shoes',
    'sneakers': 'shoes',
    'boots': 'shoes',
    'hat': 'accessories',
    'scarf': 'accessories',
    'bag': 'accessories',
    'jewelry': 'accessories'
  };
  
  // Find brands
  const brands = ['Nike', 'Adidas', 'Zara', 'H&M', 'Uniqlo', 'Levi\'s', 'Gap', 'Gucci', 'Prada'];
  
  // Process each concept
  concepts.forEach(concept => {
    const name = concept.name.toLowerCase();
    const value = concept.value; // confidence score
    
    // Check for category
    for (const [keyword, category] of Object.entries(categories)) {
      if (name.includes(keyword) && (!result.category || value > (result.confidence.category || 0))) {
        result.category = category;
        result.confidence.category = value;
      }
    }
    
    // Check for brand
    for (const brand of brands) {
      if (name.includes(brand.toLowerCase()) && (!result.brand || value > (result.confidence.brand || 0))) {
        result.brand = brand;
        result.confidence.brand = value;
      }
    }
    
    // Check for colors
    const colors = ['red', 'blue', 'green', 'black', 'white', 'yellow', 'purple', 'pink', 'orange', 'brown', 'gray'];
    for (const color of colors) {
      if (name.includes(color) && (!result.color || value > (result.confidence.color || 0))) {
        result.color = color;
        result.confidence.color = value;
      }
    }
    
    // Check for patterns
    const patterns: {[key: string]: PatternType} = {
      'striped': 'striped',
      'plaid': 'plaid',
      'floral': 'floral',
      'polka dot': 'polka_dot',
      'graphic': 'graphic',
      'solid': 'solid'
    };
    
    for (const [keyword, pattern] of Object.entries(patterns)) {
      if (name.includes(keyword) && (!result.pattern || value > (result.confidence.pattern || 0))) {
        result.pattern = pattern;
        result.confidence.pattern = value;
      }
    }
    
    // Check for materials
    const materials = ['cotton', 'wool', 'polyester', 'leather', 'denim', 'silk', 'linen'];
    for (const material of materials) {
      if (name.includes(material) && (!result.material || value > (result.confidence.material || 0))) {
        result.material = material;
        result.confidence.material = value;
      }
    }
    
    // Check for occasions
    const occasions = {
      'formal': ['formal', 'business', 'suit', 'tie', 'dress shoe'],
      'casual': ['casual', 'everyday', 't-shirt', 'jeans', 'sneaker'],
      'sports': ['sports', 'athletic', 'workout', 'running', 'gym'],
      'party': ['party', 'club', 'evening', 'cocktail'],
      'business': ['business', 'office', 'work', 'professional']
    };
    
    for (const [occasion, keywords] of Object.entries(occasions)) {
      for (const keyword of keywords) {
        if (name.includes(keyword) && (!result.occasion || value > (result.confidence.occasion || 0))) {
          result.occasion = occasion;
          result.confidence.occasion = value;
        }
      }
    }
  });
  
  return result;
};

/**
 * Helper function to generate mock recognition results
 * In a real app, this would be replaced with actual AI service response processing
 */
const getMockRecognitionResult = (imageUri: string): RecognitionResult => {
  // Use the last part of the URI as a seed for consistent mock results
  const seed = imageUri.split('/').pop() || '';
  const seedNum = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Mock categories with weighted probabilities
  const categories: ClothingCategory[] = ['tops', 'bottoms', 'dresses', 'outerwear', 'shoes', 'accessories'];
  const brands = ['Nike', 'Adidas', 'Zara', 'H&M', 'Uniqlo', 'Levi\'s', 'Gap', 'Gucci', 'Prada', 'Unknown'];
  const occasions = ['casual', 'formal', 'business', 'sports', 'party', 'everyday'];
  const colors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'brown', 'gray'];
  const patterns: PatternType[] = ['solid', 'striped', 'plaid', 'floral', 'polka_dot', 'graphic', 'other'];
  const materials = ['cotton', 'wool', 'polyester', 'leather', 'denim', 'silk', 'linen'];
  
  // Select mock values based on the seed
  const categoryIndex = seedNum % categories.length;
  const brandIndex = (seedNum * 13) % brands.length;
  const occasionIndex = (seedNum * 7) % occasions.length;
  const colorIndex = (seedNum * 5) % colors.length;
  const patternIndex = (seedNum * 11) % patterns.length;
  const materialIndex = (seedNum * 17) % materials.length;
  
  // Generate confidence scores (higher is better)
  const categoryConfidence = 0.5 + (seedNum % 50) / 100; // 0.5-0.99
  const brandConfidence = 0.3 + (seedNum % 60) / 100; // 0.3-0.89
  const occasionConfidence = 0.4 + (seedNum % 55) / 100; // 0.4-0.94
  const colorConfidence = 0.6 + (seedNum % 40) / 100; // 0.6-0.99
  const patternConfidence = 0.45 + (seedNum % 45) / 100; // 0.45-0.89
  const materialConfidence = 0.35 + (seedNum % 50) / 100; // 0.35-0.84
  
  return {
    category: categories[categoryIndex],
    brand: brands[brandIndex] === 'Unknown' ? undefined : brands[brandIndex],
    occasion: occasions[occasionIndex],
    color: colors[colorIndex],
    pattern: patterns[patternIndex],
    material: materials[materialIndex],
    confidence: {
      category: categoryConfidence,
      brand: brandConfidence,
      occasion: occasionConfidence,
      color: colorConfidence,
      pattern: patternConfidence,
      material: materialConfidence
    }
  };
};

/**
 * Determines if a recognition result is confident enough to use for autofill
 * 
 * @param result - The recognition result to evaluate
 * @param field - The specific field to check confidence for
 * @returns boolean - Whether the confidence is high enough
 */
export const isConfidentPrediction = (
  result: RecognitionResult, 
  field: 'category' | 'brand' | 'occasion' | 'color' | 'pattern' | 'material'
): boolean => {
  const threshold = {
    category: 0.7,
    brand: 0.8,
    occasion: 0.65,
    color: 0.75,
    pattern: 0.7,
    material: 0.75
  };
  
  return !!result.confidence[field] && (result.confidence[field] as number) >= threshold[field];
};
