import { Component, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <!-- Login State -->
      <div class="glass-panel login-box" *ngIf="!isLoggedIn()">
        <h1>Zero Trust</h1>
        <p class="subtitle">Enter your secret passphrase to decrypt messages.</p>
        <input 
          type="password" 
          placeholder="Enter passphrase..." 
          [(ngModel)]="passphrase" 
          (keyup.enter)="login()"
        />
        <button (click)="login()">Enter Chat</button>
      </div>

      <!-- Chat State -->
      <div class="glass-panel chat-box" *ngIf="isLoggedIn()">
        <div class="header">
          <h2>Secure Channel</h2>
          <span class="status">🟢 Connected</span>
        </div>
        
        <div class="messages" #scrollMe>
          <div class="message" *ngFor="let msg of messages()">
            <div class="bubble" [class.self]="msg.isSelf">
              {{ msg.text }}
            </div>
          </div>
        </div>

        <div class="input-area">
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
  `,
  styles: [`
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .login-box {
      padding: 3rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: 100%;
      max-width: 400px;
    }
    .login-box h1 {
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .subtitle { color: var(--text-muted); font-size: 0.9rem; }
    .chat-box {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 800px;
      height: 80vh;
      overflow: hidden;
    }
    .header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .status { font-size: 0.85rem; color: #10b981; }
    .messages {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .message { display: flex; flex-direction: column; }
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
    .input-area {
      padding: 1.5rem;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 1rem;
    }
    .input-area input { flex: 1; }
    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.9) translateY(10px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
  `]
})
export class AppComponent {
  isLoggedIn = signal(false);
  messages = signal<{text: string, isSelf: boolean}[]>([]);
  
  passphrase = '';
  currentText = '';
  
  private ws: WebSocket | null = null;
  private cryptoKey: CryptoKey | null = null;

  async login() {
    if (!this.passphrase.trim()) return;
    
    // ponytail: derive a simple AES key using SHA-256 of the passphrase for MVP.
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(this.passphrase));
    this.cryptoKey = await crypto.subtle.importKey(
      'raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']
    );
    
    this.isLoggedIn.set(true);
    this.connectWs();
  }

  private connectWs() {
    this.ws = new WebSocket('ws://localhost:3000/ws');
    this.ws.onmessage = async (event) => {
      try {
        const decrypted = await this.decrypt(event.data);
        if (decrypted) {
          this.messages.update(m => [...m, { text: decrypted, isSelf: false }]);
        }
      } catch (e) {
        console.error("Failed to decrypt message. Wrong key?");
      }
    };
  }

  async sendMessage() {
    if (!this.currentText.trim() || !this.ws || !this.cryptoKey) return;
    
    const text = this.currentText;
    this.currentText = '';
    this.messages.update(m => [...m, { text, isSelf: true }]);
    
    const encrypted = await this.encrypt(text);
    this.ws.send(encrypted);
  }

  // --- E2EE Helpers ---
  private async encrypt(text: string): Promise<string> {
    if (!this.cryptoKey) throw new Error("No key");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, this.cryptoKey, enc.encode(text)
    );
    
    // Combine IV + Cipher and Base64 encode
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(cipher), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  private async decrypt(base64: string): Promise<string | null> {
    if (!this.cryptoKey) return null;
    const binary = atob(base64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
    
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, this.cryptoKey, cipher
      );
      return new TextDecoder().decode(plain);
    } catch {
      return null; // intentionally ignore messages meant for others
    }
  }
}
