// Test code execution endpoints
const http = require('http');

function makeRequest(language, code) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ code, language });
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/code/execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer test-token' // Add a token to pass auth
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ error: 'Invalid JSON response', raw: responseData });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log('=== Testing Code Execution Endpoints ===\n');

  // Test Python
  console.log('Testing Python...');
  try {
    const pythonCode = `print('Hello from Python!')
print('5 + 3 =', 5 + 3)`;
    const pythonResult = await makeRequest('python', pythonCode);
    console.log('Python Result:', JSON.stringify(pythonResult, null, 2));
  } catch (err) {
    console.error('Python test error:', err.message);
  }
  
  console.log('\n---\n');

  // Test JavaScript
  console.log('Testing JavaScript...');
  try {
    const jsCode = `console.log('Hello from JavaScript!');
console.log('5 + 3 =', 5 + 3);`;
    const jsResult = await makeRequest('javascript', jsCode);
    console.log('JavaScript Result:', JSON.stringify(jsResult, null, 2));
  } catch (err) {
    console.error('JavaScript test error:', err.message);
  }

  console.log('\n---\n');

  // Test Java
  console.log('Testing Java...');
  try {
    const javaCode = `System.out.println("Hello from Java!");
int x = 5, y = 3;
System.out.println("5 + 3 = " + (x + y));`;
    const javaResult = await makeRequest('java', javaCode);
    console.log('Java Result:', JSON.stringify(javaResult, null, 2));
  } catch (err) {
    console.error('Java test error:', err.message);
  }

  console.log('\n---\n');

  // Test C++
  console.log('Testing C++...');
  try {
    const cppCode = `cout << "Hello from C++" << endl;
cout << "5 + 3 = " << (5 + 3) << endl;`;
    const cppResult = await makeRequest('cpp', cppCode);
    console.log('C++ Result:', JSON.stringify(cppResult, null, 2));
  } catch (err) {
    console.error('C++ test error:', err.message);
  }

  console.log('\n=== All Tests Completed ===');
}

test().catch(console.error);
