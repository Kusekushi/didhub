/**
 * Cryptographic utilities for password hashing.
 * 
 * The backend expects passwords to be pre-hashed with SHA-256 before transmission.
 * This ensures passwords are never sent in clear text over the network.
 * 
 * Flow:
 * 1. Frontend: SHA-256(password) -> 64 hex chars
 * 2. Backend: Argon2id(SHA-256(password)) -> stored hash
 */

/**
 * Hash a password using SHA-256 and return as lowercase hex string.
 * This should be used before sending any password to the backend.
 * 
 * @param password - The plaintext password to hash
 * @returns A 64-character lowercase hex string (SHA-256 hash)
 * 
 * @example
 * ```ts
 * import { hashPassword } from './crypto';
 * 
 * const passwordHash = await hashPassword('mySecretPassword');
 * await api.login({ username: 'user', passwordHash });
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that a string is a valid SHA-256 hash (64 hex characters).
 * 
 * @param hash - The string to validate
 * @returns true if the string is a valid SHA-256 hex hash
 */
export function isValidPasswordHash(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Hash a password for registration/account creation.
 * Validates password requirements before hashing.
 * 
 * @param password - The plaintext password
 * @param minLength - Minimum password length (default: 8)
 * @returns The SHA-256 hash of the password
 * @throws Error if password doesn't meet requirements
 */
export async function hashPasswordForRegistration(
  password: string,
  minLength = 8
): Promise<string> {
  if (password.length < minLength) {
    throw new Error(`Password must be at least ${minLength} characters`);
  }
  return hashPassword(password);
}

/**
 * Create password change request payload.
 * 
 * @param currentPassword - The current password (optional, may be required by admin policies)
 * @param newPassword - The new password
 * @returns Object with hashed password fields ready for API
 */
export async function createPasswordChangePayload(
  newPassword: string,
  currentPassword?: string
): Promise<{
  newPasswordHash: string;
  currentPasswordHash?: string;
}> {
  const payload: {
    newPasswordHash: string;
    currentPasswordHash?: string;
  } = {
    newPasswordHash: await hashPassword(newPassword),
  };
  
  if (currentPassword) {
    payload.currentPasswordHash = await hashPassword(currentPassword);
  }
  
  return payload;
}

/**
 * Create login request payload.
 * 
 * @param username - The username
 * @param password - The plaintext password
 * @returns Object with username and hashed password ready for API
 */
export async function createLoginPayload(
  username: string,
  password: string
): Promise<{ username: string; passwordHash: string }> {
  return {
    username,
    passwordHash: await hashPassword(password),
  };
}

/**
 * Create user registration payload.
 * 
 * @param username - The username
 * @param password - The plaintext password
 * @param options - Optional fields like displayName
 * @returns Object ready for create user API
 */
export async function createRegistrationPayload(
  username: string,
  password: string,
  options?: {
    displayName?: string;
    aboutMe?: string;
  }
): Promise<{
  username: string;
  passwordHash: string;
  display_name?: string;
  about_me?: string;
}> {
  const payload: {
    username: string;
    passwordHash: string;
    display_name?: string;
    about_me?: string;
  } = {
    username,
    passwordHash: await hashPasswordForRegistration(password),
  };
  
  // Only include optional fields if they have non-empty values
  if (options?.displayName?.trim()) {
    payload.display_name = options.displayName;
  }
  if (options?.aboutMe?.trim()) {
    payload.about_me = options.aboutMe;
  }
  
  return payload;
}
