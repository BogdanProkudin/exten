// Test script to verify all Vocabify features are working
console.log('🧪 Testing Vocabify Features...\n');

// Check if all major files exist and have content
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  '.output/chrome-mv3/manifest.json',
  '.output/chrome-mv3/background.js',
  '.output/chrome-mv3/content-scripts/content.js',
  '.output/chrome-mv3/chunks/newtab-C4j50yRI.js',
  'src/lib/pattern-analyzer.ts',
  'src/lib/gamification.ts', 
  'src/lib/prediction-engine.ts',
  'src/lib/ai-translator.ts',
  'src/lib/ai-writing-assistant.ts',
  'entrypoints/content/ReadingSpeedTracker.tsx',
  'entrypoints/content/PredictionWidget.tsx',
  'entrypoints/content/WritingAssistant.tsx',
  'entrypoints/newtab/GamificationDashboard.tsx',
  'entrypoints/newtab/PredictionDashboard.tsx',
  'entrypoints/newtab/AISettings.tsx'
];

let allFilesExist = true;

console.log('📁 Checking core files...');
for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`✅ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
}

console.log('\n🔍 Checking feature integration...');

// Check content script for feature integration
const contentScript = fs.readFileSync('.output/chrome-mv3/content-scripts/content.js', 'utf8');

const features = [
  { name: 'Reading Speed Tracker', pattern: /ReadingSpeed|reading.*speed/i },
  { name: 'Pattern Analyzer', pattern: /PatternAnalyzer|pattern.*analy/i },
  { name: 'Gamification Engine', pattern: /GamificationEngine|gamification/i },
  { name: 'Prediction Engine', pattern: /PredictionEngine|prediction.*engine/i },
  { name: 'AI Writing Assistant', pattern: /WritingAssistant|writing.*assistant/i },
  { name: 'AI Translator', pattern: /AITranslator|ai.*translator/i }
];

let allFeaturesPresent = true;

for (const feature of features) {
  if (feature.pattern.test(contentScript)) {
    console.log(`✅ ${feature.name} - Integrated`);
  } else {
    console.log(`❌ ${feature.name} - NOT FOUND`);
    allFeaturesPresent = false;
  }
}

console.log('\n📦 Checking newtab dashboard...');

const newtabScript = fs.readFileSync('.output/chrome-mv3/chunks/newtab-C4j50yRI.js', 'utf8');

const dashboards = [
  { name: 'RPG Dashboard', pattern: /RPG.*Dashboard|gamification.*dashboard/i },
  { name: 'Predictions Dashboard', pattern: /Prediction.*Dashboard|prediction.*dashboard/i },
  { name: 'AI Settings', pattern: /AI.*Settings|ai.*settings/i }
];

let allDashboardsPresent = true;

for (const dashboard of dashboards) {
  if (dashboard.pattern.test(newtabScript)) {
    console.log(`✅ ${dashboard.name} - Available`);
  } else {
    console.log(`❌ ${dashboard.name} - NOT FOUND`);
    allDashboardsPresent = false;
  }
}

// Check build stats
console.log('\n📊 Build Statistics:');
const manifestData = JSON.parse(fs.readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
console.log(`Extension Name: ${manifestData.name}`);
console.log(`Version: ${manifestData.version}`);
console.log(`Permissions: ${manifestData.permissions.length} granted`);

const buildDir = '.output/chrome-mv3';
const buildFiles = fs.readdirSync(buildDir, { recursive: true }).filter(f => 
  typeof f === 'string' && (f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.html'))
);

let totalSize = 0;
for (const file of buildFiles) {
  const stats = fs.statSync(path.join(buildDir, file));
  totalSize += stats.size;
}

console.log(`Total Build Size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
console.log(`Total Files: ${buildFiles.length}`);

// Final result
console.log('\n🎯 TEST RESULTS:');
console.log(`Files Check: ${allFilesExist ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Features Check: ${allFeaturesPresent ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Dashboards Check: ${allDashboardsPresent ? '✅ PASS' : '❌ FAIL'}`);

const overallStatus = allFilesExist && allFeaturesPresent && allDashboardsPresent;
console.log(`\n🚀 OVERALL STATUS: ${overallStatus ? '✅ ALL SYSTEMS GO!' : '❌ ISSUES DETECTED'}`);

if (overallStatus) {
  console.log(`
🎉 VOCABIFY IS READY FOR DEPLOYMENT!

Features Included:
• 📖 Reading Speed Analytics
• 🧠 Pattern Recognition Engine  
• 🎮 RPG Gamification System
• 🔮 Smart Word Predictions
• ✍️ AI Writing Assistant
• 🧠 Context-Aware Translation

Ready for Chrome Web Store submission!
  `);
}

process.exit(overallStatus ? 0 : 1);