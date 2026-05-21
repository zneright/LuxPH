import { LegalLayout } from "../../../components/LegalLayout";

export default function SecurityPage() {
  return (
    <LegalLayout title="Security Framework">
      <p className="text-lg mb-6">
        Securing the financial future of Filipino MSMEs.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">Open Source Integrity</h3>
      <p>
        Our audit reconciliation code is open-source. We encourage community
        peer-review to ensure that our math is sound and our reporting is
        accurate.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">Network Protocols</h3>
      <p>
        We utilize standardized Stellar Horizon endpoints and SHA-256 hashing
        for all invoice-to-transaction mappings. Your business logic is secured
        by the same protocols that protect billions in global value.
      </p>
    </LegalLayout>
  );
}
