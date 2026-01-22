// backend/config/config.js
// Exact Node.js equivalent of Python's config.py
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
    
    // Bull/Celery Configuration (Queue System)
    // Use the Docker-friendly URL from the .env file if it exists,
    // otherwise, fall back to the local IP for local development.
    this.CELERY_BROKER_URL = process.env.CELERY_BROKER_URL || 'redis://localhost:6379/0';
    this.CELERY_RESULT_BACKEND = process.env.CELERY_RESULT_BACKEND || 'redis://localhost:6379/0';
    
    // Sentry Configuration
    this.SENTRY_DSN = process.env.SENTRY_DSN;
  }
}

class DevelopmentConfig extends Config {
  constructor() {
    super();
    this.DEBUG = true;
    this.NODE_ENV = 'development';
  }
}

class TestingConfig extends Config {
  constructor() {
    super();
    this.TESTING = true;
    this.NODE_ENV = 'testing';
  }
}

class ProductionConfig extends Config {
  constructor() {
    super();
    this.DEBUG = false;
    this.NODE_ENV = 'production';
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
module.exports = config[env] || config.default;