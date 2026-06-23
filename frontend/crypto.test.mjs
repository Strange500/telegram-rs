import assert from 'node:assert';
import { webcrypto } from 'node:crypto';
const { subtle, getRandomValues } = webcrypto;

// Replicate the exact helper functions from app.ts
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encrypt(text, key) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return arrayBufferToBase64(combined.buffer);
}

async function decrypt(base64, key) {
  const combined = new Uint8Array(base64ToArrayBuffer(base64));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

async function runTests() {
  console.log("Running ECDH Zero Trust E2EE Unit Tests...");

  // 1. Generate Alice's Keypair
  const aliceKp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const alicePubRaw = await subtle.exportKey('raw', aliceKp.publicKey);
  const alicePubBase64 = arrayBufferToBase64(alicePubRaw);

  // 2. Generate Bob's Keypair
  const bobKp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const bobPubRaw = await subtle.exportKey('raw', bobKp.publicKey);
  const bobPubBase64 = arrayBufferToBase64(bobPubRaw);

  // 3. Alice adds Bob as contact
  const importedBobPub = await subtle.importKey(
    'raw', base64ToArrayBuffer(bobPubBase64), { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );
  const aliceSharedKey = await subtle.deriveKey(
    { name: 'ECDH', public: importedBobPub }, aliceKp.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  // 4. Bob adds Alice as contact
  const importedAlicePub = await subtle.importKey(
    'raw', base64ToArrayBuffer(alicePubBase64), { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );
  const bobSharedKey = await subtle.deriveKey(
    { name: 'ECDH', public: importedAlicePub }, bobKp.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  // 5. Test Alice sending to Bob
  const secretMessage = "Hello Bob, this is a top secret message!";
  const encryptedPayload = await encrypt(secretMessage, aliceSharedKey);
  
  // Simulate network broadcast
  const envelope = {
    sender: alicePubBase64,
    receiver: bobPubBase64,
    payload: encryptedPayload
  };

  // 6. Test Bob receiving from Alice
  assert.notEqual(envelope.sender, bobPubBase64, "Bob should not ignore this (not an echo)");
  assert.equal(envelope.receiver, bobPubBase64, "Message is meant for Bob");
  
  const decrypted = await decrypt(envelope.payload, bobSharedKey);
  assert.equal(decrypted, secretMessage, "Bob successfully decrypted Alice's message!");

  console.log("✅ All E2EE Tests Passed Successfully!");
}

runTests().catch(console.error);
