import { useState, useEffect } from "react";

export interface AISettingsProps {
  onClose?: () => void;
}

export function AISettings({ onClose }: AISettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [userLevel, setUserLevel] = useState('B1');
  const [targetLanguage, setTargetLanguage] = useState('ru');
  const [enableWritingAssistant, setEnableWritingAssistant] = useState(true);
  const [enableSmartTranslation, setEnableSmartTranslation] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await chrome.storage.sync.get([
        'openaiApiKey',
        'translationModel',
        'userLevel',
        'targetLang',
        'enableWritingAssistant',
        'enableSmartTranslation'
      ]) as any;

      setApiKey(settings?.openaiApiKey || '');
      setModel(settings?.translationModel || 'gpt-4o-mini');
      setUserLevel(settings?.userLevel || 'B1');
      setTargetLanguage(settings?.targetLang || 'ru');
      setEnableWritingAssistant(settings?.enableWritingAssistant !== false);
      setEnableSmartTranslation(settings?.enableSmartTranslation !== false);
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      
      await chrome.storage.sync.set({
        openaiApiKey: apiKey.trim(),
        translationModel: model,
        userLevel,
        targetLang: targetLanguage,
        enableWritingAssistant,
        enableSmartTranslation
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save AI settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const testAPIKey = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an API key first');
      return;
    }

    try {
      setSaving(true);
      
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        }
      });

      if (response.ok) {
        alert('✅ API key is valid!');
      } else {
        alert('❌ API key is invalid or expired');
      }
    } catch (error) {
      alert('❌ Failed to test API key. Check your internet connection.');
    } finally {
      setSaving(false);
    }
  };

  const maskAPIKey = (key: string): string => {
    if (key.length < 10) return key;
    return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">AI Features Settings</h1>
            <p className="text-blue-100">Configure AI-powered language learning</p>
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
      </div>

      {/* API Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🔑 OpenAI API Configuration</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={testAPIKey}
                disabled={saving || !apiKey.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get your API key from{' '}
              <a 
                href="https://platform.openai.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700"
              >
                OpenAI Dashboard
              </a>
            </p>
            {apiKey && (
              <p className="text-xs text-gray-600 mt-1">
                Current key: {maskAPIKey(apiKey)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              AI Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="gpt-4o-mini">GPT-4o Mini (Recommended - Cost Effective)</option>
              <option value="gpt-4o">GPT-4o (Higher Quality, Higher Cost)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo (Premium Quality)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              GPT-4o Mini is perfect for language learning and costs 60x less than GPT-4
            </p>
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">👤 Learning Profile</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              English Level
            </label>
            <select
              value={userLevel}
              onChange={(e) => setUserLevel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="A1">A1 - Beginner</option>
              <option value="A2">A2 - Elementary</option>
              <option value="B1">B1 - Intermediate</option>
              <option value="B2">B2 - Upper Intermediate</option>
              <option value="C1">C1 - Advanced</option>
              <option value="C2">C2 - Proficient</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Native Language
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ru">Russian (Русский)</option>
              <option value="es">Spanish (Español)</option>
              <option value="fr">French (Français)</option>
              <option value="de">German (Deutsch)</option>
              <option value="it">Italian (Italiano)</option>
              <option value="pt">Portuguese (Português)</option>
              <option value="zh">Chinese (中文)</option>
              <option value="ja">Japanese (日本語)</option>
              <option value="ko">Korean (한국어)</option>
              <option value="ar">Arabic (العربية)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Feature Toggles */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🚀 AI Features</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✍️</span>
              <div>
                <h3 className="font-medium text-gray-900">Smart Writing Assistant</h3>
                <p className="text-sm text-gray-600">Real-time grammar, style, and vocabulary suggestions</p>
              </div>
            </div>
            <button
              onClick={() => setEnableWritingAssistant(!enableWritingAssistant)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                enableWritingAssistant ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                enableWritingAssistant ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              <div>
                <h3 className="font-medium text-gray-900">Smart Translation</h3>
                <p className="text-sm text-gray-600">Context-aware translations with learning insights</p>
              </div>
            </div>
            <button
              onClick={() => setEnableSmartTranslation(!enableSmartTranslation)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                enableSmartTranslation ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                enableSmartTranslation ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Cost Information */}
      <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6">
        <h2 className="text-lg font-semibold text-yellow-800 mb-4">💰 Cost Information</h2>
        
        <div className="space-y-3 text-sm text-yellow-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3">
              <div className="font-medium text-gray-900">GPT-4o Mini</div>
              <div className="text-xs text-gray-600">~$0.01 per 100 words</div>
              <div className="text-xs text-green-600">Recommended</div>
            </div>
            <div className="bg-white rounded-lg p-3">
              <div className="font-medium text-gray-900">GPT-4o</div>
              <div className="text-xs text-gray-600">~$0.15 per 100 words</div>
              <div className="text-xs text-yellow-600">Premium</div>
            </div>
            <div className="bg-white rounded-lg p-3">
              <div className="font-medium text-gray-900">Monthly Estimate</div>
              <div className="text-xs text-gray-600">$2-10 with Mini</div>
              <div className="text-xs text-blue-600">Typical usage</div>
            </div>
          </div>
          <p className="text-xs">
            💡 Smart features only activate when you request them, keeping costs low. 
            The free algorithmic features (patterns, predictions, RPG) work without any API calls.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={saveSettings}
          disabled={saving}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            saved 
              ? 'bg-green-500 text-white'
              : saving
              ? 'bg-gray-400 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saved ? '✅ Saved!' : saving ? 'Saving...' : 'Save Settings'}
        </button>
        
        {onClose && (
          <button
            onClick={onClose}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* Help */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="font-medium text-gray-900 mb-2">Need Help?</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• Get a free OpenAI API key (includes $5 credit for new accounts)</p>
          <p>• Start with GPT-4o Mini for cost-effective learning</p>
          <p>• AI features enhance the free algorithmic intelligence</p>
          <p>• Your API key is stored locally and never shared</p>
        </div>
      </div>
    </div>
  );
}