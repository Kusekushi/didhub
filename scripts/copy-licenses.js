#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Copy license files to public directory for development
const staticDir = path.join(__dirname, '..', 'static');
const publicDir = path.join(__dirname, '..', 'packages', 'frontend', 'public');

const frontendLicense = 'licenses-frontend.json';
const backendLicense = 'licenses-backend.json';

try {
  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Copy frontend license
  const frontendSrc = path.join(staticDir, frontendLicense);
  const frontendDest = path.join(publicDir, frontendLicense);
  if (fs.existsSync(frontendSrc)) {
    fs.copyFileSync(frontendSrc, frontendDest);
    console.log(`Copied ${frontendLicense} to public directory`);
  }

  // Copy backend license
  const backendSrc = path.join(staticDir, backendLicense);
  const backendDest = path.join(publicDir, backendLicense);
  if (fs.existsSync(backendSrc)) {
    fs.copyFileSync(backendSrc, backendDest);
    console.log(`Copied ${backendLicense} to public directory`);
  }

  console.log('License files copied successfully');
} catch (error) {
  console.error('Error copying license files:', error);
  process.exit(1);
}