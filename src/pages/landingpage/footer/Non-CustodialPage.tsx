import { LegalLayout } from "../../../components/LegalLayout";

export default function NonCustodialPage() {
  return (
    <LegalLayout title="Non-Custodial Agreement">
      <p className="text-lg mb-6">
        Lux PH is strictly a reporting and interface layer. We do not maintain
        custody of assets.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">You Are Your Own Bank</h3>
      <p>
        By using Lux PH, you acknowledge that you are responsible for the
        security of your private keys. Lux PH has no technical access to your
        wallet; therefore, we cannot recover funds, reset passwords, or reverse
        transactions on your behalf.
      </p>
      <h3 className="text-xl font-bold mt-8 mb-4">Our Commitment</h3>
      <p>
        We promise that the Lux PH dashboard will never request your mnemonic
        phrases or private keys. If a prompt asks for these, it is not our
        official software.
      </p>
    </LegalLayout>
  );
}
