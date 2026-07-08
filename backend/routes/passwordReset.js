const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { sendProcessEmail } = require('../utils/processEmails');
const { validatePasswordComplexity } = require('../utils/passwordValidator');
const { normalizeEmail } = require('../utils/inputValidators');

/**
 * Password reset mechanism
 * Allows users to reset their password securely via email
 */

// Request password reset
router.post('/request', async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Staff and client accounts share the users table (role = client for portal users)
    db.get(
      `SELECT * FROM users
       WHERE lower(trim(email)) = lower(trim(?))
         AND email IS NOT NULL
         AND trim(email) != ''`,
      [normalizedEmail],
      async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Always return success to prevent email enumeration
      // Even if user doesn't exist, we don't reveal this information
      if (!user) {
        console.log(`[PASSWORD_RESET] Reset requested for non-existent email: ${normalizedEmail}`);
        return res.json({ 
          message: 'If an account with this email exists, a reset link has been sent.' 
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

      // Save reset token to database
      db.run(
        'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
        [resetToken, resetTokenExpiry.toISOString(), user.id],
        (updateErr) => {
          if (updateErr) {
            console.error('Failed to save reset token:', updateErr);
            return res.status(500).json({ error: 'Failed to process reset request' });
          }

          // Send reset email
          const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000/'}/reset-password?token=${resetToken}`;
          
          sendProcessEmail('password_reset', {
            email: user.email,
            resetLink,
            expiresHours: 1
          })
            .then((result) => {
              if (!result?.success) {
                console.error('Failed to send reset email:', result?.error);
              }
              console.log(`[PASSWORD_RESET] Reset token sent to ${user.email} for user ${user.username} (${user.role})`);
              res.json({
                message: 'If an account with this email exists, a reset link has been sent.'
              });
            })
            .catch((err) => {
              console.error('Email send error:', err);
              res.json({
                message: 'If an account with this email exists, a reset link has been sent.'
              });
            });
        }
      );
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify reset token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    db.get(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
      [token, new Date().toISOString()],
      (err, user) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
          return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        res.json({
          valid: true,
          username: user.username,
          role: user.role
        });
      }
    );
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password with token
router.post('/confirm', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const passwordErrors = validatePasswordComplexity(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Password does not meet complexity requirements',
        details: passwordErrors
      });
    }

    // Verify token and update password
    db.get(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
      [token, new Date().toISOString()],
      async (err, user) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
          return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password, clear reset token, and invalidate active sessions
        db.run(
          `UPDATE users
           SET password = ?,
               reset_token = NULL,
               reset_token_expiry = NULL,
               session_id = NULL,
               login_attempts = 0,
               locked_until = NULL
           WHERE id = ?`,
          [hashedPassword, user.id],
          (updateErr) => {
            if (updateErr) {
              console.error('Failed to update password:', updateErr);
              return res.status(500).json({ error: 'Failed to update password' });
            }

            console.log(`[PASSWORD_RESET] Password reset successfully for user ${user.username}`);
            
            // Send confirmation email
            sendProcessEmail('password_reset_success', { email: user.email })
              .then((result) => {
                if (!result?.success) {
                  console.error('Failed to send confirmation email:', result?.error);
                }
              })
              .catch((err) => {
                console.error('Email send error:', err);
              });

            res.json({ message: 'Password reset successfully' });
          }
        );
      }
    );
  } catch (error) {
    console.error('Password reset confirmation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
