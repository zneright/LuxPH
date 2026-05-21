import { LegalLayout } from "../../../components/LegalLayout";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="text-lg mb-6">
        Last updated: May 2026. At Lux PH, we value the principle of data
        minimalism.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">1. Data Transparency</h3>
      <p>
        Because Lux PH operates as a non-custodial gateway, we do not store
        private keys or sensitive financial credentials. Our platform only logs
        public transaction metadata required for Stellar ledger reconciliation.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">
        2. Blockchain Immutability
      </h3>
      <p>
        Transactions recorded on the Stellar network are immutable. Users
        acknowledge that once a transaction is verified, it cannot be reversed,
        censored, or deleted by Lux PH.
      </p>
    </LegalLayout>
  );
}
