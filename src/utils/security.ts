/**
 * Security Utilities
 * API key encryption, rate limiting, and security helpers
 */

import * as crypto from 'crypto';
import { systemLogger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class SecurityUtils {
  private static encryptionKey: Buffer;

  /**
   * Initialize encryption key from environment
   */
  public static initialize(secret: string): void {
    // Derive a key from the secret
    this.encryptionKey = crypto.scryptSync(secret, 'salt', KEY_LENGTH);
    systemLogger.info('Security utilities initialized');
  }

  /**
   * Encrypt sensitive data (API keys, secrets)
   */
  public static encrypt(text: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine iv + authTag + encrypted
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  public static decrypt(encrypted: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    // Extract iv, authTag, and encrypted data
    const iv = Buffer.from(encrypted.slice(0, IV_LENGTH * 2), 'hex');
    const authTag = Buffer.from(
      encrypted.slice(IV_LENGTH * 2, IV_LENGTH * 2 + AUTH_TAG_LENGTH * 2),
      'hex',
    );
    const encryptedText = encrypted.slice(IV_LENGTH * 2 + AUTH_TAG_LENGTH * 2);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash data (one-way)
   */
  public static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate secure random string
   */
  public static generateRandomString(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate IP address
   */
  public static isValidIP(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Sanitize user input
   */
  public static sanitizeInput(input: string): string {
    return input.replace(/[<>'"]/g, '');
  }

  /**
   * Check if API key is valid format
   */
  public static isValidApiKey(key: string): boolean {
    // Basic validation: should be alphanumeric and at least 32 characters
    return /^[a-zA-Z0-9]{32,}$/.test(key);
  }

  /**
   * Mask sensitive data for logging
   */
  public static maskSensitiveData(data: string, visibleChars = 4): string {
    if (data.length <= visibleChars * 2) {
      return '***';
    }

    const start = data.slice(0, visibleChars);
    const end = data.slice(-visibleChars);
    const masked = '*'.repeat(data.length - visibleChars * 2);

    return `${start}${masked}${end}`;
  }

  /**
   * Verify webhook signature (HMAC)
   */
  public static verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Rate limit helper
   */
  public static createRateLimitKey(ip: string, endpoint: string): string {
    return `rate_limit:${ip}:${endpoint}`;
  }
}
