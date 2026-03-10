// Smart Word Prediction Engine
// Analyzes browsing patterns to predict and pre-teach vocabulary

export interface BrowsingPattern {
  domain: string;
  timeSpent: number;
  lastVisit: number;
  wordFrequency: Record<string, number>; // words encountered on this domain
  categories: string[]; // tech, news, entertainment, etc.
}

export interface WordPrediction {
  word: string;
  lemma: string;
  confidence: number; // 0-1, how likely user will encounter this word
  sources: string[]; // domains where this word appears
  category: string;
  difficulty: number;
  urgency: number; // how soon user likely to encounter it
  contextHints: string[]; // where/how it's typically used
}

export interface LearningVector {
  domains: string[];
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6
  sessionDuration: number;
  contentTypes: string[];
  difficulty: number; // user's current level
}

export class PredictionEngine {
  private browsingHistory: Map<string, BrowsingPattern> = new Map();
  private vocabularyDatabase: Map<string, Set<string>> = new Map(); // domain -> words
  private userVector: LearningVector;
  private wordCooccurrence: Map<string, Map<string, number>> = new Map();

  constructor(private deviceId: string) {
    this.userVector = {
      domains: [],
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      sessionDuration: 0,
      contentTypes: [],
      difficulty: 0.5
    };
    this.initializeDomainVocabulary();
  }

  // Track user's browsing session
  async recordBrowsingSession(domain: string, duration: number, wordsEncountered: string[]): Promise<void> {
    const existing = this.browsingHistory.get(domain);
    const now = Date.now();

    if (existing) {
      existing.timeSpent += duration;
      existing.lastVisit = now;
      wordsEncountered.forEach(word => {
        existing.wordFrequency[word] = (existing.wordFrequency[word] || 0) + 1;
      });
    } else {
      const pattern: BrowsingPattern = {
        domain,
        timeSpent: duration,
        lastVisit: now,
        wordFrequency: {},
        categories: this.categorizeDomain(domain)
      };
      wordsEncountered.forEach(word => {
        pattern.wordFrequency[word] = 1;
      });
      this.browsingHistory.set(domain, pattern);
    }

    // Update vocabulary database
    const domainWords = this.vocabularyDatabase.get(domain) || new Set();
    wordsEncountered.forEach(word => domainWords.add(word));
    this.vocabularyDatabase.set(domain, domainWords);

    // Update word co-occurrence patterns
    this.updateCooccurrence(wordsEncountered);

    // Update user learning vector
    this.updateUserVector();

    await this.saveToStorage();
  }

  // Generate predictions for next browsing session
  generatePredictions(limit: number = 20): WordPrediction[] {
    const predictions: WordPrediction[] = [];
    const currentTime = new Date().getHours();
    const currentDay = new Date().getDay();

    // Analyze user's most frequent domains
    const frequentDomains = Array.from(this.browsingHistory.entries())
      .filter(([, pattern]) => Date.now() - pattern.lastVisit < 7 * 24 * 60 * 60 * 1000) // Last week
      .sort((a, b) => b[1].timeSpent - a[1].timeSpent)
      .slice(0, 10);

    // For each frequent domain, predict words user might encounter
    for (const [domain, pattern] of frequentDomains) {
      const domainWords = this.vocabularyDatabase.get(domain);
      if (!domainWords) continue;

      for (const word of domainWords) {
        if (predictions.find(p => p.word === word)) continue; // Already predicted

        const confidence = this.calculateWordConfidence(word, domain, pattern);
        const urgency = this.calculateUrgency(domain, pattern, currentTime, currentDay);
        
        if (confidence > 0.3 && urgency > 0.2) { // Thresholds for inclusion
          predictions.push({
            word,
            lemma: this.lemmatize(word),
            confidence,
            sources: [domain],
            category: this.categorizeWord(word, domain),
            difficulty: this.getWordDifficulty(word),
            urgency,
            contextHints: this.generateContextHints(word, domain)
          });
        }
      }
    }

    // Sort by combined confidence and urgency score
    predictions.sort((a, b) => {
      const scoreA = (a.confidence * 0.6) + (a.urgency * 0.4);
      const scoreB = (b.confidence * 0.6) + (b.urgency * 0.4);
      return scoreB - scoreA;
    });

    return predictions.slice(0, limit);
  }

  // Predict words for specific domain/content type
  predictForContext(domain: string, contentType: string = 'article'): WordPrediction[] {
    const domainWords = this.vocabularyDatabase.get(domain);
    if (!domainWords) return [];

    const predictions: WordPrediction[] = [];
    const similarDomains = this.findSimilarDomains(domain);

    // Combine words from target domain and similar domains
    const allRelevantWords = new Set(domainWords);
    similarDomains.forEach(similarDomain => {
      const words = this.vocabularyDatabase.get(similarDomain);
      if (words) {
        words.forEach(word => allRelevantWords.add(word));
      }
    });

    for (const word of allRelevantWords) {
      const confidence = this.calculateContextualConfidence(word, domain, contentType);
      if (confidence > 0.4) {
        predictions.push({
          word,
          lemma: this.lemmatize(word),
          confidence,
          sources: [domain, ...similarDomains],
          category: this.categorizeWord(word, domain),
          difficulty: this.getWordDifficulty(word),
          urgency: 0.8, // High urgency for specific context predictions
          contextHints: this.generateContextHints(word, domain)
        });
      }
    }

    return predictions.sort((a, b) => b.confidence - a.confidence).slice(0, 15);
  }

  private calculateWordConfidence(word: string, domain: string, pattern: BrowsingPattern): number {
    let confidence = 0;

    // Factor 1: Word frequency in this domain (0-0.4)
    const wordFreq = pattern.wordFrequency[word] || 0;
    const maxFreq = Math.max(...Object.values(pattern.wordFrequency), 1);
    confidence += (wordFreq / maxFreq) * 0.4;

    // Factor 2: Domain visit frequency (0-0.3)
    const domainScore = Math.min(pattern.timeSpent / (60 * 1000 * 30), 1); // 30 minutes = max score
    confidence += domainScore * 0.3;

    // Factor 3: Recency of visits (0-0.2)
    const daysSince = (Date.now() - pattern.lastVisit) / (24 * 60 * 60 * 1000);
    const recencyScore = Math.max(0, 1 - (daysSince / 7)); // Decays over week
    confidence += recencyScore * 0.2;

    // Factor 4: Word co-occurrence with known words (0-0.1)
    const cooccurrenceScore = this.getCooccurrenceScore(word);
    confidence += cooccurrenceScore * 0.1;

    return Math.min(confidence, 1);
  }

  private calculateUrgency(domain: string, pattern: BrowsingPattern, currentTime: number, currentDay: number): number {
    let urgency = 0;

    // Factor 1: User's typical browsing time for this domain (0-0.5)
    const isTypicalTime = this.isTypicalBrowsingTime(domain, currentTime, currentDay);
    urgency += isTypicalTime ? 0.5 : 0.2;

    // Factor 2: How recently user visited this domain (0-0.3)
    const hoursSince = (Date.now() - pattern.lastVisit) / (60 * 60 * 1000);
    if (hoursSince < 24) urgency += 0.3;
    else if (hoursSince < 72) urgency += 0.2;
    else urgency += 0.1;

    // Factor 3: Domain category trending (0-0.2)
    const categoryTrending = this.getCategoryTrending(pattern.categories);
    urgency += categoryTrending * 0.2;

    return Math.min(urgency, 1);
  }

  private calculateContextualConfidence(word: string, domain: string, contentType: string): number {
    let confidence = 0;

    // Factor 1: Word relevance to domain category
    const domainCategories = this.categorizeDomain(domain);
    const wordRelevance = this.getWordRelevanceToCategories(word, domainCategories);
    confidence += wordRelevance * 0.5;

    // Factor 2: Content type matching
    const contentTypeMatch = this.getContentTypeWordMatch(word, contentType);
    confidence += contentTypeMatch * 0.3;

    // Factor 3: Word difficulty vs user level
    const difficultyMatch = this.getDifficultyMatch(word);
    confidence += difficultyMatch * 0.2;

    return Math.min(confidence, 1);
  }

  private initializeDomainVocabulary(): void {
    // Common domain vocabularies - could be expanded with real data
    const vocabularySeeds = {
      'github.com': new Set(['repository', 'commit', 'branch', 'merge', 'pull', 'clone', 'fork', 'issue', 'documentation']),
      'stackoverflow.com': new Set(['function', 'variable', 'array', 'object', 'method', 'algorithm', 'debugging', 'syntax']),
      'medium.com': new Set(['article', 'author', 'publish', 'reader', 'content', 'perspective', 'insight', 'narrative']),
      'news.ycombinator.com': new Set(['startup', 'technology', 'innovation', 'entrepreneur', 'venture', 'funding', 'disruptive']),
      'reddit.com': new Set(['community', 'upvote', 'comment', 'thread', 'discussion', 'moderator', 'subreddit']),
      'youtube.com': new Set(['video', 'subscribe', 'channel', 'content', 'creator', 'tutorial', 'streaming']),
      'wikipedia.org': new Set(['encyclopedia', 'citation', 'reference', 'article', 'neutral', 'verifiable', 'notable']),
      'bbc.com': new Set(['correspondent', 'breaking', 'analysis', 'politics', 'international', 'domestic', 'coverage']),
      'techcrunch.com': new Set(['technology', 'startup', 'funding', 'acquisition', 'disruption', 'innovation', 'platform'])
    };

    Object.entries(vocabularySeeds).forEach(([domain, words]) => {
      this.vocabularyDatabase.set(domain, words);
    });
  }

  private categorizeDomain(domain: string): string[] {
    const categories: string[] = [];

    // Technology
    if (['github.com', 'stackoverflow.com', 'techcrunch.com', 'ycombinator.com'].some(d => domain.includes(d))) {
      categories.push('technology');
    }

    // News
    if (['bbc.com', 'cnn.com', 'reuters.com', 'nytimes.com'].some(d => domain.includes(d))) {
      categories.push('news');
    }

    // Education
    if (['wikipedia.org', 'coursera.org', 'edx.org', '.edu'].some(d => domain.includes(d))) {
      categories.push('education');
    }

    // Entertainment
    if (['youtube.com', 'netflix.com', 'twitch.tv', 'reddit.com'].some(d => domain.includes(d))) {
      categories.push('entertainment');
    }

    // Business
    if (['linkedin.com', 'bloomberg.com', 'wsj.com', 'forbes.com'].some(d => domain.includes(d))) {
      categories.push('business');
    }

    return categories.length > 0 ? categories : ['general'];
  }

  private categorizeWord(word: string, domain: string): string {
    const domainCategories = this.categorizeDomain(domain);
    
    // Simple word categorization based on domain context
    if (domainCategories.includes('technology')) {
      const techWords = ['function', 'variable', 'algorithm', 'database', 'framework', 'API'];
      if (techWords.some(tw => word.includes(tw) || tw.includes(word))) return 'technology';
    }

    if (domainCategories.includes('business')) {
      const businessWords = ['revenue', 'profit', 'strategy', 'market', 'customer', 'growth'];
      if (businessWords.some(bw => word.includes(bw) || bw.includes(word))) return 'business';
    }

    return domainCategories[0] || 'general';
  }

  private updateCooccurrence(words: string[]): void {
    for (let i = 0; i < words.length; i++) {
      const word1 = words[i];
      if (!this.wordCooccurrence.has(word1)) {
        this.wordCooccurrence.set(word1, new Map());
      }

      for (let j = i + 1; j < words.length && j < i + 5; j++) { // Window of 5 words
        const word2 = words[j];
        const cooccurMap = this.wordCooccurrence.get(word1)!;
        cooccurMap.set(word2, (cooccurMap.get(word2) || 0) + 1);
      }
    }
  }

  private updateUserVector(): void {
    // Update user learning vector based on browsing patterns
    const recentDomains = Array.from(this.browsingHistory.entries())
      .filter(([, pattern]) => Date.now() - pattern.lastVisit < 24 * 60 * 60 * 1000)
      .map(([domain]) => domain);

    this.userVector.domains = recentDomains;
    this.userVector.timeOfDay = new Date().getHours();
    this.userVector.dayOfWeek = new Date().getDay();
  }

  private findSimilarDomains(targetDomain: string): string[] {
    const targetCategories = this.categorizeDomain(targetDomain);
    const similarDomains: string[] = [];

    for (const [domain, pattern] of this.browsingHistory.entries()) {
      if (domain === targetDomain) continue;

      const domainCategories = this.categorizeDomain(domain);
      const overlap = targetCategories.filter(cat => domainCategories.includes(cat));
      
      if (overlap.length > 0) {
        similarDomains.push(domain);
      }
    }

    return similarDomains.slice(0, 5); // Top 5 similar domains
  }

  private getCooccurrenceScore(word: string): number {
    const cooccurMap = this.wordCooccurrence.get(word);
    if (!cooccurMap) return 0;

    const totalOccurrences = Array.from(cooccurMap.values()).reduce((sum, count) => sum + count, 0);
    return Math.min(totalOccurrences / 100, 1); // Normalize to 0-1
  }

  private isTypicalBrowsingTime(domain: string, currentTime: number, currentDay: number): boolean {
    // Simple heuristic - could be enhanced with actual user data
    const pattern = this.browsingHistory.get(domain);
    if (!pattern) return false;

    // For now, assume typical browsing times
    return currentTime >= 9 && currentTime <= 22; // 9 AM to 10 PM
  }

  private getCategoryTrending(categories: string[]): number {
    // Simple trending calculation - could use real trending data
    const trendingCategories = ['technology', 'ai', 'cryptocurrency'];
    const overlap = categories.filter(cat => trendingCategories.includes(cat));
    return overlap.length / categories.length;
  }

  private getWordRelevanceToCategories(word: string, categories: string[]): number {
    // Calculate how relevant a word is to given categories
    let relevance = 0;

    for (const category of categories) {
      switch (category) {
        case 'technology':
          if (['algorithm', 'database', 'framework', 'API', 'software', 'platform'].some(kw => word.includes(kw))) {
            relevance += 0.3;
          }
          break;
        case 'business':
          if (['strategy', 'revenue', 'market', 'customer', 'growth', 'profit'].some(kw => word.includes(kw))) {
            relevance += 0.3;
          }
          break;
        case 'news':
          if (['policy', 'government', 'international', 'domestic', 'analysis'].some(kw => word.includes(kw))) {
            relevance += 0.3;
          }
          break;
      }
    }

    return Math.min(relevance, 1);
  }

  private getContentTypeWordMatch(word: string, contentType: string): number {
    // Match words to content types
    const contentVocabulary = {
      'article': ['analysis', 'perspective', 'argument', 'conclusion', 'evidence'],
      'tutorial': ['step', 'process', 'procedure', 'method', 'technique'],
      'news': ['report', 'incident', 'development', 'announcement', 'statement'],
      'review': ['evaluation', 'assessment', 'critique', 'opinion', 'recommendation']
    };

    const relevantWords = contentVocabulary[contentType as keyof typeof contentVocabulary] || [];
    return relevantWords.some(rw => word.includes(rw) || rw.includes(word)) ? 0.8 : 0.2;
  }

  private getDifficultyMatch(word: string): number {
    // Match word difficulty to user level
    const wordDifficulty = this.getWordDifficulty(word);
    const userLevel = this.userVector.difficulty;
    
    // Prefer words slightly above user's current level
    const idealDifficulty = userLevel + 0.1;
    const difference = Math.abs(wordDifficulty - idealDifficulty);
    
    return Math.max(0, 1 - (difference * 2)); // Penalty for words too far from ideal
  }

  private getWordDifficulty(word: string): number {
    // Simple difficulty calculation based on word length and frequency
    const lengthScore = Math.min(word.length / 15, 1); // Longer = harder
    const rareScore = word.length > 8 ? 0.3 : 0; // Long words are often rare
    return Math.min(lengthScore + rareScore, 1);
  }

  private generateContextHints(word: string, domain: string): string[] {
    const hints: string[] = [];

    // Domain-specific hints
    if (domain.includes('github')) {
      hints.push('Used in software development context');
    } else if (domain.includes('news')) {
      hints.push('Common in news and journalism');
    } else if (domain.includes('business')) {
      hints.push('Business and professional terminology');
    }

    // Word-specific hints based on patterns
    if (word.endsWith('tion') || word.endsWith('sion')) {
      hints.push('Abstract noun, often describes a process or state');
    } else if (word.endsWith('ly')) {
      hints.push('Adverb describing how something is done');
    } else if (word.endsWith('ful')) {
      hints.push('Adjective meaning "full of" or "characterized by"');
    }

    return hints.slice(0, 3); // Limit to 3 hints
  }

  private lemmatize(word: string): string {
    // Simple lemmatization - could use more sophisticated algorithm
    word = word.toLowerCase();
    
    // Remove common suffixes
    if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
    
    return word;
  }

  // Generate learning schedule based on predictions
  generateLearningSchedule(): { morning: WordPrediction[]; afternoon: WordPrediction[]; evening: WordPrediction[] } {
    const predictions = this.generatePredictions(30);
    
    // Distribute words across day based on when user typically encounters them
    const schedule = {
      morning: predictions.filter((_, i) => i % 3 === 0).slice(0, 5),
      afternoon: predictions.filter((_, i) => i % 3 === 1).slice(0, 5),
      evening: predictions.filter((_, i) => i % 3 === 2).slice(0, 5)
    };

    return schedule;
  }

  // Check prediction accuracy (for optimization)
  validatePrediction(word: string, encountered: boolean): void {
    // Track prediction accuracy for future improvements
    // Could implement machine learning feedback loop here
  }

  async saveToStorage(): Promise<void> {
    const data = {
      browsingHistory: Object.fromEntries(this.browsingHistory),
      vocabularyDatabase: Object.fromEntries(
        Array.from(this.vocabularyDatabase.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      userVector: this.userVector,
      wordCooccurrence: Object.fromEntries(
        Array.from(this.wordCooccurrence.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
      ),
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({
      [`predictions_${this.deviceId}`]: data
    });
  }

  async loadFromStorage(): Promise<void> {
    const result = await chrome.storage.local.get([`predictions_${this.deviceId}`]);
    const data = result[`predictions_${this.deviceId}`] as any;

    if (data && typeof data === 'object') {
      if (data.browsingHistory) {
        this.browsingHistory = new Map(Object.entries(data.browsingHistory));
      }
      
      if (data.vocabularyDatabase) {
        this.vocabularyDatabase = new Map(
          Object.entries(data.vocabularyDatabase).map(([k, v]) => [k, new Set(v as string[])])
        );
      }
      
      if (data.userVector) {
        this.userVector = data.userVector;
      }
      
      if (data.wordCooccurrence) {
        this.wordCooccurrence = new Map(
          Object.entries(data.wordCooccurrence).map(([k, v]) => [k, new Map(Object.entries(v as Record<string, number>))])
        );
      }
    }
  }
}

// Export singleton
let predictionEngine: PredictionEngine | null = null;

export async function getPredictionEngine(deviceId: string): Promise<PredictionEngine> {
  if (!predictionEngine) {
    predictionEngine = new PredictionEngine(deviceId);
    await predictionEngine.loadFromStorage();
  }
  return predictionEngine;
}