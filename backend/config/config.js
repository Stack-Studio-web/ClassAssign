// backend/config/config.js
// OPTIMIZED Configuration for High-Volume Notifications
require('dotenv').config();

class Config {
  constructor() {
    // Secret Key
    this.SECRET_KEY = process.env.SECRET_KEY || 'dev';
    
    // Database Configuration 
    this.DB_HOST = process.env.DB_HOST || 'localhost';
    this.DB_USER = process.env.DB_USER || 'root';
    this.DB_PASSWORD = process.env.DB_PASSWORD;
    this.DB_NAME = process.env.DB_NAME || 'venuedb';
    
    // MongoDB
    this.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/classroom';
    
    // Microsoft OAuth Settings
    this.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
    this.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
    this.MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || '6b8b8296-bdff-4ad8-93ad-84bcbf3842f5';
    
    this.MICROSOFT_AUTH_ENDPOINT = `https://login.microsoftonline.com/${this.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`;
    this.MICROSOFT_TOKEN_ENDPOINT = `https://login.microsoftonline.com/${this.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
    this.MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'User.Read'];
    
    // KCT Custom Notification API Settings
    this.KCT_TEAMS_API_URL = process.env.KCT_TEAMS_API_URL || 'http://10.1.76.76:25001/send/';
    this.KCT_TEAMS_FROM_EMAIL = process.env.KCT_TEAMS_FROM_EMAIL || 'entry@kct.ac.in';
    this.KCT_TEAMS_API_USER = process.env.KCT_TEAMS_API_USER || 'iqube@kct.ac.in';
    this.KCT_TEAMS_API_PASSWORD = process.env.KCT_TEAMS_API_PASSWORD || 'iQube@2025';
    
    // Mail settings
    this.MAIL_SERVER = process.env.MAIL_SERVER || 'smtp.office365.com';
    this.MAIL_PORT = parseInt(process.env.MAIL_PORT || '587');
    this.MAIL_USE_TLS = process.env.MAIL_USE_TLS !== 'false';
    this.MAIL_USERNAME = process.env.MAIL_USERNAME;
    this.MAIL_PASSWORD = process.env.MAIL_PASSWORD;
    this.MAIL_DEFAULT_SENDER = process.env.MAIL_DEFAULT_SENDER;
    
    // ✅ Bull/Celery Configuration - OPTIMIZED for high volume
    this.CELERY_BROKER_URL = process.env.CELERY_BROKER_URL || 'redis://localhost:6379/0';
    this.CELERY_RESULT_BACKEND = process.env.CELERY_RESULT_BACKEND || 'redis://localhost:6379/0';
    
    // ✅ NEW: Bull Worker Performance Settings
    // These can be overridden via environment variables for tuning
    this.BULL_CONCURRENCY = parseInt(process.env.BULL_CONCURRENCY || '10'); // Parallel jobs
    this.BULL_MAX_RETRIES = parseInt(process.env.BULL_MAX_RETRIES || '5'); // Retry attempts
    this.BULL_RETRY_DELAY = parseInt(process.env.BULL_RETRY_DELAY || '3000'); // Initial retry delay (ms)
    this.BULL_JOB_TIMEOUT = parseInt(process.env.BULL_JOB_TIMEOUT || '90000'); // Job timeout (ms)
    
    // ✅ NEW: Rate Limiting Settings
    // Adjust based on your Teams API rate limits
    this.RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20'); // Max requests
    this.RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '1000'); // Time window (ms)
    
    // ✅ NEW: Queue Limiter Settings
    // Prevents queue overload
    this.QUEUE_LIMITER_MAX = parseInt(process.env.QUEUE_LIMITER_MAX || '50'); // Max jobs in limiter
    this.QUEUE_LIMITER_DURATION = parseInt(process.env.QUEUE_LIMITER_DURATION || '10000'); // Duration (ms)
    
    // Sentry Configuration
    this.SENTRY_DSN = process.env.SENTRY_DSN;
  }
}

class DevelopmentConfig extends Config {
  constructor() {
    super();
    this.DEBUG = true;
    this.NODE_ENV = 'development';
    
    // ✅ Development-specific overrides (more verbose logging)
    this.BULL_CONCURRENCY = parseInt(process.env.BULL_CONCURRENCY || '5'); // Lower for dev
  }
}

class TestingConfig extends Config {
  constructor() {
    super();
    this.TESTING = true;
    this.NODE_ENV = 'testing';
    
    // ✅ Testing-specific overrides (faster, less retry)
    this.BULL_CONCURRENCY = parseInt(process.env.BULL_CONCURRENCY || '3');
    this.BULL_MAX_RETRIES = parseInt(process.env.BULL_MAX_RETRIES || '2');
  }
}

class ProductionConfig extends Config {
  constructor() {
    super();
    this.DEBUG = false;
    this.NODE_ENV = 'production';
    
    // ✅ Production-specific overrides (maximum performance)
    this.BULL_CONCURRENCY = parseInt(process.env.BULL_CONCURRENCY || '20'); // Higher for production
    this.BULL_MAX_RETRIES = parseInt(process.env.BULL_MAX_RETRIES || '5');
    this.RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30'); // More aggressive
  }
}

const config = {
  development: new DevelopmentConfig(),
  testing: new TestingConfig(),
  production: new ProductionConfig(),
  default: new DevelopmentConfig()
};

// Export the config based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
const selectedConfig = config[env] || config.default;

// ✅ Log configuration on startup (helpful for debugging)
console.log(`📋 Configuration loaded: ${env}`);
console.log(`⚙️  Bull Settings: ${selectedConfig.BULL_CONCURRENCY} concurrent | ${selectedConfig.BULL_MAX_RETRIES} retries`);
console.log(`⚙️  Rate Limit: ${selectedConfig.RATE_LIMIT_MAX_REQUESTS} req/${selectedConfig.RATE_LIMIT_WINDOW_MS}ms`);

module.exports = selectedConfig;