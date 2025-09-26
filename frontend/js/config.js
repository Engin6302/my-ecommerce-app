// Production API Configuration
// Bu dosya frontend'de API URL'lerini yönetir

const API_CONFIG = {
    // Development (localhost)
    development: {
        API_BASE_URL: 'http://localhost:8000',
        WS_URL: 'ws://localhost:8000'
    },
    
    // Production (App Runner URLs)
    production: {
        API_BASE_URL: 'https://YOUR_BACKEND_APPRUNNER_URL.eu-north-1.awsapprunner.com',
        WS_URL: 'wss://YOUR_BACKEND_APPRUNNER_URL.eu-north-1.awsapprunner.com'
    }
};

// Otomatik environment detection
const ENV = window.location.hostname === 'localhost' ? 'development' : 'production';
const API_BASE_URL = API_CONFIG[ENV].API_BASE_URL;
const WS_URL = API_CONFIG[ENV].WS_URL;

// Export for use in other files
window.API_BASE_URL = API_BASE_URL;
window.WS_URL = WS_URL;

console.log(`🌍 Environment: ${ENV}`);
console.log(`🔗 API Base URL: ${API_BASE_URL}`);