#!/usr/bin/env node

/**
 * Test script to verify environment configuration
 * Run: node test-environment.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Environment Configuration Test\n');

// Check if .env files exist
const envFiles = ['.env', '.env.development', '.env.staging', '.env.production'];
const rootDir = __dirname;

console.log('📁 Checking environment files:');
envFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  const exists = fs.existsSync(filePath);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
  
  if (exists) {
    const content = fs.readFileSync(filePath, 'utf8');
    const envMatch = content.match(/ENVIRONMENT=(\w+)/);
    const apiMatch = content.match(/API_BASE_URL=(.+)/);
    
    if (envMatch && apiMatch) {
      console.log(`      Environment: ${envMatch[1]}`);
      console.log(`      API: ${apiMatch[1]}`);
    }
  }
});

console.log('\n📋 Package.json scripts check:');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const scriptsToCheck = ['start', 'android', 'ios', 'android:dev', 'android:prod'];
scriptsToCheck.forEach(script => {
  if (packageJson.scripts[script]) {
    const hasEnvFile = packageJson.scripts[script].includes('ENVFILE=');
    console.log(`   ${hasEnvFile ? '✅' : '❌'} ${script}: ${hasEnvFile ? 'Uses ENVFILE' : 'No ENVFILE specified'}`);
  } else {
    console.log(`   ❌ ${script}: Not found`);
  }
});

console.log('\n🔧 Current .env configuration:');
const currentEnv = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
const currentEnvName = currentEnv.match(/ENVIRONMENT=(\w+)/);
const currentAPI = currentEnv.match(/API_BASE_URL=(.+)/);

console.log(`   Environment: ${currentEnvName ? currentEnvName[1] : 'NOT FOUND'}`);
console.log(`   API: ${currentAPI ? currentAPI[1] : 'NOT FOUND'}`);

console.log('\n✅ Recommendations:');
console.log('   1. Use "npm run start" for development (auto-loads .env.development)');
console.log('   2. Use "npm run android" for development (auto-loads .env.development)');
console.log('   3. Use "npm run android:prod" for production builds');
console.log('   4. Run "npm run env:check" to verify current .env file');

console.log('\n🎉 Environment setup looks good!');

