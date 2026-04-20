#!/usr/bin/env node
/**
 * Database setup and migration script for GuardDog
 */
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

console.log('🗄️  Setting up GuardDog database...\n');

// Check if .env exists
if (!fs.existsSync('.env')) {
    console.error('❌ .env file not found!');
    console.log('📝 Run: cp .env.example .env');
    process.exit(1);
}

// Load environment variables
await import('dotenv/config');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.log('⚠️  No DATABASE_URL configured, using in-memory storage');
    console.log('💡 To use PostgreSQL, set DATABASE_URL in your .env file');
    process.exit(0);
}

console.log('📋 Database Configuration:');
console.log(`   URL: ${DATABASE_URL.replace(/:[^@]+@/, ':****@')}`);

try {
    // Test database connection
    console.log('\n🔗 Testing database connection...');

    // Extract database details from URL
    const url = new URL(DATABASE_URL);
    const dbName = url.pathname.slice(1); // Remove leading slash
    const user = url.username;
    const password = url.password;
    const host = url.hostname;
    const port = url.port || '5432';

    // Test if database exists
    try {
        execSync(`psql "${DATABASE_URL}" -c "SELECT 1;"`, { stdio: 'pipe' });
        console.log('✅ Database connection successful');
    } catch (error) {
        console.log('❌ Database connection failed, attempting to create database...');

        // Try to create the database
        const adminUrl = `postgresql://${user}:${password}@${host}:${port}/postgres`;
        try {
            execSync(`psql "${adminUrl}" -c "CREATE DATABASE ${dbName};"`, { stdio: 'pipe' });
            console.log(`✅ Database '${dbName}' created successfully`);
        } catch (createError) {
            console.log(`⚠️  Could not create database (it may already exist)`);
        }
    }

    // Run Drizzle migrations
    console.log('\n📊 Running database migrations...');
    try {
        execSync('npm run db:push', { stdio: 'inherit' });
        console.log('✅ Database schema updated successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }

    console.log('\n🎉 Database setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Configure your Google OAuth credentials');
    console.log('2. Add your OpenAI API key');
    console.log('3. Run: npm run dev');

} catch (error) {
    console.error('❌ Database setup failed:', error);
    console.log('\n💡 Manual setup instructions:');
    console.log('1. Ensure PostgreSQL is installed and running');
    console.log('2. Create database and user:');
    console.log('   CREATE DATABASE guarddog;');
    console.log('   CREATE USER guarddog_user WITH PASSWORD \'guarddog_password\';');
    console.log('   GRANT ALL PRIVILEGES ON DATABASE guarddog TO guarddog_user;');
    console.log('3. Update DATABASE_URL in .env file');
    console.log('4. Run: npm run db:push');
    process.exit(1);
}