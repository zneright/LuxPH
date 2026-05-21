# LuxPH - Stellar-Powered Invoice & Payment Platform for the Philippines

![Stellar](https://img.shields.io/badge/Stellar-Network-black?style=flat-square&logo=stellar)
![React](https://img.shields.io/badge/React-19.2-blue?style=flat-square&logo=react)
![Firebase](https://img.shields.io/badge/Firebase-Backend-yellow?style=flat-square&logo=firebase)

## 🧩 Problem
MSMEs, OFWs, and unbanked Filipinos lack affordable, accessible payment and invoicing solutions that enable seamless cross-border transactions and local settlements. Traditional payment gateways charge high fees (2.5% - 3.5%), require complex KYC processes, and exclude those without access to traditional banking infrastructure. Small merchants struggle to issue professional invoices, track payments, manage cash flow efficiently, and settle instantly to their bank accounts.

## 🌟 Vision
To democratize financial services in the Philippines by leveraging Stellar blockchain technology, enabling millions of Filipinos to access affordable, instant, and borderless payment solutions. LuxPH aims to create an inclusive financial ecosystem where any merchant—regardless of bank account status—can accept payments, issue invoices, and manage their business finances with confidence. Within 3 years, we envision LuxPH as the go-to platform for 100,000+ Filipino merchants to process payments at a fraction of traditional costs.

## 🎯 Purpose
LuxPH was built to empower Filipino merchants and individuals with blockchain-based financial tools that eliminate intermediaries, reduce transaction costs to <0.1%, and provide absolute transparency. The platform bridges the gap between traditional finance and Web3, making it easy for merchants to accept stablecoin payments (USDC, PHPC) and settle instantly to their preferred accounts or wallets.

## 👥 Target Users
- **OFWs (Overseas Filipino Workers)** — Send remittances to family and businesses at lower costs with instant settlement.
- **MSMEs & Solo Entrepreneurs** — Manage invoices, receive payments, track transactions, and access business analytics.
- **Unbanked & Underbanked Filipinos** — Access financial services without a traditional bank account or complex KYC.
- **Freelancers & Service Providers** — Invoice clients globally and receive payments without intermediaries.
- **Small Retailers & Online Sellers** — Accept digital payments, manage inventory, and settle instantly.

## ✨ Features
- **Invoice Management** — Create, track, and manage professional invoices with QR code support and PDF export.
- **Multi-Wallet Support** — Accept payments from Stellar wallet holders (Freighter, Albedo, Stellar Wallets Kit).
- **Stablecoin Payments** — Accept USDC and Philippine Peso (PHPC) stablecoins on Stellar with real-time conversion.
- **Instant Settlements** — Direct peer-to-peer transactions via Soroban smart contracts.
- **Merchant Dashboard** — Real-time analytics, transaction history, revenue tracking, and business metrics.
- **Admin Panel** — Platform management, merchant verification, transaction monitoring, and system configuration.
- **Subscription Tiers** — Free and Pro plans with flexible rate limits and feature access.
- **Cashout Management** — Convert crypto to fiat with integrated anchor support (PDAX integration).
- **Contingency Vault** — Automated ledger-locked savings engine utilizing Time-Bound Claimable Balances on Stellar.
  
![React](https://img.shields.io/badge/React-19.2-blue?style=flat&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8.0-purple?style=flat&logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind-4.3-teal?style=flat&logo=tailwindcss)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-12.38-pink?style=flat&logo=framer)
![Firebase](https://img.shields.io/badge/Firebase-Backend-yellow?style=flat&logo=firebase)
![Stellar](https://img.shields.io/badge/Stellar-Blockchain-black?style=flat&logo=stellar)
## 🛠️ Tech Stack
- **Frontend:** React 19.2, TypeScript 6.0, Vite 8.0, Tailwind CSS 4.3, Framer Motion 12.38
- **Backend:** Firebase (Authentication, Firestore Database, Cloud Functions, Hosting)
- **Blockchain:** Stellar Soroban Smart Contracts, Horizon API, Stellar SDK v15, Soroban Client v1.0
- **Wallets:** Freighter API v6.0, Stellar Wallets Kit v2.2, Albedo v0.1
- **UI & Utilities:** Lucide React, React QR Scanner, jsPDF, html2canvas

---

## 🚀 How to Run Locally

### 1. Clone the repository
```bash
git clone [https://github.com/zneright/LuxPH.git](https://github.com/zneright/LuxPH.git)
cd LuxPH

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Environment Setup Required:**
- Firebase credentials (`.env` file needed)
- Stellar network configuration (Testnet/Mainnet)
- Freighter wallet extension installed

## 🌐 Deployment

### Testnet (Stellar Futurenet)
- **App URL:** [I need to change this - TBD]
- **Network:** Testnet (Futurenet)
- **Status:** Active Testing & Development
- **Horizon URL:** `https://stellar.expert/explorer/testnet/account/GBMODWXWV7G2GWGNRX6I6R54HMUMT2SDKQWOUSAVVETF4W2B7CYIKE7P`
- 📸 **Screenshot — Stellar Expert (Testnet):**
  ![Testnet Screenshot](./screenshots/testnet.png)

### Mainnet (Stellar Public Network)
- **App URL:** [I need to change this - TBD after mainnet deployment]
- **Network:** Mainnet (Public)
- **Status:** Coming Soon - Post-Hackathon Deployment
- **Horizon URL:** `https://horizon.stellar.org`
- 📸 **Screenshot — Stellar Expert (Mainnet):**
  ![Mainnet Screenshot](./screenshots/mainnet.png)

## 🎥 Demo
- 🔗 **Live App (Testnet):** [I need to change this - URL pending]
- 🎬 **Demo Video:** [I need to change this - YouTube/Loom link coming soon]
- 🖼️ **Pitch Deck:** [I need to change this - Google Slides/Canva link coming soon]

## 👨‍💻 Team
| Name | Role | GitHub |
|---|---|---|
| Renz Jericho Buday | Full-Stack Developer & Product Lead | [@zneright](https://github.com/zneright) |

## 📜 License
MIT

---

## 🎯 Stellar Philippines Hackathon 2026 Submission

**Hackathon:** Stellar Philippines Hackathon 2026  
**Theme:** Real-World Financial Solutions for Filipinos  
**Focus Area:** MSME & Commerce Tools, Payments & Remittances, Financial Inclusion  
**Submission Date:** May 23, 2026

### ✅ Submission Checklist
- [x] GitHub Repository with complete documentation
- [x] README.md following required format
- [x] Testnet deployment: https://stellar.expert/explorer/testnet/account/GACS6IIZAARYJ2SGVLVADHDASI2TII2YBZGECCBE6WOSKOB37TXZ4WJV
- [x] Mainnet deployment: https://stellar.expert/explorer/public/tx/af82ef715998918e7edcc1ede9ce2c975b4c64fe33e0f618a6ae2a5ba8bcac9d
- [ ] Testnet screenshot (need to add to `./screenshots/testnet.png`)
- [ ] Mainnet screenshot (need to add to `./screenshots/mainnet.png`)
- [ ] Demo video (2-3 minutes)
- [ ] Pitch deck (max 10 slides)
- [ ] Working MVP with Stellar integration

### 🔗 Additional Resources
- [Stellar Developer Docs](https://developers.stellar.org/)
- [Soroban Docs](https://soroban.stellar.org/)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Router Docs](https://reactrouter.com/)
- [Stellar Expert Explorer](https://stellar.expert/explorer/testnet)

---

**Last Updated:** May 2026  
**Status:** 🔨 Under Development
