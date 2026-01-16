/**
 * Infer creator niche from profile data, platforms, and content
 * Uses two-stage classification: strong match overrides, then weighted scoring
 */

interface InferNicheInput {
  name?: string | null;
  username?: string | null;
  platforms?: Array<{ platform?: string; handle?: string }>;
  topContent?: Array<{ title?: string }>;
  bio?: string | null;
}

// STAGE 1: Strong match overrides (hard rules - return immediately if found)
// These patterns guarantee a niche classification and prevent wrong classifications
const STRONG_MATCHES: Record<string, string> = {
  // Minecraft-specific (highest priority to prevent Finance misclassification)
  'minecraft': 'Gaming',
  'hypixel': 'Gaming',
  'bedwars': 'Gaming',
  'smp': 'Gaming',
  'creeper': 'Gaming',
  'nether': 'Gaming',
  'ender': 'Gaming',
  'redstone': 'Gaming',
  'villager': 'Gaming',
  'survival': 'Gaming',
  'minecraft mod': 'Gaming',
  'minecraft seed': 'Gaming',
  
  // Other gaming platforms
  'fortnite': 'Gaming',
  'roblox': 'Gaming',
  'valorant': 'Gaming',
  'call of duty': 'Gaming',
  'cod ': 'Gaming', // Space to avoid matching "code"
  ' cod ': 'Gaming',
  
  // Gaming activity indicators
  'gameplay': 'Gaming',
  'lets play': 'Gaming',
  'let\'s play': 'Gaming',
  'stream': 'Gaming',
  'twitch': 'Gaming',
  'gaming': 'Gaming',
  'gamer': 'Gaming',
};

// STAGE 2: Weighted keywords per niche
interface WeightedKeyword {
  keyword: string;
  weight: number;
}

const WEIGHTED_KEYWORDS: Record<string, WeightedKeyword[]> = {
  gaming: [
    { keyword: 'minecraft', weight: 20 },
    { keyword: 'mod', weight: 8 },
    { keyword: 'survival', weight: 8 },
    { keyword: 'smp', weight: 10 },
    { keyword: 'hypixel', weight: 12 },
    { keyword: 'bedwars', weight: 12 },
    { keyword: 'creeper', weight: 12 },
    { keyword: 'nether', weight: 12 },
    { keyword: 'ender', weight: 10 },
    { keyword: 'villager', weight: 8 },
    { keyword: 'redstone', weight: 10 },
    { keyword: 'seed', weight: 6 },
    { keyword: 'gaming', weight: 8 },
    { keyword: 'gamer', weight: 8 },
    { keyword: 'fortnite', weight: 15 },
    { keyword: 'roblox', weight: 15 },
    { keyword: 'valorant', weight: 15 },
    { keyword: 'ps5', weight: 8 },
    { keyword: 'xbox', weight: 8 },
    { keyword: 'nintendo', weight: 8 },
    { keyword: 'switch', weight: 8 },
    { keyword: 'pc gaming', weight: 10 },
    { keyword: 'esports', weight: 10 },
    { keyword: 'gameplay', weight: 12 },
    { keyword: 'lets play', weight: 12 },
    { keyword: 'let\'s play', weight: 12 },
    { keyword: 'stream', weight: 10 },
    { keyword: 'twitch', weight: 10 },
  ],
  fitness: [
    { keyword: 'fitness', weight: 10 },
    { keyword: 'gym', weight: 8 },
    { keyword: 'workout', weight: 8 },
    { keyword: 'protein', weight: 8 },
    { keyword: 'cut', weight: 6 },
    { keyword: 'bulk', weight: 6 },
    { keyword: 'cardio', weight: 6 },
    { keyword: 'exercise', weight: 6 },
    { keyword: 'training', weight: 6 },
    { keyword: 'muscle', weight: 8 },
    { keyword: 'strength', weight: 8 },
    { keyword: 'weight', weight: 6 },
    { keyword: 'diet', weight: 6 },
    { keyword: 'nutrition', weight: 6 },
    { keyword: 'health', weight: 6 },
    { keyword: 'wellness', weight: 6 },
  ],
  tech: [
    { keyword: 'tech', weight: 10 },
    { keyword: 'ai', weight: 8 },
    { keyword: 'iphone', weight: 8 },
    { keyword: 'android', weight: 8 },
    { keyword: 'review', weight: 6 },
    { keyword: 'setup', weight: 6 },
    { keyword: 'pc', weight: 6 },
    { keyword: 'software', weight: 6 },
    { keyword: 'app', weight: 6 },
    { keyword: 'gadget', weight: 6 },
    { keyword: 'device', weight: 6 },
    { keyword: 'laptop', weight: 6 },
    { keyword: 'computer', weight: 6 },
    { keyword: 'coding', weight: 8 },
    { keyword: 'programming', weight: 8 },
    { keyword: 'developer', weight: 8 },
  ],
  beauty: [
    { keyword: 'beauty', weight: 10 },
    { keyword: 'makeup', weight: 10 },
    { keyword: 'skincare', weight: 10 },
    { keyword: 'grwm', weight: 12 },
    { keyword: 'hair', weight: 8 },
    { keyword: 'lash', weight: 8 },
    { keyword: 'nails', weight: 8 },
    { keyword: 'cosmetic', weight: 8 },
    { keyword: 'routine', weight: 6 },
    { keyword: 'tutorial', weight: 6 },
    { keyword: 'glam', weight: 8 },
    { keyword: 'aesthetic', weight: 6 },
  ],
  food: [
    { keyword: 'recipe', weight: 10 },
    { keyword: 'cook', weight: 8 },
    { keyword: 'cooking', weight: 10 },
    { keyword: 'meal', weight: 8 },
    { keyword: 'food', weight: 6 },
    { keyword: 'eat', weight: 6 },
    { keyword: 'kitchen', weight: 8 },
    { keyword: 'baking', weight: 10 },
    { keyword: 'restaurant', weight: 8 },
    { keyword: 'chef', weight: 10 },
    { keyword: 'cuisine', weight: 8 },
    { keyword: 'delicious', weight: 6 },
    { keyword: 'tasty', weight: 6 },
  ],
  comedy: [
    { keyword: 'funny', weight: 10 },
    { keyword: 'skit', weight: 10 },
    { keyword: 'prank', weight: 10 },
    { keyword: 'meme', weight: 10 },
    { keyword: 'comedy', weight: 12 },
    { keyword: 'humor', weight: 8 },
    { keyword: 'joke', weight: 8 },
    { keyword: 'laugh', weight: 6 },
    { keyword: 'hilarious', weight: 8 },
    { keyword: 'entertainment', weight: 6 },
  ],
  finance: [
    { keyword: 'investing', weight: 15 },
    { keyword: 'stocks', weight: 15 },
    { keyword: 'crypto', weight: 15 },
    { keyword: 'bitcoin', weight: 15 },
    { keyword: 'trading', weight: 15 },
    { keyword: 'options', weight: 15 },
    { keyword: 'money', weight: 6 },
    { keyword: 'invest', weight: 12 },
    { keyword: 'real estate', weight: 12 },
    { keyword: 'finance', weight: 12 },
    { keyword: 'wealth', weight: 8 },
    { keyword: 'budget', weight: 6 },
    { keyword: 'savings', weight: 6 },
    { keyword: 'financial', weight: 8 },
  ],
  lifestyle: [
    { keyword: 'vlog', weight: 12 },
    { keyword: 'day in the life', weight: 12 },
    { keyword: 'travel', weight: 10 },
    { keyword: 'morning routine', weight: 10 },
    { keyword: 'lifestyle', weight: 10 },
    { keyword: 'daily', weight: 6 },
    { keyword: 'routine', weight: 6 },
    { keyword: 'day', weight: 4 },
    { keyword: 'life', weight: 4 },
  ],
  fashion: [
    { keyword: 'fashion', weight: 10 },
    { keyword: 'style', weight: 8 },
    { keyword: 'outfit', weight: 10 },
    { keyword: 'clothing', weight: 8 },
    { keyword: 'wardrobe', weight: 8 },
    { keyword: 'trend', weight: 6 },
    { keyword: 'aesthetic', weight: 6 },
    { keyword: 'ootd', weight: 12 },
    { keyword: 'fashionista', weight: 10 },
  ],
  education: [
    { keyword: 'learn', weight: 8 },
    { keyword: 'study', weight: 8 },
    { keyword: 'education', weight: 10 },
    { keyword: 'tutorial', weight: 8 },
    { keyword: 'how to', weight: 10 },
    { keyword: 'tips', weight: 6 },
    { keyword: 'guide', weight: 8 },
    { keyword: 'knowledge', weight: 8 },
    { keyword: 'learning', weight: 8 },
  ],
};

// Confidence threshold - minimum score to return a niche
const CONFIDENCE_THRESHOLD = 8;

export interface InferNicheResult {
  niche: string;
  confidence: number;
  reasons: string[];
}

/**
 * Infer niche from available data
 * Uses two-stage classification:
 * 1. Strong match overrides (immediate return)
 * 2. Weighted scoring with confidence threshold
 * Returns null if confidence is too low
 */
export function inferNiche(input: InferNicheInput): InferNicheResult | null {
  // Combine all text sources into one searchable string
  const textSources: string[] = [];
  
  if (input.name) textSources.push(input.name);
  if (input.username) textSources.push(input.username);
  if (input.bio) textSources.push(input.bio);
  
  if (input.platforms) {
    input.platforms.forEach(p => {
      if (p.platform) textSources.push(p.platform);
      if (p.handle) textSources.push(p.handle);
    });
  }
  
  if (input.topContent) {
    input.topContent.forEach(content => {
      if (content.title) textSources.push(content.title);
    });
  }
  
  const combinedText = textSources.join(' ').toLowerCase();
  
  // If no meaningful data, return null
  if (combinedText.trim().length === 0) {
    return null;
  }
  
  // STAGE 1: Check for strong match overrides
  for (const [pattern, niche] of Object.entries(STRONG_MATCHES)) {
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(combinedText)) {
      return {
        niche,
        confidence: 95, // High confidence for strong matches
        reasons: [`Strong match: "${pattern}"`],
      };
    }
  }
  
  // STAGE 2: Weighted scoring
  const nicheScores: Record<string, number> = {};
  
  Object.entries(WEIGHTED_KEYWORDS).forEach(([niche, keywords]) => {
    let score = 0;
    keywords.forEach(({ keyword, weight }) => {
      const regex = new RegExp(keyword, 'gi');
      const matches = combinedText.match(regex);
      if (matches) {
        score += weight * matches.length;
      }
    });
    if (score > 0) {
      nicheScores[niche] = score;
    }
  });
  
  // Special rule: Finance requires at least 2 strong matches
  if (nicheScores.finance) {
    const financeStrongMatches = ['investing', 'stocks', 'crypto', 'bitcoin', 'trading', 'options'];
    const strongMatchCount = financeStrongMatches.filter(match => 
      new RegExp(match, 'gi').test(combinedText)
    ).length;
    
    if (strongMatchCount < 2) {
      // Reduce finance score significantly if not enough strong matches
      nicheScores.finance = Math.floor(nicheScores.finance * 0.3);
    }
    
    // If gaming signals exist, heavily penalize finance
    if (nicheScores.gaming && nicheScores.gaming > 10) {
      nicheScores.finance = Math.floor(nicheScores.finance * 0.1);
    }
  }
  
  // Find niche with highest score
  const entries = Object.entries(nicheScores);
  if (entries.length === 0) {
    return null; // No match found
  }
  
  // Sort by score descending
  entries.sort((a, b) => b[1] - a[1]);
  
  // Check confidence threshold
  const topScore = entries[0][1];
  const secondScore = entries.length > 1 ? entries[1][1] : 0;
  
  if (topScore < CONFIDENCE_THRESHOLD) {
    return null; // Not confident enough, return null (will show "Creator")
  }
  
  // Calculate confidence (0-100) based on score and margin
  const scoreMargin = topScore - secondScore;
  const confidence = Math.min(95, Math.max(50, Math.floor((topScore / 100) * 70 + (scoreMargin / topScore) * 30)));
  
  // Build reasons from top keywords found
  const topNiche = entries[0][0];
  const reasons: string[] = [];
  const topKeywords = WEIGHTED_KEYWORDS[topNiche] || [];
  const foundKeywords = topKeywords
    .filter(({ keyword }) => new RegExp(keyword, 'gi').test(combinedText))
    .slice(0, 3)
    .map(({ keyword }) => keyword);
  
  if (foundKeywords.length > 0) {
    reasons.push(`Keywords: ${foundKeywords.join(', ')}`);
  }
  reasons.push(`Score: ${topScore} (confidence: ${confidence}%)`);
  
  // Return the top niche with metadata
  return {
    niche: topNiche.charAt(0).toUpperCase() + topNiche.slice(1),
    confidence,
    reasons,
  };
}
