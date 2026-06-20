import { Component, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <!-- Setup State -->
      <div class="glass-panel login-box" *ngIf="!isReady()">
        <h1>Zero Trust E2EE</h1>
        <p class="subtitle">No passwords. Just mathematics.</p>
        
        <div class="action-group">
          <button (click)="initIdentity()">Generate New Identity</button>
        </div>
        
        <div class="divider">OR</div>
        
        <div class="action-group">
          <textarea 
            placeholder="Paste your exported Private Key (JWK) to restore your account..." 
            [(ngModel)]="importedKeyText"
            rows="4"
          ></textarea>
          <button class="secondary" (click)="importIdentity()">Restore Identity</button>
        </div>
      </div>

      <!-- Main App State -->
      <div class="app-layout" *ngIf="isReady()">
        <!-- Sidebar: Contacts -->
        <div class="glass-panel sidebar">
          <div class="my-identity">
            <small>My Public Key (Share this):</small>
            <input type="text" [value]="myPublicKeyBase64" readonly (click)="copyText(myPublicKeyBase64, 'Public Key')" />
          </div>

          <div class="my-identity" style="margin-top: -10px;">
            <small style="color: #ef4444;">My Private Key (KEEP SECRET):</small>
            <button class="small-btn danger" (click)="exportIdentity()">Copy Private Key to Clipboard</button>
          </div>
          
          <div class="add-contact" style="margin-top: 15px;">
            <input type="text" placeholder="Paste friend's public key..." [(ngModel)]="newContactKey" />
            <button class="small-btn" (click)="addContact()">Add Contact</button>
          </div>

          <div class="contact-list">
            <div class="contact-item" 
                 *ngFor="let contact of contacts()" 
                 [class.active]="activeContact() === contact.pubKey"
                 (click)="activeContact.set(contact.pubKey)">
              👤 {{ contact.pubKey.substring(0, 8) }}...
            </div>
          </div>
        </div>

        <!-- Chat Area -->
        <div class="glass-panel chat-box">
          <div class="header" *ngIf="activeContact()">
            <h2>Chatting with: {{ activeContact()?.substring(0, 8) }}...</h2>
            <span class="status">🔒 E2EE Active</span>
          </div>
          <div class="header" *ngIf="!activeContact()">
            <h2>Select a contact to start chatting</h2>
          </div>
          
          <div class="messages">
            <div class="message" *ngFor="let msg of getActiveMessages()">
              <div class="bubble" [class.self]="msg.isSelf">
                {{ msg.text }}
              </div>
            </div>
          </div>

          <div class="input-area" *ngIf="activeContact()">
            <input 
              type="text" 
              placeholder="Type a secure message..." 
              [(ngModel)]="currentText" 
              (keyup.enter)="sendMessage()"
            />
            <button (click)="sendMessage()">Send</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .app-layout {
      display: flex;
      width: 100%;
      max-width: 1000px;
      height: 85vh;
      gap: 20px;
    }
    .sidebar {
      width: 300px;
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      gap: 1.5rem;
    }
    .my-identity input, textarea {
      width: 100%;
      margin-top: 5px;
      font-size: 0.8rem;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 0.5rem;
      border-radius: 6px;
    }
    .my-identity input { cursor: pointer; }
    .action-group { display: flex; flex-direction: column; gap: 10px; }
    .divider { margin: 10px 0; color: var(--text-muted); font-size: 0.8rem; }
    button.secondary { background: rgba(255,255,255,0.1); }
    button.secondary:hover { background: rgba(255,255,255,0.2); }
    button.small-btn { padding: 0.5rem 1rem; font-size: 0.85rem; }
    button.danger { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; }
    button.danger:hover { background: #ef4444; color: white; }

    .add-contact { display: flex; flex-direction: column; gap: 10px; }
    .contact-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
    .contact-item {
      padding: 10px;
      border-radius: 8px;
      background: rgba(0,0,0,0.2);
      cursor: pointer;
      transition: background 0.2s;
    }
    .contact-item:hover { background: rgba(0,0,0,0.4); }
    .contact-item.active { background: var(--accent); color: white; }
    
    .login-box { padding: 3rem; text-align: center; max-width: 450px; width: 100%; }
    .chat-box { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .header { padding: 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; }
    .status { font-size: 0.85rem; color: #10b981; }
    .messages { flex: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; }
    .bubble {
      max-width: 70%;
      padding: 0.85rem 1.25rem;
      border-radius: 18px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .bubble.self {
      align-self: flex-end;
      background: var(--accent);
      border-color: var(--accent-hover);
      border-bottom-left-radius: 18px;
      border-bottom-right-radius: 4px;
    }
    .input-area { padding: 1.5rem; border-top: 1px solid var(--border); display: flex; gap: 1rem; }
    .input-area input { flex: 1; }
    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.9) translateY(10px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
  `]
})
export class AppComponent {
  isReady = signal(false);
  myPublicKeyBase64 = '';
  importedKeyText = '';
  private myKeyPair!: CryptoKeyPair;
  private myJwkPrivate!: JsonWebKey;
  
  newContactKey = '';
  contacts = signal<{pubKey: string, sharedKey: CryptoKey}[]>([]);
  activeContact = signal<string | null>(null);
  
  allMessages = signal<Record<string, {text: string, isSelf: boolean}[]>>({});
  currentText = '';
  
  private ws: WebSocket | null = null;

  constructor() {
    this.restoreSession();
  }

  // --- Session Persistence (Local Storage) ---
  // ponytail: we use localStorage instead of cookies. 
  // Cookies are sent to the server on every request. Zero Trust = server never sees the key.
  private async restoreSession() {
    const savedJwk = localStorage.getItem('telegram_e2ee_private_key');
    if (savedJwk) {
      try {
        const jwk = JSON.parse(savedJwk);
        await this.loadKeypairFromJwk(jwk);
      } catch (e) {
        console.error("Failed to restore session", e);
      }
    }
  }

  private async loadKeypairFromJwk(jwk: JsonWebKey) {
    this.myJwkPrivate = jwk;
    const privateKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
    );
    
    // Web Crypto API doesn't allow exporting the public key from a private key directly.
    // So we reconstruct the public JWK by stripping the private part ('d')
    const pubJwk = { ...jwk, d: undefined, key_ops: [] };
    const publicKey = await crypto.subtle.importKey(
      'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    );

    this.myKeyPair = { publicKey, privateKey };
    
    const exportedPub = await crypto.subtle.exportKey('raw', this.myKeyPair.publicKey);
    this.myPublicKeyBase64 = this.arrayBufferToBase64(exportedPub);
    
    this.isReady.set(true);
    this.connectWs();
  }

  async initIdentity() {
    this.myKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
    );
    
    const exportedPub = await crypto.subtle.exportKey('raw', this.myKeyPair.publicKey);
    this.myPublicKeyBase64 = this.arrayBufferToBase64(exportedPub);
    
    this.myJwkPrivate = await crypto.subtle.exportKey('jwk', this.myKeyPair.privateKey);
    localStorage.setItem('telegram_e2ee_private_key', JSON.stringify(this.myJwkPrivate));
    
    this.isReady.set(true);
    this.connectWs();
  }

  async importIdentity() {
    if (!this.importedKeyText.trim()) return;
    try {
      const jwk = JSON.parse(this.importedKeyText.trim());
      await this.loadKeypairFromJwk(jwk);
      localStorage.setItem('telegram_e2ee_private_key', JSON.stringify(this.myJwkPrivate));
    } catch (e) {
      alert("Invalid Private Key format.");
    }
  }

  exportIdentity() {
    const json = JSON.stringify(this.myJwkPrivate);
    this.copyText(json, 'Private Key');
  }

  copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  }

  // --- Contacts & Messaging ---
  async addContact() {
    if (!this.newContactKey.trim()) return;
    try {
      const pubKeyBuffer = this.base64ToArrayBuffer(this.newContactKey.trim());
      const contactPubKey = await crypto.subtle.importKey(
        'raw', pubKeyBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []
      );
      
      const sharedKey = await crypto.subtle.deriveKey(
        { name: 'ECDH', public: contactPubKey },
        this.myKeyPair.privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      this.contacts.update(c => [...c, { pubKey: this.newContactKey.trim(), sharedKey }]);
      this.newContactKey = '';
      if (!this.activeContact()) {
        this.activeContact.set(this.contacts()[0].pubKey);
      }
    } catch (e) {
      alert("Invalid public key format.");
    }
  }

  getActiveMessages() {
    const contact = this.activeContact();
    if (!contact) return [];
    return this.allMessages()[contact] || [];
  }

  private connectWs() {
    this.ws = new WebSocket('ws://localhost:3000/ws');
    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // ponytail: prevent the "double message" bug by ignoring our own echoes
        if (msg.sender === this.myPublicKeyBase64) return;
        
        // Check if the message is actually meant for us
        if (msg.receiver !== this.myPublicKeyBase64) return;

        const contact = this.contacts().find(c => c.pubKey === msg.sender);
        if (contact) {
          const decrypted = await this.decrypt(msg.payload, contact.sharedKey);
          if (decrypted) {
            this.addMessageToState(contact.pubKey, decrypted, false);
          }
        } else {
          console.warn("Received message from unknown contact:", msg.sender);
        }
      } catch (e) {
        // Not a JSON message or decryption failed
      }
    };
  }

  async sendMessage() {
    const active = this.activeContact();
    if (!this.currentText.trim() || !this.ws || !active) return;
    
    const text = this.currentText;
    this.currentText = '';
    
    const contact = this.contacts().find(c => c.pubKey === active);
    if (!contact) return;

    this.addMessageToState(active, text, true);
    
    const encrypted = await this.encrypt(text, contact.sharedKey);
    
    // Send with an envelope so the server/clients know who it's routing to/from
    const envelope = {
      sender: this.myPublicKeyBase64,
      receiver: active,
      payload: encrypted
    };
    this.ws.send(JSON.stringify(envelope));
  }

  private addMessageToState(contactPubKey: string, text: string, isSelf: boolean) {
    this.allMessages.update(state => {
      const current = state[contactPubKey] || [];
      return { ...state, [contactPubKey]: [...current, { text, isSelf }] };
    });
  }

  // --- Crypto Helpers ---
  private async encrypt(text: string, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
    
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(cipher), iv.length);
    return this.arrayBufferToBase64(combined.buffer);
  }

  private async decrypt(base64: string, key: CryptoKey): Promise<string | null> {
    const combined = new Uint8Array(this.base64ToArrayBuffer(base64));
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}
