import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="glass-panel login-box">
      <h1>Zero Trust E2EE</h1>
      <p class="subtitle">No passwords. Just mathematics.</p>
      
      <div class="action-group">
        <button (click)="chat.initIdentity()">Generate New Identity</button>
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
  `
})
export class LoginComponent {
  chat = inject(ChatService);
  importedKeyText = '';

  importIdentity() {
    this.chat.importIdentity(this.importedKeyText);
  }
}
