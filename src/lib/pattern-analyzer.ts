// Smart Pattern Recognition Engine - Zero AI, Pure Algorithm
// Analyzes user's reading patterns to build personal language intuition

export interface WordCollocation {
  word: string;
  leftContext: string[];  // Words that commonly appear before
  rightContext: string[]; // Words that commonly appear after
  frequency: number;
  confidence: number;     // 0-100, how confident we are about this pattern
}

export interface GrammarPattern {
  id: string;
  type: 'preposition' | 'collocation' | 'phrasal_verb' | 'article' | 'tense';
  pattern: string;        // "interested [in/at]", "make/take + decision"
  correctUsage: string;   // "interested in", "make a decision"
  userMistakes: string[]; // Common user errors we've detected
  examples: string[];     // Sentences where we found this pattern
  confidence: number;
  lastSeen: number;
}

export interface PersonalWeakSpot {
  wordPair: string[];     // ["affect", "effect"] 
  confusionCount: number; // How many times user looked up both
  contextClues: string[]; // Patterns to help distinguish them
  lastConfused: number;
}

export class PatternAnalyzer {
  private collocations = new Map<string, WordCollocation>();
  private grammarPatterns = new Map<string, GrammarPattern>();
  private weakSpots = new Map<string, PersonalWeakSpot>();
  
  constructor(private deviceId: string) {}

  // Analyze a sentence and extract patterns
  analyzeSentence(sentence: string, sourceUrl: string): void {
    const words = this.tokenize(sentence);
    const now = Date.now();

    // Extract collocations (word pairs/triplets)
    this.extractCollocations(words, now);
    
    // Detect grammar patterns
    this.detectGrammarPatterns(sentence, words, now);
    
    // Update personal vocabulary context
    this.updateWordContexts(words, sentence, sourceUrl, now);
  }

  private tokenize(sentence: string): string[] {
    return sentence
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ') // Keep apostrophes and hyphens
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  private extractCollocations(words: string[], timestamp: number): void {
    // Analyze 2-word and 3-word combinations
    for (let i = 0; i < words.length - 1; i++) {
      const word1 = words[i];
      const word2 = words[i + 1];
      const key = `${word1}_${word2}`;
      
      const existing = this.collocations.get(key);
      if (existing) {
        existing.frequency++;
        existing.confidence = Math.min(100, existing.confidence + 2);
      } else {
        this.collocations.set(key, {
          word: key,
          leftContext: i > 0 ? [words[i - 1]] : [],
          rightContext: i < words.length - 2 ? [words[i + 2]] : [],
          frequency: 1,
          confidence: 10
        });
      }
    }
  }

  private detectGrammarPatterns(sentence: string, words: string[], timestamp: number): void {
    // Preposition patterns
    this.detectPrepositionPatterns(sentence, words, timestamp);
    
    // Phrasal verbs
    this.detectPhrasalVerbs(words, timestamp);
    
    // Article usage patterns
    this.detectArticlePatterns(sentence, words, timestamp);
  }

  private detectPrepositionPatterns(sentence: string, words: string[], timestamp: number): void {
    const prepositions = ['in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'about', 'of'];
    
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      if (prepositions.includes(word)) {
        const prevWord = words[i - 1];
        const patternKey = `${prevWord}_prep`;
        
        const pattern: GrammarPattern = {
          id: patternKey,
          type: 'preposition',
          pattern: `${prevWord} [preposition]`,
          correctUsage: `${prevWord} ${word}`,
          userMistakes: [],
          examples: [sentence],
          confidence: 5,
          lastSeen: timestamp
        };

        const existing = this.grammarPatterns.get(patternKey);
        if (existing) {
          existing.confidence = Math.min(95, existing.confidence + 3);
          existing.lastSeen = timestamp;
          if (existing.examples.length < 5) {
            existing.examples.push(sentence);
          }
        } else {
          this.grammarPatterns.set(patternKey, pattern);
        }
      }
    }
  }

  private detectPhrasalVerbs(words: string[], timestamp: number): void {
    const particles = ['up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'through', 'away'];
    
    for (let i = 0; i < words.length - 1; i++) {
      const verb = words[i];
      const particle = words[i + 1];
      
      if (particles.includes(particle) && this.isVerb(verb)) {
        const patternKey = `${verb}_${particle}`;
        
        const existing = this.grammarPatterns.get(patternKey);
        if (existing) {
          existing.confidence = Math.min(90, existing.confidence + 4);
          existing.lastSeen = timestamp;
        } else {
          this.grammarPatterns.set(patternKey, {
            id: patternKey,
            type: 'phrasal_verb',
            pattern: `${verb} ${particle}`,
            correctUsage: `${verb} ${particle}`,
            userMistakes: [],
            examples: [],
            confidence: 15,
            lastSeen: timestamp
          });
        }
      }
    }
  }

  private detectArticlePatterns(sentence: string, words: string[], timestamp: number): void {
    const articles = ['a', 'an', 'the'];
    
    for (let i = 0; i < words.length - 1; i++) {
      const article = words[i];
      if (articles.includes(article)) {
        const nextWord = words[i + 1];
        const patternKey = `${article}_${nextWord}`;
        
        this.grammarPatterns.set(patternKey, {
          id: patternKey,
          type: 'article',
          pattern: `${article} ${nextWord}`,
          correctUsage: `${article} ${nextWord}`,
          userMistakes: [],
          examples: [sentence],
          confidence: 8,
          lastSeen: timestamp
        });
      }
    }
  }

  private updateWordContexts(words: string[], sentence: string, sourceUrl: string, timestamp: number): void {
    // Track words that user frequently looks up together (potential confusion pairs)
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // This would integrate with the user's saved words to detect confusion patterns
      // Implementation would check against user's vocabulary database
    }
  }

  private isVerb(word: string): boolean {
    // Simple verb detection - could be enhanced with more sophisticated rules
    const commonVerbs = [
      'be', 'have', 'do', 'say', 'get', 'make', 'go', 'know', 'take', 'see',
      'come', 'think', 'look', 'want', 'give', 'use', 'find', 'tell', 'ask',
      'work', 'seem', 'feel', 'try', 'leave', 'call', 'turn', 'put', 'keep',
      'run', 'move', 'play', 'live', 'believe', 'bring', 'happen', 'write',
      'provide', 'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue',
      'set', 'learn', 'change', 'lead', 'understand', 'watch', 'follow',
      'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow',
      'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear',
      'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay',
      'fall', 'cut', 'reach', 'kill', 'remain', 'suggest', 'raise', 'pass'
    ];
    
    return commonVerbs.includes(word) || word.endsWith('ed') || word.endsWith('ing');
  }

  // Get insights for user
  getCollocationsInsights(): WordCollocation[] {
    return Array.from(this.collocations.values())
      .filter(c => c.frequency >= 2 && c.confidence >= 20)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 50);
  }

  getGrammarInsights(): GrammarPattern[] {
    return Array.from(this.grammarPatterns.values())
      .filter(p => p.confidence >= 15)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 30);
  }

  getPersonalWeakSpots(): PersonalWeakSpot[] {
    return Array.from(this.weakSpots.values())
      .filter(w => w.confusionCount >= 2)
      .sort((a, b) => b.confusionCount - a.confusionCount);
  }

  // Detect confusion pairs (words user frequently looks up)
  analyzeWordLookups(lookupHistory: { word: string; timestamp: number }[]): void {
    const recentLookups = lookupHistory.filter(l => Date.now() - l.timestamp < 7 * 24 * 60 * 60 * 1000);
    const wordCounts = new Map<string, number>();
    
    recentLookups.forEach(lookup => {
      wordCounts.set(lookup.word, (wordCounts.get(lookup.word) || 0) + 1);
    });

    // Find words that are frequently confused (similar meaning/spelling)
    const confusionPairs = [
      ['affect', 'effect'], ['accept', 'except'], ['lose', 'loose'],
      ['then', 'than'], ['their', 'there', 'they\'re'], ['its', 'it\'s'],
      ['who\'s', 'whose'], ['your', 'you\'re'], ['principal', 'principle'],
      ['complement', 'compliment'], ['advice', 'advise'], ['desert', 'dessert']
    ];

    confusionPairs.forEach(pair => {
      const counts = pair.map(word => wordCounts.get(word) || 0);
      const totalCount = counts.reduce((sum, count) => sum + count, 0);
      
      if (totalCount >= 2) {
        const key = pair.join('_');
        const existing = this.weakSpots.get(key);
        
        if (existing) {
          existing.confusionCount += totalCount;
          existing.lastConfused = Date.now();
        } else {
          this.weakSpots.set(key, {
            wordPair: pair,
            confusionCount: totalCount,
            contextClues: this.generateContextClues(pair),
            lastConfused: Date.now()
          });
        }
      }
    });
  }

  private generateContextClues(wordPair: string[]): string[] {
    // Generate helpful tips to distinguish confusing words
    const clueMap: Record<string, string[]> = {
      'affect_effect': [
        'Affect is a verb (to influence)',
        'Effect is a noun (the result)',
        'The medicine will AFFECT you (verb)',
        'The EFFECT was immediate (noun)'
      ],
      'accept_except': [
        'Accept means to receive or agree',
        'Except means excluding or but',
        'I accept your invitation',
        'Everyone came except John'
      ],
      'lose_loose': [
        'Lose rhymes with choose (verb)',
        'Loose rhymes with goose (adjective)',
        'Don\'t lose your keys',
        'This shirt is too loose'
      ]
    };

    const key = wordPair.join('_');
    return clueMap[key] || [`${wordPair[0]} vs ${wordPair[1]} - different meanings`];
  }

  // Save patterns to storage
  async saveToStorage(): Promise<void> {
    const data = {
      collocations: Object.fromEntries(this.collocations),
      grammarPatterns: Object.fromEntries(this.grammarPatterns),
      weakSpots: Object.fromEntries(this.weakSpots),
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({
      [`patterns_${this.deviceId}`]: data
    });
  }

  // Load patterns from storage
  async loadFromStorage(): Promise<void> {
    const result = await chrome.storage.local.get([`patterns_${this.deviceId}`]);
    const data = result[`patterns_${this.deviceId}`] as any;
    
    if (data && typeof data === 'object') {
      this.collocations = new Map(Object.entries(data.collocations || {}));
      this.grammarPatterns = new Map(Object.entries(data.grammarPatterns || {}));
      this.weakSpots = new Map(Object.entries(data.weakSpots || {}));
    }
  }
}

// Export singleton instance
let patternAnalyzer: PatternAnalyzer | null = null;

export async function getPatternAnalyzer(deviceId: string): Promise<PatternAnalyzer> {
  if (!patternAnalyzer) {
    patternAnalyzer = new PatternAnalyzer(deviceId);
    await patternAnalyzer.loadFromStorage();
  }
  return patternAnalyzer;
}