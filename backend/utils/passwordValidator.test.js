const { validatePasswordComplexity, isPasswordValid } = require('./passwordValidator');

describe('Password Validator', () => {
  describe('validatePasswordComplexity', () => {
    test('should reject empty password', () => {
      const errors = validatePasswordComplexity('');
      expect(errors).toContain('Password is required');
    });

    test('should reject null password', () => {
      const errors = validatePasswordComplexity(null);
      expect(errors).toContain('Password is required');
    });

    test('should reject undefined password', () => {
      const errors = validatePasswordComplexity(undefined);
      expect(errors).toContain('Password is required');
    });

    test('should reject password less than 12 characters', () => {
      const errors = validatePasswordComplexity('Short1!');
      expect(errors).toContain('Password must be at least 12 characters long');
    });

    test('should reject password without lowercase letter', () => {
      const errors = validatePasswordComplexity('UPPERCASE123!');
      expect(errors).toContain('Password must contain at least one lowercase letter');
    });

    test('should reject password without uppercase letter', () => {
      const errors = validatePasswordComplexity('lowercase123!');
      expect(errors).toContain('Password must contain at least one uppercase letter');
    });

    test('should reject password without number', () => {
      const errors = validatePasswordComplexity('NoNumbersHere!');
      expect(errors).toContain('Password must contain at least one number');
    });

    test('should reject password without special character', () => {
      const errors = validatePasswordComplexity('NoSpecialChars123');
      expect(errors).toContain('Password must contain at least one special character');
    });

    test('should reject password with common weak pattern', () => {
      const errors = validatePasswordComplexity('password123!');
      expect(errors).toContain('Password contains common weak patterns');
    });

    test('should accept valid password', () => {
      const errors = validatePasswordComplexity('ValidPass123!');
      expect(errors.length).toBe(0);
    });

    test('should accept valid password with all requirements', () => {
      const errors = validatePasswordComplexity('SecureP@ssw0rd2024');
      expect(errors.length).toBe(0);
    });

    test('should return multiple errors for invalid password', () => {
      const errors = validatePasswordComplexity('short');
      expect(errors.length).toBeGreaterThan(1);
      expect(errors).toContain('Password must be at least 12 characters long');
      expect(errors).toContain('Password must contain at least one uppercase letter');
      expect(errors).toContain('Password must contain at least one special character');
    });
  });

  describe('isPasswordValid', () => {
    test('should return false for invalid password', () => {
      expect(isPasswordValid('short')).toBe(false);
    });

    test('should return true for valid password', () => {
      expect(isPasswordValid('ValidPass123!')).toBe(true);
    });

    test('should return false for empty password', () => {
      expect(isPasswordValid('')).toBe(false);
    });
  });
});
