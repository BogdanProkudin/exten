import { useState, useEffect } from "react";
import { getGamificationEngine } from "../../src/lib/gamification";
import { getPatternAnalyzer } from "../../src/lib/pattern-analyzer";
import { getDeviceId } from "../../src/lib/device-id";

export interface GamificationDashboardProps {
  deviceId: string;
  onClose?: () => void;
}

export function GamificationDashboard({ deviceId, onClose }: GamificationDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'skills' | 'challenges' | 'patterns'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any>({ collocations: [], grammar: [], weakSpots: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGamificationData();
  }, [deviceId]);

  const loadGamificationData = async () => {
    try {
      const [gamification, patternAnalyzer] = await Promise.all([
        getGamificationEngine(deviceId),
        getPatternAnalyzer(deviceId)
      ]);

      setStats(gamification.getStats());
      setAchievements(gamification.getAchievements());
      setSkills(gamification.getSkillTree());
      setChallenges(gamification.getDailyChallenges());
      
      setPatterns({
        collocations: patternAnalyzer.getCollocationsInsights(),
        grammar: patternAnalyzer.getGrammarInsights(),
        weakSpots: patternAnalyzer.getPersonalWeakSpots()
      });
      
    } catch (error) {
      console.error('Failed to load gamification data:', error);
    } finally {
      setLoading(false);
    }
  };

  const upgradeSkill = async (skillId: string) => {
    try {
      const gamification = await getGamificationEngine(deviceId);
      const success = gamification.upgradeSkill(skillId);
      
      if (success) {
        await gamification.saveToStorage();
        loadGamificationData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to upgrade skill:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Language Learning RPG</h1>
            <p className="text-purple-100">Your progress and achievements</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-xl transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.level}</div>
              <div className="text-sm text-purple-200">Level</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.totalXP.toLocaleString()}</div>
              <div className="text-sm text-purple-200">Total XP</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.currentStreak}</div>
              <div className="text-sm text-purple-200">Day Streak</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.achievementsUnlocked}</div>
              <div className="text-sm text-purple-200">Achievements</div>
            </div>
          </div>
        )}
        
        {stats && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Level {stats.level}</span>
              <span>{stats.currentLevelXP} / {stats.nextLevelXP} XP</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div 
                className="bg-white rounded-full h-2 transition-all duration-500"
                style={{ width: `${(stats.currentLevelXP / stats.nextLevelXP) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'achievements', label: 'Achievements', icon: '🏆' },
          { id: 'skills', label: 'Skills', icon: '🌟' },
          { id: 'challenges', label: 'Challenges', icon: '🎯' },
          { id: 'patterns', label: 'Patterns', icon: '🔍' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Progress */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Progress</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Daily XP Goal</span>
                  <span>{stats.dailyProgress} / {stats.dailyGoal}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 rounded-full h-2 transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.dailyProgress / stats.dailyGoal) * 100)}%` }}
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Weekly XP Goal</span>
                  <span>{stats.weeklyProgress} / {stats.weeklyGoal}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 rounded-full h-2 transition-all duration-500"
                    style={{ width: `${Math.min(100, (stats.weeklyProgress / stats.weeklyGoal) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Streak Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🔥 Streak Stats</h3>
            <div className="text-center">
              <div className="text-4xl font-bold text-orange-500 mb-2">{stats.currentStreak}</div>
              <div className="text-sm text-gray-600 mb-4">Current Streak</div>
              <div className="text-gray-500 text-sm">
                Longest streak: <span className="font-medium">{stats.longestStreak} days</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Last active: {stats.lastActiveDate || 'Today'}
              </div>
            </div>
          </div>

          {/* Recent Achievements */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 md:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Achievements</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {achievements
                .filter(a => a.unlocked)
                .sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0))
                .slice(0, 6)
                .map(achievement => (
                  <div key={achievement.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-2xl">{achievement.icon}</span>
                    <div>
                      <div className="font-medium text-gray-900">{achievement.name}</div>
                      <div className="text-xs text-gray-500">{achievement.description}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'achievements' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map(achievement => (
              <div
                key={achievement.id}
                className={`border-2 rounded-xl p-4 transition-all ${
                  achievement.unlocked
                    ? achievement.rarity === 'legendary' 
                      ? 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-amber-50'
                      : achievement.rarity === 'epic'
                      ? 'border-purple-300 bg-gradient-to-br from-purple-50 to-indigo-50'
                      : achievement.rarity === 'rare'
                      ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50'
                      : 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50'
                    : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{achievement.icon}</span>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    achievement.rarity === 'legendary' ? 'bg-yellow-200 text-yellow-800' :
                    achievement.rarity === 'epic' ? 'bg-purple-200 text-purple-800' :
                    achievement.rarity === 'rare' ? 'bg-blue-200 text-blue-800' :
                    'bg-green-200 text-green-800'
                  }`}>
                    {achievement.rarity}
                  </div>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">{achievement.name}</h4>
                <p className="text-sm text-gray-600 mb-2">{achievement.description}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">+{achievement.xpReward} XP</span>
                  {achievement.unlocked && achievement.unlockedAt && (
                    <span className="text-xs text-gray-400">
                      {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'skills' && stats && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Skill Tree</h3>
              <div className="text-sm text-gray-600">
                Available Skill Points: <span className="font-bold text-blue-600">{stats.skillPoints}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map(skill => (
                <div
                  key={skill.id}
                  className={`border-2 rounded-xl p-4 ${
                    skill.unlocked 
                      ? 'border-blue-200 bg-blue-50' 
                      : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{skill.icon}</span>
                    <div className="text-right">
                      <div className="text-sm font-bold">Level {skill.level}</div>
                      <div className="text-xs text-gray-500">Max: {skill.maxLevel}</div>
                    </div>
                  </div>
                  
                  <h4 className="font-semibold text-gray-900 mb-2">{skill.name}</h4>
                  
                  <div className="space-y-2 mb-3">
                    {skill.benefits.map((benefit: string, idx: number) => (
                      <div key={idx} className="text-xs text-gray-600 flex items-center">
                        <span className="mr-1">•</span>
                        {benefit}
                      </div>
                    ))}
                  </div>
                  
                  {skill.unlocked && skill.level < skill.maxLevel && stats.skillPoints >= 1 && (
                    <button
                      onClick={() => upgradeSkill(skill.id)}
                      className="w-full py-2 px-3 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Upgrade (1 SP)
                    </button>
                  )}
                  
                  {!skill.unlocked && skill.prerequisites.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Requires: {skill.prerequisites.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'challenges' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Challenges</h3>
            <div className="space-y-3">
              {challenges.map(challenge => (
                <div
                  key={challenge.id}
                  className={`p-4 rounded-lg border-2 ${
                    challenge.completed 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">{challenge.icon}</span>
                      <h4 className="font-semibold text-gray-900">{challenge.title}</h4>
                    </div>
                    {challenge.completed && (
                      <span className="text-green-600 text-xl">✓</span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">{challenge.description}</p>
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        Progress: {challenge.progress} / {challenge.target}
                      </div>
                      <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            challenge.completed ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(100, (challenge.progress / challenge.target) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-yellow-600">+{challenge.xpReward} XP</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'patterns' && (
        <div className="space-y-6">
          {/* Collocations */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🔗 Word Collocations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {patterns.collocations.slice(0, 10).map((collocation: any, idx: number) => (
                <div key={idx} className="p-3 bg-blue-50 rounded-lg">
                  <div className="font-medium text-blue-900">{collocation.word.replace('_', ' + ')}</div>
                  <div className="text-sm text-blue-600">
                    Used {collocation.frequency}x • {collocation.confidence}% confidence
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grammar Patterns */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 Grammar Patterns</h3>
            <div className="space-y-3">
              {patterns.grammar.slice(0, 8).map((pattern: any, idx: number) => (
                <div key={idx} className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-green-900">{pattern.correctUsage}</div>
                    <div className="px-2 py-1 bg-green-200 text-green-800 text-xs rounded">
                      {pattern.type.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-sm text-green-600">
                    {pattern.confidence}% confidence • Last seen: {new Date(pattern.lastSeen).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Personal Weak Spots */}
          {patterns.weakSpots.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">⚠️ Personal Weak Spots</h3>
              <div className="space-y-3">
                {patterns.weakSpots.map((weakSpot: any, idx: number) => (
                  <div key={idx} className="p-3 bg-orange-50 rounded-lg">
                    <div className="font-medium text-orange-900 mb-2">
                      {weakSpot.wordPair.join(' vs ')}
                    </div>
                    <div className="text-sm text-orange-700 mb-2">
                      Confused {weakSpot.confusionCount} times
                    </div>
                    <div className="space-y-1">
                      {weakSpot.contextClues.map((clue: string, clueIdx: number) => (
                        <div key={clueIdx} className="text-xs text-orange-600">
                          • {clue}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}