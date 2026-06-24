import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../services/chat.service';

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="glass-panel chat-box" style="position: relative;">
      <div class="header" *ngIf="chat.activeContact()">
        <h2>Chatting with: {{ chat.getPseudo(chat.activeContact()!) }}</h2>
        <div style="display: flex; gap: 10px; align-items: center;">
          <span class="status">🔒 E2EE Active</span>
          <!-- ponytail: simple button, no heavy icons -->
          <button class="small-btn" (click)="openVerifyModal()">Verify</button>
          <button class="small-btn" (click)="toggleKeyAlert()">Simulate Alert</button>
        </div>
      </div>
      <div class="header" *ngIf="!chat.activeContact()">
        <h2>Select a contact to start chatting</h2>
      </div>

      <!-- Key Change Alert (ponytail: minimum viable inline alert) -->
      <div *ngIf="showKeyAlert" style="background: #ef4444; color: white; padding: 10px; text-align: center; font-size: 0.9em;">
        ⚠️ Security code changed. Tap Verify to confirm identity.
      </div>
      
      <div class="messages">
        <div class="message" *ngFor="let msg of chat.activeMessages()">
          <div class="bubble" [class.self]="msg.isSelf">
            {{ msg.text }}
          </div>
        </div>
      </div>

      <div class="input-area" *ngIf="chat.activeContact()">
        <input 
          type="text" 
          placeholder="Type a secure message..." 
          [(ngModel)]="currentText" 
          (keyup.enter)="sendMessage()"
        />
        <button (click)="sendMessage()">Send</button>
      </div>

      <!-- ponytail: native HTML dialog, no bulky modal abstractions -->
      <dialog id="verifyModal" style="padding: 20px; border: none; border-radius: 8px; background: #222; color: white; max-width: 400px; text-align: center;">
        <h3>Verify Encryption</h3>
        <p style="font-size: 0.9em; color: #aaa;">Compare these emojis with your contact. If they match, your connection is secure.</p>
        
        <!-- Identicon proxy using an external free avatar API -->
        <img [src]="'https://api.dicebear.com/7.x/identicon/svg?seed=' + getSharedFingerprintSeed()" width="100" height="100" style="background: white; border-radius: 8px; margin: 10px 0;"/>
        
        <div style="font-size: 2em; letter-spacing: 5px; background: #000; padding: 15px 10px; border-radius: 8px;">
          <span *ngIf="currentEmojis()">{{ currentEmojis() }}</span>
          <span *ngIf="!currentEmojis()" style="font-size: 0.5em; color: #888;">Calculating...</span>
        </div>
        <div style="margin-top: 15px;">
          <button (click)="closeVerifyModal()">Close</button>
        </div>
      </dialog>
    </div>
  `
})
export class ChatAreaComponent {
  chat = inject(ChatService);
  currentText = '';
  showKeyAlert = false;
  currentEmojis = signal('');

  sendMessage() {
    this.chat.sendMessage(this.currentText);
    this.currentText = '';
  }

  async openVerifyModal() {
    (document.getElementById('verifyModal') as HTMLDialogElement)?.showModal();
    this.currentEmojis.set('');

    // Generate real SHA-256 hash of the complete keys, map to emojis
    const emojis = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🐙','🦑','🦞','🦀','🐡','🐠','🐬','🐳'];
    const raw = this.getSharedFingerprintSeed();
    
    if (raw) {
      const buffer = new TextEncoder().encode(raw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashBytes = new Uint8Array(hashBuffer);
      
      // Use the first 6 bytes of the secure hash to pick 6 emojis
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += emojis[hashBytes[i] % emojis.length];
      }
      this.currentEmojis.set(result);
    }
  }

  closeVerifyModal() {
    (document.getElementById('verifyModal') as HTMLDialogElement)?.close();
    this.showKeyAlert = false; // Reset alert on verify
    this.currentEmojis.set('');
  }

  toggleKeyAlert() {
    this.showKeyAlert = !this.showKeyAlert;
  }

  // Full string for the image seed
  getSharedFingerprintSeed(): string {
    const contactKey = this.chat.activeContact() || '';
    const myKey = this.chat.myPublicKeyBase64() || '';
    return [contactKey, myKey].sort().join('');
  }
}
