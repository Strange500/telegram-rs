import { Injectable, signal, computed, inject } from '@angular/core';
import { CryptoService } from './crypto.service';

export interface Contact { pubKey: string; sharedKey: CryptoKey; }
export interface Message { text: string; isSelf: boolean; }

@Injectable({ providedIn: 'root' })
export class ChatService {
  private crypto = inject(CryptoService);
  
  isReady = signal(false);
  myPublicKeyBase64 = signal('');
  myJwkPrivate = signal<JsonWebKey | null>(null);
  
  contacts = signal<Contact[]>([]);
  activeContact = signal<string | null>(null);
  pseudos = signal<Record<string, string>>({});
  allMessages = signal<Record<string, Message[]>>({});
  
  private myKeyPair: CryptoKeyPair | null = null;
  private ws: WebSocket | null = null;

  activeMessages = computed(() => {
    const contact = this.activeContact();
    if (!contact) return [];
    return this.allMessages()[contact] || [];
  });

  getPseudo(pubKey: string): string {
    const p = this.pseudos();
    return p[pubKey] || pubKey.substring(0, 8) + '...';
  }

  async initIdentity() {
    this.myKeyPair = await this.crypto.generateKeypair();
    await this.finalizeIdentity();
    localStorage.removeItem('telegram_e2ee_contacts');
    this.contacts.set([]);
    this.allMessages.set({});
  }

  async restoreSession() {
    const savedJwk = localStorage.getItem('telegram_e2ee_private_key');
    if (savedJwk) {
      try {
        const jwk = JSON.parse(savedJwk);
        this.myKeyPair = await this.crypto.importKeypairFromJwk(jwk);
        await this.finalizeIdentity();
        
        const savedContacts = localStorage.getItem('telegram_e2ee_contacts');
        if (savedContacts) {
          const pubKeys: string[] = JSON.parse(savedContacts);
          for (const pubKey of pubKeys) await this.addContactPubKey(pubKey);
        }
      } catch (e) { console.error("Restore failed", e); }
    }
  }

  async importIdentity(jwkString: string) {
    if (!jwkString.trim()) return;
    try {
      const jwk = JSON.parse(jwkString.trim());
      this.myKeyPair = await this.crypto.importKeypairFromJwk(jwk);
      await this.finalizeIdentity();
    } catch { alert("Invalid Private Key format."); }
  }

  private async finalizeIdentity() {
    if (!this.myKeyPair) return;
    this.myPublicKeyBase64.set(await this.crypto.exportPublicKeyBase64(this.myKeyPair));
    const jwk = await this.crypto.exportPrivateKey(this.myKeyPair);
    this.myJwkPrivate.set(jwk);
    localStorage.setItem('telegram_e2ee_private_key', JSON.stringify(jwk));
    this.isReady.set(true);
    this.connectWs();
  }

  async addContactPubKey(pubKeyBase64: string) {
    if (!this.myKeyPair) return;
    if (this.contacts().some(c => c.pubKey === pubKeyBase64)) return;
    if (pubKeyBase64 === this.myPublicKeyBase64()) return;
    
    try {
      const sharedKey = await this.crypto.deriveSharedKey(pubKeyBase64, this.myKeyPair.privateKey);
      this.contacts.update(c => {
        const updated = [...c, { pubKey: pubKeyBase64, sharedKey }];
        localStorage.setItem('telegram_e2ee_contacts', JSON.stringify(updated.map(u => u.pubKey)));
        return updated;
      });
      if (!this.activeContact()) this.activeContact.set(pubKeyBase64);
    } catch (e) { console.warn("Invalid key", pubKeyBase64); }
  }

  setMyPseudo(name: string) {
    if (!name.trim() || !this.ws) return;
    const msg = { type: 'pseudo', pubkey: this.myPublicKeyBase64(), pseudo: name.trim() };
    this.ws.send(JSON.stringify(msg));
  }

  async sendMessage(text: string) {
    const active = this.activeContact();
    if (!text.trim() || !this.ws || !active) return;
    
    const contact = this.contacts().find(c => c.pubKey === active);
    if (!contact) return;

    const encrypted = await this.crypto.encrypt(text, contact.sharedKey);
    const envelope = { sender: this.myPublicKeyBase64(), receiver: active, payload: encrypted };
    this.ws.send(JSON.stringify(envelope));
  }

  private connectWs() {
    this.ws = new WebSocket('ws://localhost:3000/ws');
    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pseudo') {
          this.pseudos.update(p => ({ ...p, [msg.pubkey]: msg.pseudo }));
          return;
        }
        
        const myPub = this.myPublicKeyBase64();
        if (msg.sender === myPub) {
          await this.addContactPubKey(msg.receiver);
          const contact = this.contacts().find(c => c.pubKey === msg.receiver);
          if (contact) {
            const decrypted = await this.crypto.decrypt(msg.payload, contact.sharedKey);
            if (decrypted) this.addMessageToState(contact.pubKey, decrypted, true);
          }
          return;
        }
        
        if (msg.receiver === myPub) {
          await this.addContactPubKey(msg.sender);
          const contact = this.contacts().find(c => c.pubKey === msg.sender);
          if (contact) {
            const decrypted = await this.crypto.decrypt(msg.payload, contact.sharedKey);
            if (decrypted) this.addMessageToState(contact.pubKey, decrypted, false);
          }
        }
      } catch (e) {}
    };
  }

  private addMessageToState(contactPubKey: string, text: string, isSelf: boolean) {
    this.allMessages.update(state => {
      const current = state[contactPubKey] || [];
      if (current.some(m => m.text === text && m.isSelf === isSelf)) return state;
      return { ...state, [contactPubKey]: [...current, { text, isSelf }] };
    });
  }
}
