import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../services/chat.service';

@Component({
  selector: 'app-chat-area',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="glass-panel chat-box">
      <div class="header" *ngIf="chat.activeContact()">
        <h2>Chatting with: {{ chat.getPseudo(chat.activeContact()!) }}</h2>
        <span class="status">🔒 E2EE Active</span>
      </div>
      <div class="header" *ngIf="!chat.activeContact()">
        <h2>Select a contact to start chatting</h2>
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
    </div>
  `
})
export class ChatAreaComponent {
  chat = inject(ChatService);
  currentText = '';

  sendMessage() {
    this.chat.sendMessage(this.currentText);
    this.currentText = '';
  }
}
