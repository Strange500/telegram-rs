import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from './services/chat.service';
import { LoginComponent } from './components/login.component';
import { SidebarComponent } from './components/sidebar.component';
import { ChatAreaComponent } from './components/chat-area.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, LoginComponent, SidebarComponent, ChatAreaComponent],
  template: `
    <div class="container">
      <app-login *ngIf="!chat.isReady()"></app-login>
      
      <div class="app-layout" *ngIf="chat.isReady()">
        <app-sidebar></app-sidebar>
        <app-chat-area></app-chat-area>
      </div>
    </div>
  `
})
export class AppComponent {
  chat = inject(ChatService);
  
  constructor() {
    this.chat.restoreSession();
  }
}
