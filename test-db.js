// Database connectivity test
const db = require('./database');
const syllabiModel = require('./models/syllabi');

async function testDatabaseConnection() {
  console.log('Testing database connection...');
  
  try {
    // Test direct database query
    console.log('\n1. Testing direct database query:');
    const pool = db.getPool();
    const { rows } = await pool.query('SELECT course_code, course_name, instructor, semester FROM syllabi LIMIT 3');
    console.log('Raw database results:');
    console.log(rows);
    
    // Test camelization function
    console.log('\n2. Testing camelization:');
    const camelizedRows = db.camelize(rows);
    console.log('Camelized results:');
    console.log(camelizedRows);
    
    // Test syllabi model
    console.log('\n3. Testing syllabi model:');
    const allSyllabi = await syllabiModel.all();
    console.log(`Retrieved ${allSyllabi.length} syllabi records`);
    if (allSyllabi.length > 0) {
      console.log('First record:');
      console.log(allSyllabi[0]);
    }
    
    // Test filtering
    console.log('\n4. Testing search by course code:');
    const filteredSyllabi = await syllabiModel.getByCourseCode('INFO');
    console.log(`Retrieved ${filteredSyllabi.length} syllabi records matching 'INFO'`);
    if (filteredSyllabi.length > 0) {
      console.log('First filtered record:');
      console.log(filteredSyllabi[0]);
    }
    
    console.log('\nDatabase test completed successfully!');
  } catch (error) {
    console.error('Database test failed with error:', error);
  } finally {
    // Close the pool
    const pool = db.getPool();
    await pool.end();
    console.log('Database connection pool closed.');
  }
}

// Run the test
testDatabaseConnection();

