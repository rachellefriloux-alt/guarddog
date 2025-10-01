#!/usr/bin/env node

/**
 * Environment Configuration Validator
 * 
 * Run this script to validate your .env configuration before deploying.
 * 
 * Usage: node scripts/validate-env.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};

  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return env;
}

function isPlaceholder(value) {
  if (!value) return true;
  const placeholders = [
    '<your-',
    'your-',
    'change-me',
    '-here>',
    'placeholder',
  ];
  return placeholders.some(p => value.toLowerCase().includes(p));
}

function validateEnvironment() {
  log('\n🔍 GuardDog Environment Validator\n', 'bold');

  // Check if .env exists
  if (!fs.existsSync(envPath)) {
    log('❌ .env file not found!', 'red');
    log('   Run: cp .env.example .env', 'yellow');
    return false;
  }

  const env = loadEnvFile(envPath);
  const envExample = loadEnvFile(envExamplePath);

  const isProduction = process.env.NODE_ENV === 'production';
  let hasErrors = false;
  let hasWarnings = false;

  // Required variables for production
  const requiredInProduction = {
    SESSION_SECRET: {
      check: (val) => !isPlaceholder(val) && val.length >= 32,
      message: 'Must be a secure random string (≥32 chars). Generate with: openssl rand -base64 32',
      critical: true,
    },
    GOOGLE_AUTH_CLIENT_ID: {
      check: (val) => !isPlaceholder(val) && val.length > 20,
      message: 'Required for Google authentication. Get from Google Cloud Console.',
      critical: isProduction,
    },
    VITE_GOOGLE_CLIENT_ID: {
      check: (val) => !isPlaceholder(val) && val.length > 20,
      message: 'Required for frontend Google authentication. Usually same as GOOGLE_AUTH_CLIENT_ID.',
      critical: isProduction,
    },
  };

  // Recommended variables
  const recommended = {
    OPENAI_API_KEY: {
      check: (val) => !isPlaceholder(val) && val.startsWith('sk-'),
      message: 'Recommended for AI detection features. Get from https://platform.openai.com/api-keys',
      critical: false,
    },
    DATABASE_URL: {
      check: (val) => val && val.startsWith('postgresql://'),
      message: 'Recommended for persistent storage. Will use in-memory storage otherwise.',
      critical: false,
    },
    GOOGLE_CLIENT_ID: {
      check: (val) => !isPlaceholder(val),
      message: 'Optional - for Google Drive integration.',
      critical: false,
    },
    GOOGLE_CLIENT_SECRET: {
      check: (val) => !isPlaceholder(val),
      message: 'Optional - for Google Drive integration.',
      critical: false,
    },
  };

  log('Required Configuration:', 'blue');
  for (const [key, config] of Object.entries(requiredInProduction)) {
    const value = env[key];
    const isValid = config.check(value);

    if (isValid) {
      log(`  ✅ ${key}`, 'green');
    } else {
      const symbol = config.critical ? '❌' : '⚠️';
      const color = config.critical ? 'red' : 'yellow';
      log(`  ${symbol} ${key}`, color);
      log(`     ${config.message}`, color);
      
      if (config.critical) {
        hasErrors = true;
      } else {
        hasWarnings = true;
      }
    }
  }

  log('\nRecommended Configuration:', 'blue');
  for (const [key, config] of Object.entries(recommended)) {
    const value = env[key];
    const isValid = config.check(value);

    if (isValid) {
      log(`  ✅ ${key}`, 'green');
    } else {
      log(`  ⚠️  ${key}`, 'yellow');
      log(`     ${config.message}`, 'yellow');
      hasWarnings = true;
    }
  }

  // Check for potentially exposed secrets
  log('\nSecurity Checks:', 'blue');
  
  const securityIssues = [];
  
  if (env.SESSION_SECRET === envExample?.SESSION_SECRET) {
    securityIssues.push('SESSION_SECRET matches example file - must be changed!');
  }
  
  if (env.OPENAI_API_KEY?.length > 20 && !env.OPENAI_API_KEY.includes('*')) {
    log('  ⚠️  OpenAI API key is set (ensure it\'s not committed to git)', 'yellow');
  }

  if (securityIssues.length > 0) {
    securityIssues.forEach(issue => {
      log(`  ❌ ${issue}`, 'red');
      hasErrors = true;
    });
  } else {
    log('  ✅ No obvious security issues detected', 'green');
  }

  // Summary
  log('\n' + '─'.repeat(50), 'blue');
  
  if (hasErrors) {
    log('\n❌ Validation Failed!', 'red');
    log('   Please fix the errors above before deploying.\n', 'red');
    return false;
  } else if (hasWarnings) {
    log('\n⚠️  Validation Passed with Warnings', 'yellow');
    log('   Some features may not work without optional configuration.\n', 'yellow');
    return true;
  } else {
    log('\n✅ All Validations Passed!', 'green');
    log('   Your configuration looks good.\n', 'green');
    return true;
  }
}

// Run validation
const success = validateEnvironment();
process.exit(success ? 0 : 1);
