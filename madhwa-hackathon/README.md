# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

# Super Admin Dashboard & Admin Management

## Overview

The Super Admin module provides centralized management of administrators and employees in the Karmic Canteen application.

### Features

- **Super Admin Dashboard:** Displays an overview of registered users, employees, and administrators.
- **Dashboard Navigation:** Sidebar navigation to Dashboard, Employee Management, and Admin Management.
- **Admin Management:** View and manage existing administrator accounts.
- **Add Admin:** Create new administrator accounts through a secure backend API.
- **Remove Admin:** Remove administrator accounts with a confirmation step.
- **Role-Based Access Control:** Restricts administrative operations to authenticated Super Admin users.
- **Firebase Integration:** Uses Firebase Authentication and Cloud Firestore for user authentication and data management.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, Vite |
| Backend | Node.js, Express.js |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Configuration | Environment Variables |

## Project Structure

```text
madhwa-hackathon/
│
├── frontend/
│   ├── src/
│   │   └── firebase/
│   │       └── config.js
│   └── .env.example
│
├── server/
│   ├── core/
│   │   └── userManager.js
│   ├── devServer.js
│   └── .env.example
│
└── canteen_management_system/
    └── canteen_management_system/
        ├── firebase_config.py
        ├── requirements.txt
        └── .env.example
```

## Environment Configuration

Sensitive credentials and environment-specific configuration are not stored directly in application source files.

### 1. Frontend Configuration

Create a `.env` file inside the `frontend` directory.

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

The frontend reads these variables using `import.meta.env`.

### 2. Node.js Server Configuration

Create a `.env` file inside the `server` directory.

```env
FIREBASE_SERVICE_ACCOUNT_KEY=your_base64_encoded_service_account_json
FIREBASE_PROJECT_ID=your_project_id
PORT=5001
```

The Node.js backend uses Firebase Admin SDK to authenticate and perform privileged administrative operations.

### 3. Python Backend Configuration

Create a `.env` file inside:

`canteen_management_system/canteen_management_system/`

```env
FIREBASE_CREDENTIALS=./path-to-service-account.json
```

The Python backend loads environment variables using `python-dotenv` and reads them through `os.getenv()`.

Install the required dependency:

```bash
pip install -r requirements.txt
```

Ensure `python-dotenv` is included in `requirements.txt`.

## Super Admin Setup

1. Create the Super Admin account in Firebase Authentication.
2. Obtain the account's Firebase Authentication UID.
3. Create a corresponding document in the Firestore `users` collection.
4. Use