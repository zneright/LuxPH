import { LegalLayout } from "../../../components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p className="text-lg mb-6">
        By accessing Lux PH, you agree to these conditions.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">Usage</h3>
      <p>
        Lux PH provides tools for MSMEs to interact with the Stellar Network. We
        are not a bank, broker, or financial advisor. You use this software at
        your own risk.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">Service Limitations</h3>
      <p>
        While we strive for 99.9% uptime, we rely on the Stellar Horizon API.
        Disruptions in the underlying blockchain network may temporarily affect
        our dashboard's ability to display real-time data.
      </p>
    </LegalLayout>
  );
}
