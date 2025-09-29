// Demo script to test API endpoints
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function runDemo() {
  console.log('🎬 Starting Guarddog Demo...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health check:', health.data);
    console.log();

    // Register a test user
    console.log('2. Registering test user...');
    try {
      const register = await axios.post(`${API_BASE}/auth/register`, {
        username: 'demo_user',
        email: 'demo@guarddog.com',
        password: 'demo123'
      });
      console.log('✅ User registered:', register.data.user);
      var token = register.data.token;
    } catch (err) {
      console.log('ℹ️  User already exists, attempting login...');
      const login = await axios.post(`${API_BASE}/auth/login`, {
        username: 'demo_user',
        password: 'demo123'
      });
      console.log('✅ User logged in:', login.data.user);
      var token = login.data.token;
    }
    console.log();

    const headers = { Authorization: `Bearer ${token}` };

    // Add test cameras
    console.log('3. Adding test cameras...');
    
    const cameras = [
      {
        name: 'Front Door Ring',
        type: 'ring',
        ip_address: '192.168.1.100',
        port: 443,
        username: 'ring_user'
      },
      {
        name: 'Backyard WiFi Cam',
        type: 'wifi',
        ip_address: '192.168.1.101',
        port: 8080,
        username: 'admin'
      },
      {
        name: 'ESEE Garage Cam',
        type: 'esee',
        ip_address: '192.168.1.102',
        port: 554,
        username: 'esee_user'
      }
    ];

    for (const cam of cameras) {
      try {
        const response = await axios.post(`${API_BASE}/cameras`, cam, { headers });
        console.log(`✅ Added camera: ${response.data.camera.name}`);
      } catch (err) {
        console.log(`ℹ️  Camera ${cam.name} may already exist`);
      }
    }
    console.log();

    // List cameras
    console.log('4. Listing cameras...');
    const cameraList = await axios.get(`${API_BASE}/cameras`, { headers });
    console.log(`✅ Found ${cameraList.data.cameras.length} cameras:`);
    cameraList.data.cameras.forEach(cam => {
      console.log(`   - ${cam.name} (${cam.type}) - ${cam.is_active ? 'Active' : 'Inactive'}`);
    });
    console.log();

    // Simulate AI detection
    console.log('5. Simulating AI detection...');
    if (cameraList.data.cameras.length > 0) {
      const testCamera = cameraList.data.cameras[0];
      const detection = await axios.post(`${API_BASE}/ai/detect`, {
        cameraId: testCamera.id,
        imageData: 'base64_image_data_placeholder'
      }, { headers });
      
      console.log('✅ AI Detection Results:');
      detection.data.detectedObjects.forEach(obj => {
        console.log(`   - ${obj.type}: ${Math.round(obj.confidence * 100)}% confidence`);
      });
    }
    console.log();

    // Get AI stats
    console.log('6. Getting AI statistics...');
    const aiStats = await axios.get(`${API_BASE}/ai/stats?period=7d`, { headers });
    console.log('✅ AI Statistics:', {
      totalCounts: aiStats.data.totalCounts,
      memoryStats: aiStats.data.memoryStats
    });
    console.log();

    // Generate a test report
    console.log('7. Generating daily report...');
    const report = await axios.get(`${API_BASE}/reports/daily-summary?format=json`, { headers });
    console.log('✅ Daily Report Summary:');
    console.log(`   - Total Motion Events: ${report.data.summary.totalMotionEvents}`);
    console.log(`   - People Detected: ${report.data.summary.totalPeople}`);
    console.log(`   - Pets Detected: ${report.data.summary.totalPets}`);
    console.log(`   - Vehicles Detected: ${report.data.summary.totalVehicles}`);
    console.log();

    console.log('🎉 Demo completed successfully!');
    console.log('\n📱 You can now access the web interface at: http://localhost:3000');
    console.log('👤 Login with: demo_user / demo123');

  } catch (error) {
    console.error('❌ Demo failed:', error.response?.data || error.message);
  }
}

// Install axios if not present
try {
  require('axios');
} catch (e) {
  console.log('Installing axios...');
  require('child_process').execSync('npm install axios', { stdio: 'inherit' });
}

runDemo();