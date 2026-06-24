# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## UI Security & Privacy Features Tracker

Use this checklist to track the implementation of UI/UX features designed to highlight security, prove encryption, and handle secrets.

### 1. Highlighting Security (Building Trust)
- [ ] **Distinct "Secret" Theme:** Darker theme with subtle green accents or distinct background pattern for secure chats.
- [ ] **Persistent Lock Icons:** Lock icon (`🔒`) next to contact's name in the header and/or inside the "Send" button.
- [ ] **In-Chat System Messages:** Prominent message when a secure session starts (e.g., "🔒 Messages and calls are secured...").
- [ ] **Status Indicators:** "Connection Secure" badge in settings or footer.

### 2. Showing Concrete Proof (Verification)
- [x] **Visual Key Fingerprints:** A "Verify Encryption" modal showing a QR code and a unique identicon/Safety Numbers derived from shared keys.
- [x] **Key Change Alerts:** Inline warning when a contact's security code changes (e.g., due to app reinstall).
- [x] **Security Settings Section:** Links to open-source repositories and third-party security audit reports.

### 3. Handling Secrets (Ephemeral & Protected Content)
- [ ] **Tap-to-Reveal (Spoiler Effect):** Blur or obscure sensitive messages/images, requiring a tap-and-hold to reveal.
- [ ] **Self-Destructing Messages:** Timer icon for chat input, countdown badges on messages, and a "burn" animation upon expiration.
- [ ] **App Switcher Privacy:** Blur the entire `<body>` or overlay a lock screen when the app goes into the background/multitasking menu.
- [ ] **Screenshot Warnings:** System message injected into the chat if a screenshot is detected (or window loses focus).
