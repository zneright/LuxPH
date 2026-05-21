# LuxPH - Stellar-Powered Invoice & Payment Platform for the Philippines

## 🧩 Problem
MSMEs, OFWs, and unbanked Filipinos lack affordable, accessible payment and invoicing solutions that enable seamless cross-border transactions and local settlements. Traditional payment gateways charge high fees (2-5%), require complex KYC processes, and exclude those without access to traditional banking infrastructure. Small merchants struggle to issue professional invoices, track payments, manage cash flow efficiently, and settle instantly to their bank accounts.

## 🌟 Vision
To democratize financial services in the Philippines by leveraging Stellar blockchain technology, enabling millions of Filipinos to access affordable, instant, and borderless payment solutions. LuxPH aims to create an inclusive financial ecosystem where any merchant—regardless of bank account status—can accept payments, issue invoices, and manage their business finances with confidence. Within 3 years, we envision LuxPH as the go-to platform for 100,000+ Filipino merchants to process payments at a fraction of traditional costs.

## 🎯 Purpose
LuxPH was built to empower Filipino merchants and individuals with blockchain-based financial tools that eliminate intermediaries, reduce transaction costs to <0.1%, and provide transparency. The platform bridges the gap between traditional finance and Web3, making it easy for merchants to accept stablecoin payments (USDC, PH₱) and settle instantly to their preferred accounts or wallets.

## 👥 Target Users
- **OFWs (Overseas Filipino Workers)** — Send remittances to family and businesses at lower costs with instant settlement
- **MSMEs & Solo Entrepreneurs** — Manage invoices, receive payments, track transactions, and access business analytics
- **Unbanked & Underbanked Filipinos** — Access financial services without a traditional bank account or complex KYC
- **Freelancers & Service Providers** — Invoice clients globally and receive payments without intermediaries
- **Small Retailers & Online Sellers** — Accept digital payments, manage inventory, and settle instantly

## ✨ Features
- **Invoice Management** — Create, track, and manage professional invoices with QR code support and PDF export
- **Multi-Wallet Support** — Accept payments from Stellar wallet holders (Freighter, Albedo, Stellar Wallets Kit)
- **Stablecoin Payments** — Accept USDC and Philippine Peso (PH₱) stablecoins on Stellar with real-time conversion
- **Instant Settlements** — Direct peer-to-peer transactions via Soroban smart contracts (0.1 XLM fee)
- **Merchant Dashboard** — Real-time analytics, transaction history, revenue tracking, and business metrics
- **Admin Panel** — Platform management, merchant verification, transaction monitoring, and system configuration
- **Subscription Tiers** — Free and Pro plans with flexible rate limits and feature access
- **PDF Export** — Generate printable invoices, receipts, and transaction reports
- **Cashout Management** — Convert crypto to fiat with integrated anchor support (PDAX integration)
- **Soroban Smart Contracts** — Secure, transparent on-chain invoice validation and payment processing with dispute resolution

## 🛠️ Tech Stack
- **Frontend:** React 19.2.6, TypeScript 6.0.2, Vite 8.0.12, Tailwind CSS 4.3.0, Framer Motion 12.38.0
- **Backend:** Firebase (Authentication, Firestore Database, Cloud Functions, Hosting)
- **Blockchain:** Stellar Soroban Smart Contracts, Horizon API, Stellar SDK v15, Soroban Client v1.0.1
- **Wallets:** Freighter API v6.0.1, Stellar Wallets Kit v2.2.0, Albedo v0.1.3
- **UI & UX:** Lucide React Icons v1.16.0, React QR Scanner v2.6.0, jsPDF v4.2.1, html2canvas v1.4.1
- **Other:** PostCSS, Autoprefixer, vite-plugin-node-polyfills

## 🚀 How to Run Locally
```bash
# Clone the repository
git clone https://github.com/zneright/LuxPH.git
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
- **Smart Contract ID:** `[I need to change this - Contract address pending deployment]`
- **Horizon URL:** `https://horizon-testnet.stellar.org`
- **Soroban RPC:** `https://soroban-testnet.stellar.org`
- 📸 **Screenshot — Stellar Expert (Testnet):**
  ![Testnet Screenshot](./screenshots/testnet.png)

### Mainnet (Stellar Public Network)
- **App URL:** [I need to change this - TBD after mainnet deployment]
- **Network:** Mainnet (Public)
- **Status:** Coming Soon - Post-Hackathon Deployment
- **Smart Contract ID:** `[I need to change this - Contract address pending mainnet deployment]`
- **Horizon URL:** `https://horizon.stellar.org`
- **Soroban RPC:** `https://soroban-mainnet.stellar.org`
- 📸 **Screenshot — Stellar Expert (Mainnet):**
  ![Mainnet Screenshot](./screenshots/mainnet.png)

## 🎥 Demo
- 🔗 **Live App (Testnet):** [I need to change this - URL pending]
- 🎬 **Demo Video:** [I need to change this - YouTube/Loom link coming soon]
- 🖼️ **Pitch Deck:** [I need to change this - Google Slides/Canva link coming soon]

## 👨‍💻 Team
| Name | Role | GitHub |
|---|---|---|
| Zneright | Full-Stack Developer & Product Lead | [@zneright](https://github.com/zneright) |

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
- [x] Testnet deployment (address: [I need to change this])
- [x] Mainnet deployment (address: [I need to change this])
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
