# 🛡️ Architecture & Spécifications : Messagerie Sécurisée E2EE

Ce document décrit l'architecture, les spécifications techniques et le modèle de sécurité pour le développement d'une application de messagerie instantanée sécurisée de bout en bout (End-to-End Encrypted - E2EE). 

Il est conçu pour servir de référence (Single Source of Truth) aux développeurs ainsi qu'aux agents IA (LLMs) qui interviendront sur le projet.

---

## 1. 🎯 Vision du Projet & Périmètre (MVP)

L'objectif est de créer une application de messagerie "Zero Trust", où le serveur ne peut en aucun cas lire les messages ou compromettre les identités. Le serveur agit uniquement comme un relais aveugle et un espace de stockage chiffré.

**Périmètre du Produit Minimum Viable (MVP) :**
- **Conversations 1-to-1 uniquement** (pas de groupes pour le MVP afin de simplifier la cryptographie).
- **Synchronisation temps réel** via WebSockets.
- **Historique persistant** sur le serveur (les messages restent chiffrés) pour permettre la récupération sur un nouvel appareil.
- **Ajout de contacts** via recherche de pseudo ou scan de QR code physique.

---

## 2. 🛠️ Stack Technique

L'architecture est découpée entre un backend ultra-performant et un frontend réactif moderne.

| Composant | Technologie | Raison du choix |
| :--- | :--- | :--- |
| **Backend API** | Rust avec framework Axum | Performances maximales, gestion native et performante des WebSockets (écosystème Tokio), sécurité mémoire. |
| **Base de données** | PostgreSQL (via SQLx) | Robuste, standard de l'industrie, requêtes asynchrones en Rust. |
| **Frontend** | Angular | Cadre structuré idéal pour une application complexe avec forte gestion d'état. |
| **Gestion d'état UI** | Angular Signals | Approche réactive moderne et native pour des performances optimales côté client. |
| **Temps Réel** | WebSockets | Communication bidirectionnelle instantanée pour le chat. |

---

## 3. 🔒 Modèle de Sécurité et Cryptographie

L'application repose sur un modèle où l'utilisateur est le seul maître de ses données. Il n'y a **pas de mot de passe**, l'authentification et le chiffrement se basent sur des paires de clés cryptographiques.

### A. Gestion des Clés & Authentification ("Passwordless")
- **Génération (Inscription) :** Le client Angular génère localement une *Seed Phrase* (phrase mnémonique standard type BIP39). Il en dérive une clé publique et une clé privée. Seule la clé publique est envoyée au serveur.
- **Authentification (ZKP Challenge) :** Lors de la connexion, l'utilisateur importe sa Seed Phrase. Le client recalcule la clé privée. Pour prouver son identité au serveur sans révéler de secret, le client signe un défi (challenge cryptographique) envoyé par le backend.
- **Stockage de Session :** La clé privée est conservée en mémoire vive ou via `IndexedDB` côté navigateur le temps de la session pour chiffrer/déchiffrer à la volée.