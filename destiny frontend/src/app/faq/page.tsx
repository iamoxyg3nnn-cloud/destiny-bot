import type { Metadata } from "next";
import { FaqList, PageHeading } from "../components";

export const metadata: Metadata = {
  title: "FAQ · destiny",
  description: "Setup, anonymity, matching, and what happens when you and your match both agree to reveal.",
};

export default function FAQPage() {
  return (
    <main id="main" className="page-main">
      <section className="faq-page">
        <PageHeading
          eyebrow="Help"
          title="Questions people actually ask"
          description="Setup, what stays hidden, and what happens the moment you both say yes."
        />
        <FaqList />
      </section>
    </main>
  );
}
