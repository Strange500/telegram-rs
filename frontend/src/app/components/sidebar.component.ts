import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="glass-panel sidebar">
      <div class="my-identity">
        <small>My Pseudo:</small>
        <div style="display: flex; gap: 5px; margin-top: 5px;">
          <input type="text" placeholder="Set your name..." [(ngModel)]="myPseudo" />
          <button class="small-btn" (click)="savePseudo()">Save</button>
        </div>
      </div>

      <div class="my-identity">
        <small>My Public Key (Share this):</small>
        <input type="text" [value]="chat.myPublicKeyBase64()" readonly (click)="copyText(chat.myPublicKeyBase64(), 'Public Key')" />
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
             *ngFor="let contact of chat.contacts()" 
             [class.active]="chat.activeContact() === contact.pubKey"
             (click)="chat.activeContact.set(contact.pubKey)">
          👤 {{ chat.getPseudo(contact.pubKey) }}
        </div>
      </div>
    </div>
  `
})
export class SidebarComponent {
  chat = inject(ChatService);
  myPseudo = '';
  newContactKey = '';

  savePseudo() {
    this.chat.setMyPseudo(this.myPseudo);
    alert('Pseudo updated and broadcasted!');
  }

  addContact() {
    this.chat.addContactPubKey(this.newContactKey.trim());
    this.newContactKey = '';
  }

  exportIdentity() {
    const json = JSON.stringify(this.chat.myJwkPrivate());
    this.copyText(json, 'Private Key');
  }

  copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  }
}
