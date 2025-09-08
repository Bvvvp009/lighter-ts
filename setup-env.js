#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const envExamplePath = path.join(__dirname, 'env.example');
const envPath = path.join(__dirname, '.env');

// Check if .env already exists
if (fs.existsSync(envPath)) {
  console.log('.env file already exists. Skipping setup.');
  process.exit(0);
}

// Check if env.example exists
if (!fs.existsSync(envExamplePath)) {
  console.error('env.example file not found. Please create it first.');
  process.exit(1);
}

try {
  // Copy env.example to .env
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  fs.writeFileSync(envPath, envExampleContent);
  
  console.log('✅ .env file created successfully!');
  console.log('📝 Please edit the .env file and add your actual values:');
  console.log('   - PRIVATE_KEY: Your API private key');
  console.log('   - BASE_URL: API endpoint (optional)');
  console.log('');
  console.log('💡 You can get your private key by running: npm run example:system-setup');
  
} catch (error) {
  console.error('❌ Error creating .env file:', error.message);
  process.exit(1);
} 