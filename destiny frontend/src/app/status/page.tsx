import type { Metadata } from "next";
import { StatusView } from "./StatusView";

export const metadata: Metadata = {
  title: "Status · destiny",
  description: "Live cluster and matchmaking check of the destiny Discord bot.",
};

export default function StatusPage() {
  return (
    <main id="main" className="page-main">
      <StatusView />
    </main>
  );
}
