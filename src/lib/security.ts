/**
 * Module de sécurité pour le chiffrement et la protection des données
 */

// Types de données sensibles
export type SensitiveDataType = 
  | 'bank'          // Informations bancaires
  | 'cni'           // Numéros de CNI
  | 'phone'         // Numéros de téléphone
  | 'email'         // Adresses email
  | 'address'       // Adresses complètes
  | 'cash'          // Données de caisse
  | 'credit';       // Informations de crédit

/**
 * Génère une clé de chiffrement à partir d'un mot de passe
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Génère un salt aléatoire
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Chiffre une donnée avec AES-GCM
 */
export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    dataBuffer
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Déchiffre une donnée avec AES-GCM
 */
export async function decryptData(
  encryptedData: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedData);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Convertit un ArrayBuffer en base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convertit une chaîne base64 en ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Stocke une donnée chiffrée dans localStorage
 */
export async function storeEncryptedData(
  key: string,
  data: string,
  password: string
): Promise<void> {
  try {
    // Récupère ou génère un salt
    const saltKey = `${key}_salt`;
    let salt: Uint8Array;
    
    const storedSalt = localStorage.getItem(saltKey);
    if (storedSalt) {
      salt = base64ToArrayBuffer(storedSalt) as unknown as Uint8Array;
    } else {
      salt = generateSalt();
      localStorage.setItem(saltKey, arrayBufferToBase64(salt.buffer));
    }

    // Dérive la clé
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // Chiffre les données
    const { encrypted, iv } = await encryptData(data, derivedKey);

    // Stocke les données chiffrées
    localStorage.setItem(key, JSON.stringify({ encrypted, iv }));
  } catch (error) {
    console.error('Erreur lors du chiffrement:', error);
    throw new Error('Impossible de chiffrer les données');
  }
}

/**
 * Récupère et déchiffre une donnée depuis localStorage
 */
export async function getEncryptedData(
  key: string,
  password: string
): Promise<string | null> {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const { encrypted, iv } = JSON.parse(stored);
    const saltKey = `${key}_salt`;
    const storedSalt = localStorage.getItem(saltKey);
    
    if (!storedSalt) return null;

    const salt = base64ToArrayBuffer(storedSalt) as unknown as Uint8Array;
    const derivedKey = await deriveKeyFromPassword(password, salt);

    return await decryptData(encrypted, iv, derivedKey);
  } catch (error) {
    console.error('Erreur lors du déchiffrement:', error);
    return null;
  }
}

/**
 * Hache un mot de passe avec SHA-256
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Vérifie un mot de passe
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === storedHash;
}

/**
 * Génère un mot de passe fort
 */
export function generateStrongPassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, x => charset[x % charset.length]).join('');
}

/**
 * Valide la force d'un mot de passe
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Le mot de passe doit contenir au moins 8 caractères');

  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Ajoutez des minuscules');
  
  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Ajoutez des majuscules');
  
  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Ajoutez des chiffres');
  
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push('Ajoutez des caractères spéciaux');

  return {
    valid: score >= 4,
    score,
    feedback: feedback.length > 0 ? feedback : ['Mot de passe fort'],
  };
}

/**
 * Nettoie les données sensibles avant export
 */
export function sanitizeDataForExport(data: any, fieldsToMask: string[]): any {
  if (typeof data !== 'object' || data === null) return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForExport(item, fieldsToMask));
  }

  const sanitized = { ...data };
  for (const field of fieldsToMask) {
    if (field in sanitized) {
      sanitized[field] = '***MASQUÉ***';
    }
  }

  return sanitized;
}






