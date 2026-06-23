import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CryptoService {
  async generateKeypair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  }
  
  async importKeypairFromJwk(jwk: JsonWebKey): Promise<CryptoKeyPair> {
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const pubJwk = { ...jwk, d: undefined, key_ops: [] };
    const publicKey = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    return { publicKey, privateKey };
  }
  
  async exportPrivateKey(keyPair: CryptoKeyPair): Promise<JsonWebKey> {
    return crypto.subtle.exportKey('jwk', keyPair.privateKey);
  }

  async exportPublicKeyBase64(keyPair: CryptoKeyPair): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    return this.arrayBufferToBase64(raw);
  }

  async deriveSharedKey(contactPubKeyBase64: string, myPrivateKey: CryptoKey): Promise<CryptoKey> {
    const pubKeyBuffer = this.base64ToArrayBuffer(contactPubKeyBase64);
    const contactPubKey = await crypto.subtle.importKey('raw', pubKeyBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    return crypto.subtle.deriveKey(
      { name: 'ECDH', public: contactPubKey },
      myPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(data: string | Uint8Array, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer as BufferSource);
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(cipher), iv.length);
    return this.arrayBufferToBase64(combined.buffer);
  }

  async decrypt(base64: string, key: CryptoKey): Promise<string | null> {
    try {
      const combined = new Uint8Array(this.base64ToArrayBuffer(base64));
      const iv = combined.slice(0, 12);
      const cipher = combined.slice(12);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      return new TextDecoder().decode(plain);
    } catch { return null; }
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}
