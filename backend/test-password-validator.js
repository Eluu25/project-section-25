const { validatePasswordComplexity } = require('./utils/passwordValidator');

console.log('=== Password Validator Tests ===\n');

// Test 1: Short password
console.log('Test 1: Short password (8 chars)');
const result1 = validatePasswordComplexity('Short1!');
console.log('Errors:', result1);
console.log('Expected: Should fail (too short)\n');

// Test 2: No uppercase
console.log('Test 2: No uppercase letter');
const result2 = validatePasswordComplexity('lowercase123!');
console.log('Errors:', result2);
console.log('Expected: Should fail (no uppercase)\n');

// Test 3: No number
console.log('Test 3: No number');
const result3 = validatePasswordComplexity('NoNumbers!');
console.log('Errors:', result3);
console.log('Expected: Should fail (no number)\n');

// Test 4: Valid password
console.log('Test 4: Valid password');
const result4 = validatePasswordComplexity('ValidPass123!');
console.log('Errors:', result4);
console.log('Expected: Should pass (no errors)\n');

console.log('=== Tests Complete ===');