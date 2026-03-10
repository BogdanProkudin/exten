// AI Translator - Smart context-aware translation system
// Provides better translations than basic services by understanding context

export interface TranslationContext {
  sourceText: string;
  surroundingText: string; // Context around the word/phrase
  domain: string; // Website domain for specialized vocabulary
  contentType: 'article' | 'technical' | 'casual' | 'academic' | 'news' | 'social';
  userLevel: string; // User's language level
  targetLanguage: string;
  sourceLanguage: string;
}

export interface SmartTranslation {
  word: string;
  mainTranslation: string;
  alternativeTranslations: string[];
  partOfSpeech: string;
  pronunciation: string | null;
  etymology: string | null;
  contextualUsage: {
    explanation: string;
    examples: string[];
    commonPhrases: string[];
    register: 'formal' | 'informal' | 'neutral' | 'technical' | 'slang';
  };
  learningTips: {
    difficulty: number; // 0-1
    frequencyRank: number | null; // 1-10000, how common this word is
    learningPriority: 'high' | 'medium' | 'low';
    mnemonicHints: string[];
    similarWords: string[];
    falseGriends: string[]; // Words that look similar but mean different things
  };
  grammarNotes: {
    inflections: string[];
    usage: string;
    commonMistakes: string[];
  };
}

export interface ContextualExplanation {
  word: string;
  inThisContext: string;
  generalMeaning: string;
  whyThisTranslation: string;
  alternativeInterpretations: string[];
  culturalNotes?: string;
}

export class AITranslator {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-4o-mini'; // Cost-effective for translations
  }

  // Smart translation with context awareness
  async translateSmart(word: string, context: TranslationContext): Promise<SmartTranslation> {
    try {
      const prompt = this.buildTranslationPrompt(word, context);
      const response = await this.callAI(prompt);
      return this.parseTranslationResponse(response, word);
    } catch (error) {
      console.error('Smart translation failed:', error);
      return this.fallbackTranslation(word, context);
    }
  }

  // Explain why a translation is correct in this specific context
  async explainInContext(word: string, context: TranslationContext): Promise<ContextualExplanation> {
    try {
      const prompt = this.buildExplanationPrompt(word, context);
      const response = await this.callAI(prompt, { maxTokens: 400 });
      return this.parseExplanationResponse(response, word);
    } catch (error) {
      console.error('Contextual explanation failed:', error);
      return this.fallbackExplanation(word, context);
    }
  }

  // Batch translate multiple words efficiently
  async translateBatch(words: string[], context: TranslationContext): Promise<SmartTranslation[]> {
    if (words.length === 0) return [];
    
    try {
      const prompt = this.buildBatchPrompt(words, context);
      const response = await this.callAI(prompt, { maxTokens: words.length * 200 });
      return this.parseBatchResponse(response, words);
    } catch (error) {
      console.error('Batch translation failed:', error);
      return words.map(word => this.fallbackTranslation(word, context));
    }
  }

  // Check if translation needs clarification based on ambiguity
  async checkAmbiguity(word: string, context: TranslationContext): Promise<{ isAmbiguous: boolean; clarifications: string[] }> {
    try {
      const prompt = this.buildAmbiguityPrompt(word, context);
      const response = await this.callAI(prompt, { maxTokens: 300 });
      return this.parseAmbiguityResponse(response);
    } catch (error) {
      console.error('Ambiguity check failed:', error);
      return { isAmbiguous: false, clarifications: [] };
    }
  }

  private buildTranslationPrompt(word: string, context: TranslationContext): string {
    return `You are an expert language teacher providing comprehensive translation and learning information.

Word/phrase to translate: "${word}"
Context: "${context.surroundingText}"
Domain: ${context.domain}
Content type: ${context.contentType}
User level: ${context.userLevel}
Source language: ${context.sourceLanguage}
Target language: ${context.targetLanguage}

Provide a comprehensive JSON response with this structure:
{
  "word": "${word}",
  "mainTranslation": "primary translation",
  "alternativeTranslations": ["alt1", "alt2", "alt3"],
  "partOfSpeech": "noun/verb/adjective/etc",
  "pronunciation": "phonetic or null",
  "etymology": "word origin or null",
  "contextualUsage": {
    "explanation": "how it's used in this specific context",
    "examples": ["example sentence 1", "example sentence 2"],
    "commonPhrases": ["phrase1", "phrase2"],
    "register": "formal/informal/neutral/technical/slang"
  },
  "learningTips": {
    "difficulty": 0.7,
    "frequencyRank": 1500,
    "learningPriority": "high/medium/low",
    "mnemonicHints": ["memory trick 1", "memory trick 2"],
    "similarWords": ["similar1", "similar2"],
    "falseGriends": ["confusing1", "confusing2"]
  },
  "grammarNotes": {
    "inflections": ["plural/past tense/etc"],
    "usage": "grammar rules",
    "commonMistakes": ["mistake1", "mistake2"]
  }
}

Focus on practical learning value for ${context.userLevel} level. Consider the ${context.contentType} context and ${context.domain} domain.`;
  }

  private buildExplanationPrompt(word: string, context: TranslationContext): string {
    return `Explain why "${word}" has a specific meaning in this context:

Word: "${word}"
Context: "${context.surroundingText}"
Domain: ${context.domain}
Content type: ${context.contentType}

JSON response:
{
  "word": "${word}",
  "inThisContext": "what it means specifically here",
  "generalMeaning": "what it normally means",
  "whyThisTranslation": "why this translation is correct here",
  "alternativeInterpretations": ["other possible meanings"],
  "culturalNotes": "cultural context if relevant"
}

Be clear and educational for a ${context.userLevel} learner.`;
  }

  private buildBatchPrompt(words: string[], context: TranslationContext): string {
    return `Translate these ${words.length} words/phrases in the context of ${context.contentType} content:

Words: ${words.map(w => `"${w}"`).join(', ')}
Context: "${context.surroundingText}"
Domain: ${context.domain}
User level: ${context.userLevel}

JSON response with array of translations:
{
  "translations": [
    {
      "word": "word1",
      "mainTranslation": "translation",
      "alternatives": ["alt1", "alt2"],
      "partOfSpeech": "noun/verb/etc",
      "difficulty": 0.6,
      "priority": "high/medium/low"
    }
  ]
}

Keep translations concise but accurate for ${context.userLevel} level.`;
  }

  private buildAmbiguityPrompt(word: string, context: TranslationContext): string {
    return `Check if "${word}" is ambiguous in this context and needs clarification:

Word: "${word}"
Context: "${context.surroundingText}"

JSON response:
{
  "isAmbiguous": true/false,
  "clarifications": ["possible meaning 1", "possible meaning 2"]
}

Only mark as ambiguous if context doesn't make meaning clear.`;
  }

  private async callAI(prompt: string, options: { maxTokens?: number } = {}): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert language teacher and translator. Always provide accurate, educational translations with context awareness. Respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.maxTokens || 600,
        temperature: 0.2, // Lower temperature for more consistent translations
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private parseTranslationResponse(response: string, word: string): SmartTranslation {
    try {
      const parsed = JSON.parse(response);
      
      return {
        word: parsed.word || word,
        mainTranslation: parsed.mainTranslation || word,
        alternativeTranslations: Array.isArray(parsed.alternativeTranslations) ? parsed.alternativeTranslations : [],
        partOfSpeech: parsed.partOfSpeech || '',
        pronunciation: parsed.pronunciation,
        etymology: parsed.etymology,
        contextualUsage: {
          explanation: parsed.contextualUsage?.explanation || '',
          examples: Array.isArray(parsed.contextualUsage?.examples) ? parsed.contextualUsage.examples : [],
          commonPhrases: Array.isArray(parsed.contextualUsage?.commonPhrases) ? parsed.contextualUsage.commonPhrases : [],
          register: parsed.contextualUsage?.register || 'neutral'
        },
        learningTips: {
          difficulty: Math.max(0, Math.min(1, Number(parsed.learningTips?.difficulty) || 0.5)),
          frequencyRank: parsed.learningTips?.frequencyRank || null,
          learningPriority: ['high', 'medium', 'low'].includes(parsed.learningTips?.learningPriority) 
            ? parsed.learningTips.learningPriority : 'medium',
          mnemonicHints: Array.isArray(parsed.learningTips?.mnemonicHints) ? parsed.learningTips.mnemonicHints : [],
          similarWords: Array.isArray(parsed.learningTips?.similarWords) ? parsed.learningTips.similarWords : [],
          falseGriends: Array.isArray(parsed.learningTips?.falseGriends) ? parsed.learningTips.falseGriends : []
        },
        grammarNotes: {
          inflections: Array.isArray(parsed.grammarNotes?.inflections) ? parsed.grammarNotes.inflections : [],
          usage: parsed.grammarNotes?.usage || '',
          commonMistakes: Array.isArray(parsed.grammarNotes?.commonMistakes) ? parsed.grammarNotes.commonMistakes : []
        }
      };
    } catch (error) {
      console.error('Failed to parse translation response:', error);
      return this.fallbackTranslation(word, {
        sourceText: word,
        surroundingText: '',
        domain: '',
        contentType: 'article',
        userLevel: 'B1',
        targetLanguage: 'ru',
        sourceLanguage: 'en'
      });
    }
  }

  private parseExplanationResponse(response: string, word: string): ContextualExplanation {
    try {
      const parsed = JSON.parse(response);
      
      return {
        word: parsed.word || word,
        inThisContext: parsed.inThisContext || '',
        generalMeaning: parsed.generalMeaning || '',
        whyThisTranslation: parsed.whyThisTranslation || '',
        alternativeInterpretations: Array.isArray(parsed.alternativeInterpretations) ? parsed.alternativeInterpretations : [],
        culturalNotes: parsed.culturalNotes
      };
    } catch (error) {
      console.error('Failed to parse explanation response:', error);
      return this.fallbackExplanation(word, {
        sourceText: word,
        surroundingText: '',
        domain: '',
        contentType: 'article',
        userLevel: 'B1',
        targetLanguage: 'ru',
        sourceLanguage: 'en'
      });
    }
  }

  private parseBatchResponse(response: string, words: string[]): SmartTranslation[] {
    try {
      const parsed = JSON.parse(response);
      const translations = parsed.translations || [];
      
      return words.map((word, index) => {
        const translation = translations[index] || {};
        return {
          word: translation.word || word,
          mainTranslation: translation.mainTranslation || word,
          alternativeTranslations: Array.isArray(translation.alternatives) ? translation.alternatives : [],
          partOfSpeech: translation.partOfSpeech || '',
          pronunciation: null,
          etymology: null,
          contextualUsage: {
            explanation: '',
            examples: [],
            commonPhrases: [],
            register: 'neutral'
          },
          learningTips: {
            difficulty: Number(translation.difficulty) || 0.5,
            frequencyRank: null,
            learningPriority: translation.priority || 'medium',
            mnemonicHints: [],
            similarWords: [],
            falseGriends: []
          },
          grammarNotes: {
            inflections: [],
            usage: '',
            commonMistakes: []
          }
        };
      });
    } catch (error) {
      console.error('Failed to parse batch response:', error);
      return words.map(word => this.fallbackTranslation(word, {
        sourceText: word,
        surroundingText: '',
        domain: '',
        contentType: 'article',
        userLevel: 'B1',
        targetLanguage: 'ru',
        sourceLanguage: 'en'
      }));
    }
  }

  private parseAmbiguityResponse(response: string): { isAmbiguous: boolean; clarifications: string[] } {
    try {
      const parsed = JSON.parse(response);
      return {
        isAmbiguous: Boolean(parsed.isAmbiguous),
        clarifications: Array.isArray(parsed.clarifications) ? parsed.clarifications : []
      };
    } catch (error) {
      console.error('Failed to parse ambiguity response:', error);
      return { isAmbiguous: false, clarifications: [] };
    }
  }

  private fallbackTranslation(word: string, context: TranslationContext): SmartTranslation {
    return {
      word,
      mainTranslation: word,
      alternativeTranslations: [],
      partOfSpeech: '',
      pronunciation: null,
      etymology: null,
      contextualUsage: {
        explanation: '',
        examples: [],
        commonPhrases: [],
        register: 'neutral'
      },
      learningTips: {
        difficulty: 0.5,
        frequencyRank: null,
        learningPriority: 'medium',
        mnemonicHints: [],
        similarWords: [],
        falseGriends: []
      },
      grammarNotes: {
        inflections: [],
        usage: '',
        commonMistakes: []
      }
    };
  }

  private fallbackExplanation(word: string, context: TranslationContext): ContextualExplanation {
    return {
      word,
      inThisContext: 'Context not available',
      generalMeaning: 'Meaning not available',
      whyThisTranslation: 'Translation explanation not available',
      alternativeInterpretations: [],
      culturalNotes: undefined
    };
  }

  // Utility methods
  detectContentType(domain: string, text: string): TranslationContext['contentType'] {
    // Technical domains
    if (['github.com', 'stackoverflow.com', 'docs.microsoft.com'].some(d => domain.includes(d))) {
      return 'technical';
    }
    
    // Academic domains
    if (['wikipedia.org', '.edu', 'scholar.google.com'].some(d => domain.includes(d))) {
      return 'academic';
    }
    
    // News domains
    if (['bbc.com', 'cnn.com', 'reuters.com', 'nytimes.com'].some(d => domain.includes(d))) {
      return 'news';
    }
    
    // Social domains
    if (['twitter.com', 'facebook.com', 'reddit.com', 'instagram.com'].some(d => domain.includes(d))) {
      return 'social';
    }
    
    // Check text characteristics
    if (text.includes('function') || text.includes('class') || text.includes('import')) {
      return 'technical';
    }
    
    return 'article'; // Default
  }

  getTranslationContext(word: string, surroundingText: string): Partial<TranslationContext> {
    const domain = window.location.hostname;
    const contentType = this.detectContentType(domain, surroundingText);
    
    return {
      sourceText: word,
      surroundingText,
      domain,
      contentType,
      userLevel: 'B1', // Should be loaded from user settings
      targetLanguage: 'ru', // Should be loaded from user settings
      sourceLanguage: 'en'
    };
  }
}

// Export singleton
let aiTranslator: AITranslator | null = null;

export async function getAITranslator(): Promise<AITranslator | null> {
  if (!aiTranslator) {
    try {
      // Get API key from storage
      const config = await chrome.storage.sync.get(['openaiApiKey', 'translationModel']) as any;
      
      if (!config?.openaiApiKey) {
        console.warn('No OpenAI API key configured for AI translation');
        return null;
      }
      
      aiTranslator = new AITranslator({
        apiKey: config?.openaiApiKey || '',
        model: config?.translationModel || 'gpt-4o-mini'
      });
    } catch (error) {
      console.error('Failed to initialize AI translator:', error);
      return null;
    }
  }
  
  return aiTranslator;
}