import type { Metadata } from "next";
import { SUPPORT_URL } from "../components";

export const metadata: Metadata = {
  title: "Terms of service · destiny",
  description: "Terms for using the destiny Discord bot and website.",
};

export default function TermsPage() {
  return (
    <main id="main" className="page-main">
      <article className="legal-page">
        <header className="legal-heading">
          <h1>Terms of service</h1>
          <p className="updated">Last updated <time>August 2026</time></p>
        </header>
        <div className="legal-copy">
          <p>By adding or using destiny (the &quot;bot&quot;) or this website, you agree to these terms. If you don&apos;t agree, don&apos;t use the bot. destiny is free - there is nothing to buy and no subscription to cancel.</p>
          <h2>Who can use destiny</h2>
          <p>You must meet Discord&apos;s minimum age for your country, which is 13 at the lowest. destiny introduces people to each other, so this one isn&apos;t negotiable: if you are under that age you may not apply, and staff remove applications found to be under it.</p>
          <h2>Acceptable use</h2>
          <ul>
            <li>Don&apos;t use destiny to break Discord&apos;s <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> or <a href="https://discord.com/guidelines" target="_blank" rel="noopener noreferrer">Community Guidelines</a>.</li>
            <li>Don&apos;t harass, threaten, or impersonate anyone through an application, a handle, or a match.</li>
            <li>Don&apos;t use applications to advertise, recruit, scam, or sell anything.</li>
            <li>Don&apos;t try to deanonymise another handle, and don&apos;t publish someone&apos;s identity after a reveal without their agreement.</li>
            <li>Don&apos;t automate, script, or flood commands, and don&apos;t attempt to disrupt the bot or its infrastructure.</li>
            <li>Don&apos;t submit sexual content involving minors, or anything otherwise illegal. That gets reported, not just removed.</li>
          </ul>
          <h2>Anonymity is a feature, not a promise about other people</h2>
          <p>destiny never shows your username, ID, or avatar to another user before you both run <code>/user reveal</code>. What destiny can&apos;t control is what you write. If you put your username, socials, or anything else identifying into an application answer, it goes to the people you match with, and destiny has no way to take it back.</p>
          <h2>Reports and enforcement</h2>
          <p>Anyone can report a handle with <code>/report</code>. Staff review reports and may hide an application, block a handle from matching, or ban a user or server from destiny entirely. Serious cases go to Discord&apos;s Trust &amp; Safety team. Enforcement decisions are ours to make, though you&apos;re welcome to ask about one in the <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">support server</a>.</p>
          <h2>Server admins</h2>
          <p>If you invite destiny, you&apos;re responsible for where the panel goes and who can reach it. Match scope is your call: <code>/setup search scope</code> decides whether your members match inside the server only or across every server destiny is in. Pick it deliberately before you announce the panel.</p>
          <h2>Availability</h2>
          <p>destiny is provided &quot;as is&quot; and &quot;as available&quot;. We may change, suspend, or remove features at any time without notice, and we don&apos;t guarantee uninterrupted or error-free operation. Removing the bot from your server ends the service there immediately.</p>
          <h2>Liability</h2>
          <p>destiny introduces people; it doesn&apos;t vet them. You decide who to talk to, what to share, and whether to meet anyone. To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from use of the bot - including lost data, server disruption, or anything that happens between you and someone you matched with.</p>
          <h2>Changes</h2>
          <p>We may update these terms. Continued use after a change means you accept it, and material changes are announced in the <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">support server</a>. Questions go there too.</p>
        </div>
      </article>
    </main>
  );
}
