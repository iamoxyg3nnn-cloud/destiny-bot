import type { Metadata } from "next";
import { CommandsBrowser } from "./CommandsBrowser";
import { PageHeading } from "../components";

export const metadata: Metadata = {
  title: "Commands · destiny",
  description: "Every slash command Destiny answers to, with embed scripting and server variables.",
};

export default function CommandsPage() {
  return (
    <main id="main" className="page-main">
      <section className="commands-page">
        <div className="commands-header">
          <PageHeading
            eyebrow="Reference"
            title="Every command destiny answers to"
            description="14 available for everyone, 8 for server staff. Explore commands below or browse the panel embed scripting guide."
          />
        </div>
        <CommandsBrowser />
      </section>
    </main>
  );
}
