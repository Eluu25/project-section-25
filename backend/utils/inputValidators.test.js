const {
  validateEmail,
  validateEthiopianPhone,
  validateEthiopianNationalId,
  normalizeEmail,
  normalizeEthiopianPhone,
  hasEmoji,
  stripEmojis
} = require('./inputValidators');

describe('Input Validators', () => {
  describe('validateEmail', () => {
    test('should accept valid email', () => {
      const result = validateEmail('test@example.com');
      expect(result.errors).toHaveLength(0);
      expect(result.normalized).toBe('test@example.com');
    });

    test('should reject invalid email format', () => {
      const result = validateEmail('invalid-email');
      expect(result.errors).toContain('A valid email address is required');
    });

    test('should normalize email to lowercase', () => {
      const result = validateEmail('TEST@EXAMPLE.COM');
      expect(result.normalized).toBe('test@example.com');
    });

    test('should reject email with emoji', () => {
      const result = validateEmail('test😀@example.com');
      expect(result.errors).toContain('Emoji characters are not allowed in email');
    });

    test('should require email when required=true', () => {
      const result = validateEmail('', { required: true });
      expect(result.errors).toContain('Email is required');
    });
  });

  describe('validateEthiopianPhone', () => {
    test('should accept valid Ethiopian phone with +251', () => {
      const result = validateEthiopianPhone('+251911234567');
      expect(result.errors).toHaveLength(0);
      expect(result.normalized).toBe('+251911234567');
    });

    test('should accept valid Ethiopian phone starting with 09', () => {
      const result = validateEthiopianPhone('0911234567');
      expect(result.errors).toHaveLength(0);
      expect(result.normalized).toBe('+251911234567');
    });

    test('should accept valid Ethiopian phone with 9 digits', () => {
      const result = validateEthiopianPhone('911234567');
      expect(result.errors).toHaveLength(0);
      expect(result.normalized).toBe('+251911234567');
    });

    test('should reject invalid phone format', () => {
      const result = validateEthiopianPhone('123456');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject phone with non-digit characters', () => {
      const result = validateEthiopianPhone('091-abc-567');
      expect(result.errors).toContain('Phone number can only contain digits and an optional leading +');
    });
  });

  describe('validateEthiopianNationalId', () => {
    test('should accept valid 16-digit Fayda ID', () => {
      const result = validateEthiopianNationalId('1234567890123456', 'National ID');
      expect(result.errors).toHaveLength(0);
      expect(result.normalized).toBe('1234567890123456');
    });

    test('should reject ID with less than 16 digits', () => {
      const result = validateEthiopianNationalId('1234567890', 'National ID');
      expect(result.errors).toContain('Ethiopian National ID must be exactly 16 digits');
    });

    test('should reject ID with emoji', () => {
      const result = validateEthiopianNationalId('123456789012345😀', 'National ID');
      expect(result.errors).toContain('Emoji characters are not allowed in ID number');
    });

    test('should accept valid passport number', () => {
      const result = validateEthiopianNationalId('AB1234567', 'Passport');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('normalizeEmail', () => {
    test('should convert to lowercase', () => {
      expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
    });

    test('should trim whitespace', () => {
      expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com');
    });

    test('should remove emojis', () => {
      expect(normalizeEmail('test😀@example.com')).toBe('test@example.com');
    });
  });

  describe('normalizeEthiopianPhone', () => {
    test('should normalize 09 format to +251', () => {
      expect(normalizeEthiopianPhone('0911234567')).toBe('+251911234567');
    });

    test('should normalize 9-digit format to +251', () => {
      expect(normalizeEthiopianPhone('911234567')).toBe('+251911234567');
    });

    test('should keep +251 format', () => {
      expect(normalizeEthiopianPhone('+251911234567')).toBe('+251911234567');
    });

    test('should return null for invalid format', () => {
      expect(normalizeEthiopianPhone('123456')).toBeNull();
    });
  });

  describe('hasEmoji', () => {
    test('should detect emoji in string', () => {
      expect(hasEmoji('test😀')).toBe(true);
    });

    test('should return false for string without emoji', () => {
      expect(hasEmoji('test123')).toBe(false);
    });

    test('should return false for empty string', () => {
      expect(hasEmoji('')).toBe(false);
    });
  });

  describe('stripEmojis', () => {
    test('should remove emojis from string', () => {
      expect(stripEmojis('test😀123')).toBe('test123');
    });

    test('should handle string without emojis', () => {
      expect(stripEmojis('test123')).toBe('test123');
    });

    test('should handle empty string', () => {
      expect(stripEmojis('')).toBe('');
    });
  });
});
