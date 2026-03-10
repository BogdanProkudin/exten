// AI Writing Assistant - Real-time writing help in any text field
// Uses cost-effective AI models for maximum value

export interface WritingContext {
  textBefore: string;
  textAfter: string;
  selectedText: string;
  inputType: 'email' | 'message' | 'document' | 'comment' | 'search' | 'form' | 'other';
  domain: string;
  userLevel: string; // A2, B1, B2, C1, C2
  targetLanguage: string;
}

export interface WritingSuggestion {
  type: 'grammar' | 'vocabulary' | 'style' | 'clarity' | 'tone';
  original: string;
  suggestion: string;
  explanation: string;
  confidence: number; // 0-1
  position: { start: number; end: number };
  severity: 'error' | 'warning' | 'suggestion' | 'enhancement';
}

export interface VocabularyEnhancement {
  word: string;
  alternatives: string[];
  context: string;
  explanation: string;
  difficulty: number; // 0-1, relative to user level
}

export interface WritingAnalysis {
  suggestions: WritingSuggestion[];
  vocabularyEnhancements: VocabularyEnhancement[];
  overallTone: 'formal' | 'informal' | 'academic' | 'casual' | 'professional';
  readabilityScore: number; // 0-100, appropriate for user level
  estimatedLevel: string; // What CEFR level this text appears to be
}

export class AIWritingAssistant {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-4o-mini'; // Cost-effective choice
  }

  // Main writing analysis function
  async analyzeWriting(text: string, context: WritingContext): Promise<WritingAnalysis> {
    if (!text.trim() || text.length < 10) {
      return {
        suggestions: [],
        vocabularyEnhancements: [],
        overallTone: 'casual',
        readabilityScore: 70,
        estimatedLevel: context.userLevel
      };
    }

    try {
      const prompt = this.buildAnalysisPrompt(text, context);
      const response = await this.callAI(prompt);
      return this.parseAIResponse(response, text);
    } catch (error) {
      console.error('AI Writing Assistant error:', error);
      // Fallback to basic analysis
      return this.fallbackAnalysis(text, context);
    }
  }

  // Real-time suggestions as user types
  async getInstantSuggestions(text: string, cursorPosition: number, context: WritingContext): Promise<WritingSuggestion[]> {
    if (text.length < 20) return [];

    // Get the current sentence or paragraph for analysis
    const analysisText = this.extractRelevantText(text, cursorPosition);
    
    try {
      const prompt = this.buildInstantPrompt(analysisText, context);
      const response = await this.callAI(prompt, { maxTokens: 300 }); // Shorter response for speed
      return this.parseInstantSuggestions(response, text, cursorPosition);
    } catch (error) {
      console.error('Instant suggestions error:', error);
      return [];
    }
  }

  // Vocabulary enhancement for specific words
  async enhanceVocabulary(word: string, context: WritingContext): Promise<VocabularyEnhancement | null> {
    try {
      const prompt = this.buildVocabularyPrompt(word, context);
      const response = await this.callAI(prompt, { maxTokens: 200 });
      return this.parseVocabularyResponse(response, word);
    } catch (error) {
      console.error('Vocabulary enhancement error:', error);
      return null;
    }
  }

  // Tone adjustment suggestions
  async adjustTone(text: string, targetTone: 'formal' | 'informal' | 'professional', context: WritingContext): Promise<string> {
    try {
      const prompt = this.buildTonePrompt(text, targetTone, context);
      const response = await this.callAI(prompt, { maxTokens: Math.min(text.length * 2, 1000) });
      return this.parseToneResponse(response);
    } catch (error) {
      console.error('Tone adjustment error:', error);
      return text;
    }
  }

  // Grammar and style fixes
  async fixGrammar(text: string, context: WritingContext): Promise<{ corrected: string; changes: WritingSuggestion[] }> {
    try {
      const prompt = this.buildGrammarPrompt(text, context);
      const response = await this.callAI(prompt, { maxTokens: Math.min(text.length * 2, 1500) });
      return this.parseGrammarResponse(response, text);
    } catch (error) {
      console.error('Grammar fix error:', error);
      return { corrected: text, changes: [] };
    }
  }

  private buildAnalysisPrompt(text: string, context: WritingContext): string {
    return `You are a language learning assistant helping a ${context.userLevel} level English learner improve their writing. Analyze this text and provide suggestions.

User Level: ${context.userLevel}
Context: ${context.inputType} on ${context.domain}
Target: ${context.targetLanguage === 'en' ? 'English' : context.targetLanguage}

Text to analyze:
"${text}"

Please provide a JSON response with this structure:
{
  "suggestions": [
    {
      "type": "grammar|vocabulary|style|clarity|tone",
      "original": "problematic text",
      "suggestion": "improved text", 
      "explanation": "why this is better",
      "confidence": 0.8,
      "position": {"start": 10, "end": 15},
      "severity": "error|warning|suggestion|enhancement"
    }
  ],
  "vocabularyEnhancements": [
    {
      "word": "basic word",
      "alternatives": ["better", "options"],
      "context": "how it's used here",
      "explanation": "why alternatives are better",
      "difficulty": 0.6
    }
  ],
  "overallTone": "formal|informal|academic|casual|professional",
  "readabilityScore": 75,
  "estimatedLevel": "B2"
}

Focus on practical improvements that will help them learn. Be encouraging but constructive.`;
  }

  private buildInstantPrompt(text: string, context: WritingContext): string {
    return `Quick grammar and style check for ${context.userLevel} English learner:

Text: "${text}"

Return JSON with urgent fixes only:
{
  "suggestions": [
    {
      "type": "grammar|vocabulary", 
      "original": "text",
      "suggestion": "fix",
      "explanation": "brief reason",
      "confidence": 0.9,
      "severity": "error|warning"
    }
  ]
}

Only include high-confidence corrections for common mistakes.`;
  }

  private buildVocabularyPrompt(word: string, context: WritingContext): string {
    return `Suggest better vocabulary for "${word}" in this context:
- User level: ${context.userLevel}
- Writing context: ${context.inputType}
- Surrounding text: "${context.textBefore} [${word}] ${context.textAfter}"

JSON response:
{
  "word": "${word}",
  "alternatives": ["word1", "word2", "word3"],
  "context": "how it's used",
  "explanation": "why alternatives are better",
  "difficulty": 0.7
}

Suggest words appropriate for ${context.userLevel} level that sound more natural.`;
  }

  private buildTonePrompt(text: string, targetTone: string, context: WritingContext): string {
    return `Rewrite this text to be more ${targetTone} while keeping the same meaning:

Original: "${text}"
User level: ${context.userLevel}
Context: ${context.inputType}

Provide only the rewritten text, no explanations. Keep vocabulary appropriate for ${context.userLevel} level.`;
  }

  private buildGrammarPrompt(text: string, context: WritingContext): string {
    return `Fix grammar and style errors in this text for a ${context.userLevel} English learner:

"${text}"

JSON response:
{
  "corrected": "corrected text",
  "changes": [
    {
      "type": "grammar",
      "original": "wrong part", 
      "suggestion": "correct part",
      "explanation": "brief explanation",
      "confidence": 0.95,
      "severity": "error"
    }
  ]
}

Focus on clear corrections that help learning.`;
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
            content: 'You are an expert English language tutor focused on practical learning. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: options.maxTokens || 800,
        temperature: 0.3, // Lower temperature for more consistent suggestions
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private parseAIResponse(response: string, originalText: string): WritingAnalysis {
    try {
      const parsed = JSON.parse(response);
      
      // Validate and sanitize the response
      return {
        suggestions: (parsed.suggestions || []).map(this.validateSuggestion),
        vocabularyEnhancements: (parsed.vocabularyEnhancements || []).map(this.validateVocabularyEnhancement),
        overallTone: parsed.overallTone || 'casual',
        readabilityScore: Math.max(0, Math.min(100, parsed.readabilityScore || 70)),
        estimatedLevel: parsed.estimatedLevel || 'B1'
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return this.fallbackAnalysis(originalText, {
        textBefore: '',
        textAfter: '',
        selectedText: '',
        inputType: 'other',
        domain: '',
        userLevel: 'B1',
        targetLanguage: 'en'
      });
    }
  }

  private parseInstantSuggestions(response: string, text: string, cursorPosition: number): WritingSuggestion[] {
    try {
      const parsed = JSON.parse(response);
      return (parsed.suggestions || []).map(this.validateSuggestion).slice(0, 3); // Limit to 3 for performance
    } catch (error) {
      console.error('Failed to parse instant suggestions:', error);
      return [];
    }
  }

  private parseVocabularyResponse(response: string, word: string): VocabularyEnhancement | null {
    try {
      const parsed = JSON.parse(response);
      return this.validateVocabularyEnhancement(parsed);
    } catch (error) {
      console.error('Failed to parse vocabulary response:', error);
      return null;
    }
  }

  private parseToneResponse(response: string): string {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      return parsed.rewritten || parsed.text || response;
    } catch {
      // If not JSON, return as-is (model returned plain text)
      return response.trim();
    }
  }

  private parseGrammarResponse(response: string, originalText: string): { corrected: string; changes: WritingSuggestion[] } {
    try {
      const parsed = JSON.parse(response);
      return {
        corrected: parsed.corrected || originalText,
        changes: (parsed.changes || []).map(this.validateSuggestion)
      };
    } catch (error) {
      console.error('Failed to parse grammar response:', error);
      return { corrected: originalText, changes: [] };
    }
  }

  private validateSuggestion = (suggestion: any): WritingSuggestion => {
    return {
      type: ['grammar', 'vocabulary', 'style', 'clarity', 'tone'].includes(suggestion.type) ? suggestion.type : 'style',
      original: String(suggestion.original || ''),
      suggestion: String(suggestion.suggestion || ''),
      explanation: String(suggestion.explanation || ''),
      confidence: Math.max(0, Math.min(1, Number(suggestion.confidence) || 0.5)),
      position: {
        start: Math.max(0, Number(suggestion.position?.start) || 0),
        end: Math.max(0, Number(suggestion.position?.end) || 0)
      },
      severity: ['error', 'warning', 'suggestion', 'enhancement'].includes(suggestion.severity) 
        ? suggestion.severity : 'suggestion'
    };
  };

  private validateVocabularyEnhancement = (enhancement: any): VocabularyEnhancement => {
    return {
      word: String(enhancement.word || ''),
      alternatives: Array.isArray(enhancement.alternatives) ? enhancement.alternatives.map(String) : [],
      context: String(enhancement.context || ''),
      explanation: String(enhancement.explanation || ''),
      difficulty: Math.max(0, Math.min(1, Number(enhancement.difficulty) || 0.5))
    };
  };

  private extractRelevantText(text: string, cursorPosition: number): string {
    // Get current sentence or paragraph around cursor
    const beforeCursor = text.slice(0, cursorPosition);
    const afterCursor = text.slice(cursorPosition);
    
    // Find sentence boundaries
    const sentenceStart = Math.max(
      beforeCursor.lastIndexOf('. '),
      beforeCursor.lastIndexOf('! '),
      beforeCursor.lastIndexOf('? '),
      0
    );
    
    const sentenceEnd = Math.min(
      afterCursor.indexOf('. ') !== -1 ? afterCursor.indexOf('. ') + cursorPosition : text.length,
      afterCursor.indexOf('! ') !== -1 ? afterCursor.indexOf('! ') + cursorPosition : text.length,
      afterCursor.indexOf('? ') !== -1 ? afterCursor.indexOf('? ') + cursorPosition : text.length
    );
    
    return text.slice(sentenceStart, sentenceEnd).trim();
  }

  private fallbackAnalysis(text: string, context: WritingContext): WritingAnalysis {
    // Basic analysis without AI
    const words = text.split(/\s+/);
    const avgWordsPerSentence = words.length / (text.split(/[.!?]+/).length || 1);
    
    return {
      suggestions: [],
      vocabularyEnhancements: [],
      overallTone: avgWordsPerSentence > 15 ? 'formal' : 'casual',
      readabilityScore: Math.max(30, 100 - (avgWordsPerSentence * 2)),
      estimatedLevel: words.length < 10 ? 'A2' : words.length < 50 ? 'B1' : 'B2'
    };
  }

  // Utility methods
  detectInputType(element: HTMLElement): WritingContext['inputType'] {
    const tagName = element.tagName.toLowerCase();
    const type = element.getAttribute('type')?.toLowerCase();
    const className = element.className.toLowerCase();
    const placeholder = element.getAttribute('placeholder')?.toLowerCase() || '';
    
    if (tagName === 'input') {
      if (type === 'email') return 'email';
      if (type === 'search') return 'search';
      return 'form';
    }
    
    if (tagName === 'textarea') {
      if (placeholder.includes('email') || className.includes('email')) return 'email';
      if (placeholder.includes('message') || className.includes('message')) return 'message';
      if (placeholder.includes('comment') || className.includes('comment')) return 'comment';
      return 'document';
    }
    
    if (element.isContentEditable) {
      return 'document';
    }
    
    return 'other';
  }

  getWritingContext(element: HTMLElement): Partial<WritingContext> {
    const domain = window.location.hostname;
    const inputType = this.detectInputType(element);
    
    return {
      inputType,
      domain,
      userLevel: 'B1', // Default, should be loaded from user settings
      targetLanguage: 'en'
    };
  }
}

// Export singleton with configuration
let writingAssistant: AIWritingAssistant | null = null;

export async function getWritingAssistant(): Promise<AIWritingAssistant | null> {
  if (!writingAssistant) {
    try {
      // Get API key from storage or environment
      const config = await chrome.storage.sync.get(['openaiApiKey', 'writingAssistantModel']) as any;
      
      if (!config?.openaiApiKey) {
        console.warn('No OpenAI API key configured for writing assistant');
        return null;
      }
      
      writingAssistant = new AIWritingAssistant({
        apiKey: config?.openaiApiKey || '',
        model: config?.writingAssistantModel || 'gpt-4o-mini'
      });
    } catch (error) {
      console.error('Failed to initialize writing assistant:', error);
      return null;
    }
  }
  
  return writingAssistant;
}