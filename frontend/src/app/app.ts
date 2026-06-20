import { Component, signal } from '@angular/core';
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
        <p class="subtitle">Generating your secure identity...</p>
        <button (click)="initIdentity()">Generate My Keypair</button>
      </div>

      <!-- Main App State -->
      <div class="app-layout" *ngIf="isReady()">
        <!-- Sidebar: Contacts -->
        <div class="glass-panel sidebar">
          <div class="my-identity">
            <small>My Public Key (Share this):</small>
            <input type="text" [value]="myPublicKeyBase64" readonly (click)="copyMyKey($event)" />
          </div>
          
          <div class="add-contact">
            <input type="text" placeholder="Paste friend's public key..." [(ngModel)]="newContactKey" />
            <button (click)="addContact()">Add Contact</button>
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
    .my-identity input {
      width: 100%;
      margin-top: 5px;
      font-size: 0.8rem;
      cursor: pointer;
    }
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
    
    .login-box { padding: 3rem; text-align: center; max-width: 400px; }
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
  private myKeyPair!: CryptoKeyPair;
  
  newContactKey = '';
  contacts = signal<{pubKey: string, sharedKey: CryptoKey}[]>([]);
  activeContact = signal<string | null>(null);
  
  // Store messages per contact. Format: { contactPubKey: [{text, isSelf}] }
  allMessages = signal<Record<string, {text: string, isSelf: boolean}[]>>({});
  currentText = '';
  
  private ws: WebSocket | null = null;

  async initIdentity() {
    // Generate ECDH keypair for real 1-to-1 E2EE
    this.myKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    
    const exportedPub = await crypto.subtle.exportKey('raw', this.myKeyPair.publicKey);
    this.myPublicKeyBase64 = this.arrayBufferToBase64(exportedPub);
    
    this.isReady.set(true);
    this.connectWs();
  }

  copyMyKey(event: any) {
    event.target.select();
    navigator.clipboard.writeText(this.myPublicKeyBase64);
  }

  async addContact() {
    if (!this.newContactKey.trim()) return;
    try {
      const pubKeyBuffer = this.base64ToArrayBuffer(this.newContactKey.trim());
      const contactPubKey = await crypto.subtle.importKey(
        'raw', pubKeyBuffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []
      );
      
      // Derive shared AES-GCM key
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
      // Broadcast received: Try to decrypt with ALL our contacts' shared keys
      // ponytail: zero-trust routing. The server didn't tell us who sent this. We just try all keys.
      for (const contact of this.contacts()) {
        try {
          const decrypted = await this.decrypt(event.data, contact.sharedKey);
          if (decrypted) {
            this.addMessageToState(contact.pubKey, decrypted, false);
            return; // Successfully decrypted, stop trying other keys
          }
        } catch (e) { /* Wrong key for this contact, ignore */ }
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
    this.ws.send(encrypted);
  }

  private addMessageToState(contactPubKey: string, text: string, isSelf: boolean) {
    this.allMessages.update(state => {
      const current = state[contactPubKey] || [];
      return { ...state, [contactPubKey]: [...current, { text, isSelf }] };
    });
  }

  // --- E2EE Helpers ---
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
