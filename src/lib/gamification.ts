// Advanced Gamification Engine - Language Learning RPG
// Zero AI, pure game mechanics to keep users addicted to learning

export interface XPGain {
  action: 'word_saved' | 'word_reviewed' | 'quiz_completed' | 'writing_practice' | 'pattern_discovered' | 'reading_session' | 'streak_maintained';
  amount: number;
  bonus?: number; // Multiplier bonuses
  source?: string; // What triggered this XP
}

export interface Achievement {
  id: string;
  category: 'milestone' | 'streak' | 'skill' | 'discovery' | 'social';
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  requirements: AchievementRequirement[];
  unlocked: boolean;
  unlockedAt?: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface AchievementRequirement {
  type: 'words_saved' | 'words_reviewed' | 'streak_days' | 'reading_wpm' | 'patterns_found' | 'quiz_accuracy';
  value: number;
  timeframe?: number; // Days, or undefined for all-time
}

export interface SkillNode {
  id: string;
  name: string;
  category: 'vocabulary' | 'grammar' | 'reading' | 'patterns' | 'comprehension';
  level: number;
  maxLevel: number;
  xp: number;
  xpRequired: number;
  unlocked: boolean;
  prerequisites: string[]; // Other skill IDs required
  benefits: string[]; // What this skill gives you
  icon: string;
}

export interface DailyChallenge {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'word_hunt' | 'pattern_detective' | 'speed_reader' | 'quiz_master' | 'streak_keeper';
  title: string;
  description: string;
  target: number;
  progress: number;
  xpReward: number;
  completed: boolean;
  icon: string;
}

export interface UserStats {
  // Core progression
  totalXP: number;
  level: number;
  currentLevelXP: number;
  nextLevelXP: number;
  
  // Streaks
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  
  // Achievements
  achievementsUnlocked: number;
  totalAchievements: number;
  
  // Skills
  skillPoints: number;
  unlockedSkills: number;
  
  // Activity
  dailyGoal: number; // XP target per day
  dailyProgress: number;
  weeklyGoal: number;
  weeklyProgress: number;
  
  // Performance
  averageAccuracy: number;
  averageReadingSpeed: number;
  patternsDiscovered: number;
}

export class GamificationEngine {
  private stats: UserStats;
  private achievements: Map<string, Achievement> = new Map();
  private skills: Map<string, SkillNode> = new Map();
  private challenges: DailyChallenge[] = [];

  constructor(private deviceId: string) {
    this.stats = {
      totalXP: 0,
      level: 1,
      currentLevelXP: 0,
      nextLevelXP: 100,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: '',
      achievementsUnlocked: 0,
      totalAchievements: 0,
      skillPoints: 0,
      unlockedSkills: 0,
      dailyGoal: 150,
      dailyProgress: 0,
      weeklyGoal: 1000,
      weeklyProgress: 0,
      averageAccuracy: 0,
      averageReadingSpeed: 0,
      patternsDiscovered: 0
    };

    this.initializeAchievements();
    this.initializeSkillTree();
    this.generateDailyChallenges();
  }

  // Add XP and handle level ups
  addXP(gain: XPGain): { leveledUp: boolean; newLevel: number; achievementsUnlocked: Achievement[] } {
    const baseXP = gain.amount;
    const bonusMultiplier = gain.bonus || 1;
    const totalXP = Math.round(baseXP * bonusMultiplier);
    
    this.stats.totalXP += totalXP;
    this.stats.currentLevelXP += totalXP;
    this.stats.dailyProgress += totalXP;
    this.stats.weeklyProgress += totalXP;

    let leveledUp = false;
    let newLevel = this.stats.level;

    // Check for level up
    while (this.stats.currentLevelXP >= this.stats.nextLevelXP) {
      leveledUp = true;
      this.stats.currentLevelXP -= this.stats.nextLevelXP;
      this.stats.level++;
      newLevel = this.stats.level;
      
      // Calculate next level XP requirement (exponential growth)
      this.stats.nextLevelXP = Math.floor(100 * Math.pow(1.15, this.stats.level - 1));
      
      // Award skill points for leveling up
      this.stats.skillPoints += 2;
    }

    // Update daily challenges
    this.updateChallengeProgress(gain);

    // Check for new achievements
    const newAchievements = this.checkAchievements();

    return { leveledUp, newLevel, achievementsUnlocked: newAchievements };
  }

  private initializeAchievements(): void {
    const achievements: Achievement[] = [
      // Milestone achievements
      {
        id: 'first_word',
        category: 'milestone',
        name: 'First Steps',
        description: 'Save your first word',
        icon: '🎯',
        xpReward: 50,
        requirements: [{ type: 'words_saved', value: 1 }],
        unlocked: false,
        rarity: 'common'
      },
      {
        id: 'vocabulary_builder',
        category: 'milestone',
        name: 'Vocabulary Builder',
        description: 'Save 100 words',
        icon: '📚',
        xpReward: 200,
        requirements: [{ type: 'words_saved', value: 100 }],
        unlocked: false,
        rarity: 'rare'
      },
      {
        id: 'word_master',
        category: 'milestone',
        name: 'Word Master',
        description: 'Save 1000 words',
        icon: '👑',
        xpReward: 1000,
        requirements: [{ type: 'words_saved', value: 1000 }],
        unlocked: false,
        rarity: 'epic'
      },

      // Streak achievements
      {
        id: 'week_warrior',
        category: 'streak',
        name: 'Week Warrior',
        description: 'Maintain a 7-day learning streak',
        icon: '🔥',
        xpReward: 300,
        requirements: [{ type: 'streak_days', value: 7 }],
        unlocked: false,
        rarity: 'rare'
      },
      {
        id: 'month_master',
        category: 'streak',
        name: 'Month Master',
        description: 'Maintain a 30-day learning streak',
        icon: '🌟',
        xpReward: 1500,
        requirements: [{ type: 'streak_days', value: 30 }],
        unlocked: false,
        rarity: 'epic'
      },
      {
        id: 'year_legend',
        category: 'streak',
        name: 'Year Legend',
        description: 'Maintain a 365-day learning streak',
        icon: '👑',
        xpReward: 10000,
        requirements: [{ type: 'streak_days', value: 365 }],
        unlocked: false,
        rarity: 'legendary'
      },

      // Skill achievements
      {
        id: 'quiz_ace',
        category: 'skill',
        name: 'Quiz Ace',
        description: 'Achieve 90% accuracy on 20 quizzes',
        icon: '🎯',
        xpReward: 400,
        requirements: [{ type: 'quiz_accuracy', value: 90 }],
        unlocked: false,
        rarity: 'rare'
      },
      {
        id: 'speed_reader',
        category: 'skill',
        name: 'Speed Reader',
        description: 'Read at 300+ WPM for 10 sessions',
        icon: '⚡',
        xpReward: 500,
        requirements: [{ type: 'reading_wpm', value: 300 }],
        unlocked: false,
        rarity: 'epic'
      },

      // Discovery achievements
      {
        id: 'pattern_detective',
        category: 'discovery',
        name: 'Pattern Detective',
        description: 'Discover 50 language patterns',
        icon: '🔍',
        xpReward: 600,
        requirements: [{ type: 'patterns_found', value: 50 }],
        unlocked: false,
        rarity: 'epic'
      },
      {
        id: 'grammar_guru',
        category: 'discovery',
        name: 'Grammar Guru',
        description: 'Master 10 different grammar patterns',
        icon: '🧠',
        xpReward: 800,
        requirements: [{ type: 'patterns_found', value: 100 }],
        unlocked: false,
        rarity: 'legendary'
      }
    ];

    achievements.forEach(achievement => {
      this.achievements.set(achievement.id, achievement);
    });

    this.stats.totalAchievements = achievements.length;
  }

  private initializeSkillTree(): void {
    const skills: SkillNode[] = [
      // Vocabulary skills
      {
        id: 'basic_vocabulary',
        name: 'Basic Vocabulary',
        category: 'vocabulary',
        level: 0,
        maxLevel: 10,
        xp: 0,
        xpRequired: 100,
        unlocked: true,
        prerequisites: [],
        benefits: ['Faster word lookup', '+5% XP for saved words'],
        icon: '📖'
      },
      {
        id: 'advanced_vocabulary',
        name: 'Advanced Vocabulary',
        category: 'vocabulary',
        level: 0,
        maxLevel: 10,
        xp: 0,
        xpRequired: 200,
        unlocked: false,
        prerequisites: ['basic_vocabulary'],
        benefits: ['Complex word recognition', '+10% XP for rare words'],
        icon: '📚'
      },

      // Grammar skills
      {
        id: 'pattern_recognition',
        name: 'Pattern Recognition',
        category: 'patterns',
        level: 0,
        maxLevel: 8,
        xp: 0,
        xpRequired: 150,
        unlocked: true,
        prerequisites: [],
        benefits: ['Auto-detect collocations', '+15% pattern confidence'],
        icon: '🔍'
      },
      {
        id: 'grammar_mastery',
        name: 'Grammar Mastery',
        category: 'grammar',
        level: 0,
        maxLevel: 12,
        xp: 0,
        xpRequired: 250,
        unlocked: false,
        prerequisites: ['pattern_recognition'],
        benefits: ['Advanced grammar insights', 'Preposition suggestions'],
        icon: '⚙️'
      },

      // Reading skills
      {
        id: 'speed_reading',
        name: 'Speed Reading',
        category: 'reading',
        level: 0,
        maxLevel: 8,
        xp: 0,
        xpRequired: 180,
        unlocked: true,
        prerequisites: [],
        benefits: ['Reading speed tracking', '+5 WPM per level'],
        icon: '⚡'
      },
      {
        id: 'comprehension',
        name: 'Reading Comprehension',
        category: 'comprehension',
        level: 0,
        maxLevel: 10,
        xp: 0,
        xpRequired: 220,
        unlocked: false,
        prerequisites: ['speed_reading'],
        benefits: ['Better comprehension tracking', '+10% reading XP'],
        icon: '🧠'
      }
    ];

    skills.forEach(skill => {
      this.skills.set(skill.id, skill);
    });
  }

  private generateDailyChallenges(): void {
    const today = new Date().toISOString().split('T')[0];
    const challengeTypes = [
      {
        type: 'word_hunt' as const,
        title: 'Word Hunter',
        description: 'Save 5 new words today',
        target: 5,
        xpReward: 100,
        icon: '🎯'
      },
      {
        type: 'pattern_detective' as const,
        title: 'Pattern Detective',
        description: 'Discover 3 language patterns',
        target: 3,
        xpReward: 120,
        icon: '🔍'
      },
      {
        type: 'speed_reader' as const,
        title: 'Speed Reader',
        description: 'Complete 2 reading sessions',
        target: 2,
        xpReward: 80,
        icon: '📚'
      },
      {
        type: 'quiz_master' as const,
        title: 'Quiz Master',
        description: 'Score 85%+ on a vocabulary quiz',
        target: 85,
        xpReward: 150,
        icon: '🏆'
      },
      {
        type: 'streak_keeper' as const,
        title: 'Streak Keeper',
        description: 'Maintain your daily learning streak',
        target: 1,
        xpReward: 50,
        icon: '🔥'
      }
    ];

    // Generate 3 random challenges for today
    const todayChallenges = this.shuffleArray([...challengeTypes]).slice(0, 3);
    
    this.challenges = todayChallenges.map((challenge, index) => ({
      id: `${today}_${index}`,
      date: today,
      ...challenge,
      progress: 0,
      completed: false
    }));
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private updateChallengeProgress(gain: XPGain): void {
    const today = new Date().toISOString().split('T')[0];
    
    this.challenges.forEach(challenge => {
      if (challenge.date === today && !challenge.completed) {
        switch (challenge.type) {
          case 'word_hunt':
            if (gain.action === 'word_saved') challenge.progress++;
            break;
          case 'pattern_detective':
            if (gain.action === 'pattern_discovered') challenge.progress++;
            break;
          case 'speed_reader':
            if (gain.action === 'reading_session') challenge.progress++;
            break;
          case 'quiz_master':
            // This would need accuracy data passed in gain
            break;
          case 'streak_keeper':
            if (this.stats.currentStreak > 0) challenge.progress = 1;
            break;
        }

        if (challenge.progress >= challenge.target) {
          challenge.completed = true;
          this.addXP({ action: 'quiz_completed', amount: challenge.xpReward, source: 'daily_challenge' });
        }
      }
    });
  }

  private checkAchievements(): Achievement[] {
    const newAchievements: Achievement[] = [];

    this.achievements.forEach(achievement => {
      if (!achievement.unlocked && this.meetsRequirements(achievement.requirements)) {
        achievement.unlocked = true;
        achievement.unlockedAt = Date.now();
        newAchievements.push(achievement);
        this.stats.achievementsUnlocked++;
        
        // Award achievement XP
        this.stats.totalXP += achievement.xpReward;
        this.stats.currentLevelXP += achievement.xpReward;
      }
    });

    return newAchievements;
  }

  private meetsRequirements(requirements: AchievementRequirement[]): boolean {
    return requirements.every(req => {
      switch (req.type) {
        case 'words_saved':
          // This would check against user's actual word count
          return true; // Placeholder
        case 'streak_days':
          return this.stats.longestStreak >= req.value;
        case 'quiz_accuracy':
          return this.stats.averageAccuracy >= req.value;
        case 'reading_wpm':
          return this.stats.averageReadingSpeed >= req.value;
        case 'patterns_found':
          return this.stats.patternsDiscovered >= req.value;
        default:
          return false;
      }
    });
  }

  // Skill tree management
  unlockSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill || skill.unlocked) return false;

    // Check prerequisites
    const prereqsMet = skill.prerequisites.every(prereqId => {
      const prereq = this.skills.get(prereqId);
      return prereq && prereq.level >= 1;
    });

    if (!prereqsMet) return false;

    skill.unlocked = true;
    this.stats.unlockedSkills++;
    return true;
  }

  upgradeSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill || !skill.unlocked || skill.level >= skill.maxLevel) return false;

    if (this.stats.skillPoints < 1) return false;

    skill.level++;
    this.stats.skillPoints--;
    skill.xpRequired = Math.floor(skill.xpRequired * 1.2);

    return true;
  }

  // Getters for UI
  getStats(): UserStats {
    return { ...this.stats };
  }

  getAchievements(): Achievement[] {
    return Array.from(this.achievements.values());
  }

  getSkillTree(): SkillNode[] {
    return Array.from(this.skills.values());
  }

  getDailyChallenges(): DailyChallenge[] {
    return [...this.challenges];
  }

  // Save/load from storage
  async saveToStorage(): Promise<void> {
    const data = {
      stats: this.stats,
      achievements: Object.fromEntries(
        Array.from(this.achievements.entries()).map(([k, v]) => [k, v])
      ),
      skills: Object.fromEntries(
        Array.from(this.skills.entries()).map(([k, v]) => [k, v])
      ),
      challenges: this.challenges,
      lastUpdated: Date.now()
    };

    await chrome.storage.local.set({
      [`gamification_${this.deviceId}`]: data
    });
  }

  async loadFromStorage(): Promise<void> {
    const result = await chrome.storage.local.get([`gamification_${this.deviceId}`]);
    const data = result[`gamification_${this.deviceId}`] as any;
    
    if (data && typeof data === 'object') {
      if (data.stats) {
        this.stats = { ...this.stats, ...data.stats };
      }
      
      if (data.achievements) {
        this.achievements = new Map(Object.entries(data.achievements));
      }
      
      if (data.skills) {
        this.skills = new Map(Object.entries(data.skills));
      }
      
      if (data.challenges) {
        this.challenges = data.challenges;
      }
    }
  }

  // Update streaks
  updateDailyActivity(): void {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (this.stats.lastActiveDate === yesterday) {
      // Continue streak
      this.stats.currentStreak++;
    } else if (this.stats.lastActiveDate !== today) {
      // Start new streak
      this.stats.currentStreak = 1;
    }

    if (this.stats.currentStreak > this.stats.longestStreak) {
      this.stats.longestStreak = this.stats.currentStreak;
    }

    this.stats.lastActiveDate = today;
  }
}

// Export singleton
let gamificationEngine: GamificationEngine | null = null;

export async function getGamificationEngine(deviceId: string): Promise<GamificationEngine> {
  if (!gamificationEngine) {
    gamificationEngine = new GamificationEngine(deviceId);
    await gamificationEngine.loadFromStorage();
  }
  return gamificationEngine;
}