const http = require('http');

const host = 'localhost';
const port = 5000;
const sessionId = '85c9c9e5-5379-47cf-b354-2b8dc13befc7';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-token`,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {data += chunk;});
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  console.log('🧪 Testing video code endpoints\n');
  
  try {
    console.log(`📝 Step 1: Generating code for session ${sessionId.substring(0, 8)}...\n`);
    const generateRes = await makeRequest('POST', `/api/sessions/${sessionId}/video-code`, {});
    
    console.log(`Status: ${generateRes.status}`);
    console.log('Response:', JSON.stringify(generateRes.data, null, 2));
    
    if (generateRes.status === 200) {
      const code = generateRes.data?.data?.code;
      if (code) {
        console.log(`\n✅ Code generated: ${code}`);
        console.log(`\n🔍 Step 2: Verifying code\n`);
        
        const verifyRes = await makeRequest('POST', `/api/sessions/${sessionId}/verify-video-code`, { code });
        console.log(`Status: ${verifyRes.status}`);
        console.log('Response:', JSON.stringify(verifyRes.data, null, 2));
      }
    }
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    console.error('Make sure backend is running on port 5000');
  }
}

test();

