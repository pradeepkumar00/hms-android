#!/usr/bin/env node

/**
 * Environment Variables Debug Tool
 * This tool helps diagnose environment variable loading issues with react-native-config
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Environment Variables Debug Tool\n');

// Check if environment files exist
const envFiles = ['.env', '.env.development', '.env.staging', '.env.production'];
const projectRoot = process.cwd();

console.log('📁 Environment Files Check:');
envFiles.forEach(filename => {
  const filePath = path.join(projectRoot, filename);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${filename} exists`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const envMatch = content.match(/ENVIRONMENT=(.+)/);
      const apiMatch = content.match(/API_BASE_URL=(.+)/);
      const firebaseMatch = content.match(/FIREBASE_PROJECT_ID=(.+)/);

      if (envMatch) console.log(`   Environment: ${envMatch[1].trim()}`);
      if (apiMatch) console.log(`   API URL: ${apiMatch[1].trim()}`);
      if (firebaseMatch) console.log(`   Firebase Project: ${firebaseMatch[1].trim()}`);
      console.log('');
    } catch (error) {
      console.log(`   Error reading file: ${error.message}`);
    }
  } else {
    console.log(`❌ ${filename} missing`);
  }
});

// Check react-native-config setup
console.log('📦 React Native Config Setup:');
const packageJsonPath = path.join(projectRoot, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const hasConfig = packageJson.dependencies && packageJson.dependencies['react-native-config'];
  console.log(`✅ react-native-config installed: ${hasConfig ? 'Yes' : 'No'}`);
  if (hasConfig) {
    console.log(`   Version: ${packageJson.dependencies['react-native-config']}`);
  }
} else {
  console.log('❌ package.json not found');
}

console.log('\n💡 Troubleshooting Tips:');
console.log('1. Environment variables require FULL APP REBUILD after changes');
console.log('2. Use `npm run android:clean` or `npm run ios:clean` before rebuild');
console.log('3. Check if Metro bundler cache needs clearing: `npx react-native start --reset-cache`');
console.log('4. Verify Android build variants match environment (dev/staging/prod)');
console.log('5. iOS schemes must be correctly configured for each environment');

console.log('\n🛠️ Quick Fix Commands:');
console.log('# For Android:');
console.log('npm run android:clean && npm run android:dev');
console.log('# For iOS:');
console.log('npm run ios:clean && npm run ios:dev');

console.log('\n📱 Environment Switching:');
console.log('npm run env:dev && npm run android:dev     # Development');
console.log('npm run env:staging && npm run android:staging # Staging');
console.log('npm run env:prod && npm run android:prod   # Production');
