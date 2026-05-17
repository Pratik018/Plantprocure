# Project Summary: PlantProcure Ledger

This document summarizes the current state of the **PlantProcure Ledger** project to help a new AI agent or developer pick up where we left off.

## 🚀 Overview
**PlantProcure Ledger** is a full-stack web application designed to track and manage the lifecycle of plant procurement requests within an organization. It features a multi-stage approval workflow, real-time chat, and admin management.

## 🛠 Tech Stack
- **Frontend:** React (Vite), TypeScript, Tailwind CSS.
- **Animations:** `motion/react` (Framer Motion).
- **Backend/DB:** Firebase (Firestore & Authentication).
- **Icons:** `lucide-react`.
- **Utilities:** `date-fns` (dates), `fuse.js` (fuzzy search), `jspdf` (PDF export), `xlsx` (Excel export).

## 🔑 Key Features
1.  **Procurement Lifecycle:** Tracks items from `REQUESTED` -> `APPROVED` -> `PURCHASED` -> `NOTE_APPROVED` -> `PAYMENT_DONE`.
2.  **Authentication:** Supports Google Login and Email/Password registration.
3.  **Role-Based Access (RBAC):**
    -   Users must be in the `authorized_users` collection to access the app.
    -   Admins (identified by email or role) have extra tabs for review and site settings.
4.  **Admin Review & Settings:** 
    -   Admins approve/reject requests.
    -   Access requests system for new users.
    -   Toggle for "Auto-Approve Requests".
5.  **Real-time Chat:** Integrated support chat between users and admins.
6.  **Data Export:** Export ledger and tracking data to PDF/Excel for reporting.

## 🔧 Critical Configuration & Fixes
-   **Firebase Auth Authorized Domains:** If using a custom domain (e.g., `kusmundaplant.site`), you **MUST** add it to the "Authorized Domains" list in the Firebase Console (Authentication > Settings > Authorized Domains). We added an alert in `firebase.ts` to guide the user when this happens.
-   **Custom Domain Setup:** 
    -   Connected via Namecheap and Cloudflare.
    -   Cloudflare handles SSL (Full/Strict mode) and DNS.
    -   DNS Records: `A` record pointing to Firebase IP and `TXT` for verification.
-   **Firestore Error Handling:** Use the `handleFirestoreError` function in `src/lib/firebase.ts` for consistent error logging and debugging.

## 📂 File Structure
-   `src/App.tsx`: Main application logic, UI tabs, and routing.
-   `src/lib/firebase.ts`: Firebase initialization and auth helpers.
-   `src/types.ts`: TypeScript interfaces for `Procurement`, `Message`, etc.
-   `src/index.css`: Global styles and Tailwind imports.

## 📝 Next Steps / TODOs
-   Improve vendor management (CRUD for vendor list).
-   Add more detailed audit logs for status changes.
-   Implement file attachments for invoices/receipts.
