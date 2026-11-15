import type { Metadata } from "next";
import { SUPPORT_URL } from "../components";

export const metadata: Metadata = {
  title: "Privacy policy · destiny",
  description: "What Destiny stores, who can see it, and where anonymity ends.",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="page-main">
      <article className="legal-page">
        <header className="legal-heading">
          <h1>Privacy policy</h1>
          <p className="updated">Last updated <time>August 2026</time></p>
        </header>
        <div className="legal-copy">
          <p>destiny introduces people to each other without showing their usernames, so what it stores and who can see it matters more than usual. This page covers both, in that order.</p>
          <h2>What destiny stores</h2>
          <ul>
            <li><strong>Your application.</strong> The answers you submit with <code>/application</code>, and the <code>destiny#</code> handle issued to you.</li>
            <li><strong>The link between them.</strong> Your Discord user ID, stored against your handle so destiny can find your profile when you run a command. This mapping is what makes the anonymity work - and it exists on the server, so it is not anonymous to us.</li>
            <li><strong>Matches.</strong> Which handles were introduced, whether each side confirmed or cancelled, and when.</li>
            <li><strong>Reports.</strong> The reported handle, who reported it, and the reason, kept so staff can review patterns rather than single incidents.</li>
            <li><strong>Server configuration.</strong> Server and channel IDs, your panel channel, and your match scope.</li>
          </ul>
          <h2>What destiny doesn&apos;t store</h2>
          <ul>
            <li>Message content. destiny reads the commands you run and nothing else - it has no message-scraping features.</li>
            <li>Your DMs, including conversations that start after a reveal.</li>
            <li>Payment details. destiny is free.</li>
          </ul>
          <h2>Where the anonymity ends</h2>
          <p>Other users see your handle and your application answers. They never see your username, user ID, or avatar until you both run <code>/user reveal</code> - cancelling reveals nothing. Two limits are worth being blunt about:</p>
          <ul>
            <li><strong>Your answers are yours to control.</strong> Anything identifying that you type into them is visible to the people you match with, and destiny can&apos;t un-send it.</li>
            <li><strong>Staff can see more than users can.</strong> destiny&apos;s developers and moderators can resolve a handle to an account when investigating a report. We don&apos;t do it casually, and we don&apos;t do it on request from another user.</li>
          </ul>
          <h2>Who else gets your data</h2>
          <p>We don&apos;t sell it, and we don&apos;t share it for advertising. It reaches:</p>
          <ul>
            <li><strong>Discord</strong>, because destiny runs on Discord&apos;s API. Their <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a> covers everything on their side.</li>
            <li><strong>Other users you match with</strong>, limited to your handle and answers before a reveal, and your username after one.</li>
            <li><strong>Law enforcement or Discord Trust &amp; Safety</strong>, where we are legally required to respond or a report involves someone&apos;s safety.</li>
          </ul>
          <h2>This website</h2>
          <p>The site is a set of static pages on Cloudflare Pages; it holds no account data and never asks you to log in. It loads Google Analytics and Google AdSense, both gated behind <a href="https://support.google.com/analytics/answer/9976101" target="_blank" rel="noopener noreferrer">Consent Mode v2</a> and defaulted to denied until you choose. Your choice is stored in your browser under <code>adore-consent</code>, shared across the adore.rest network so you aren&apos;t asked twice. Change it any time with the cookie preferences link in the footer.</p>
          <h2>How long it&apos;s kept</h2>
          <p>Your application and handle stay until you ask for deletion. Match records are kept while the match is open and for a short period after it closes. Reports are kept longer, because a report is only useful next to the ones before it. Removing destiny from a server drops that server&apos;s configuration.</p>
          <h2>Deleting your data</h2>
          <p>Ask in the <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">support server</a> and we&apos;ll delete your application, handle, and match history. Say whether you want your data or your whole server&apos;s. Open reports may be retained where deleting them would let the reported behaviour repeat.</p>
          <h2>Children</h2>
          <p>destiny is not for anyone below Discord&apos;s minimum age, which is 13 at the lowest and higher in some countries. Applications found to be under it are removed.</p>
          <h2>Changes</h2>
          <p>We may update this policy, and material changes are announced in the <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">support server</a>. The date at the top always reflects the current version.</p>
        </div>
      </article>
    </main>
  );
}
