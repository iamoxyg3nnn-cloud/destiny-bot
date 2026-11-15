"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1568212916304617557&permissions=274877990912&scope=bot%20applications.commands";
export const SUPPORT_URL = "https://discord.gg/cupi";

const navLinks = [
  ["Commands", "/commands"],
  ["FAQ", "/faq"],
  ["Status", "/status"],
] as const;

function DiscordIcon() {
  return (
    <svg className="discord-icon" viewBox="0 -28.5 256 256" fill="currentColor" aria-hidden="true">
      <path d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.09c-12.645 0-23.015-11.805-23.015-26.18s10.148-26.2 23.015-26.2 23.236 11.804 23.015 26.2c0 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.866 0 23.236 11.804 23.015 26.2 0 14.375-10.149 26.18-23.015 26.18Z" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const close = () => setOpen(false);

  return (
    <header className="site-nav">
      <nav className="nav-inner" aria-label="Primary">
        <Link href="/" className="nav-logo" aria-label="destiny home" onClick={close}>
          <img src="/brand/destiny-mark-128.png?v=3" alt="" width="32" height="32" className="nav-mark" />
          <span translate="no">destiny</span>
        </Link>
        <div className="nav-pill">
          {navLinks.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="nav-link"
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="nav-link">
            Support
          </a>
        </div>
        <div className="nav-actions">
          <button
            type="button"
            className="nav-menu-btn"
            aria-expanded={open}
            aria-controls="nav-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <a href={INVITE_URL} target="_blank" rel="noopener noreferrer" className="nav-invite">
            <DiscordIcon />
            <span>Invite destiny</span>
          </a>
        </div>
      </nav>
      <div id="nav-mobile-menu" className={`nav-mobile-menu${open ? " is-open" : ""}`} hidden={!open}>
        <div className="nav-mobile-inner">
          {navLinks.map(([label, href]) => (
            <Link key={href} href={href} className="nav-mobile-link" onClick={close}>
              {label}
            </Link>
          ))}
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="nav-mobile-link" onClick={close}>
            Support
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const openPreferences = () => window.dispatchEvent(new Event("show-cookie-preferences"));
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand-column">
          <Link href="/" className="footer-brand" aria-label="destiny home">
            <img src="/brand/destiny-mark-128.png?v=3" alt="" width="36" height="36" />
            <span translate="no">destiny</span>
          </Link>
          <p className="copyright">Copyright © 2026 destiny.adore.rest. All rights reserved.</p>
        </div>
        <div>
          <p className="footer-heading">Bot</p>
          <ul className="footer-links">
            <li><a href={INVITE_URL} target="_blank" rel="noopener noreferrer">Invite</a></li>
            <li><Link href="/commands">Commands</Link></li>
            <li><Link href="/faq">FAQ</Link></li>
            <li><Link href="/status">Status</Link></li>
            <li><a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Support Server</a></li>
            <li><a href="https://adore.rest" target="_blank" rel="noopener noreferrer">adore.rest</a></li>
          </ul>
        </div>
        <div>
          <p className="footer-heading">Legal</p>
          <ul className="footer-links">
            <li><Link href="/terms">Terms of Service</Link></li>
            <li><Link href="/privacy">Privacy Policy</Link></li>
            <li><button type="button" onClick={openPreferences}>Cookie preferences</button></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!localStorage.getItem("adore-consent"));
    } catch {
      setVisible(true);
    }
    const show = () => setVisible(true);
    window.addEventListener("show-cookie-preferences", show);
    return () => window.removeEventListener("show-cookie-preferences", show);
  }, []);

  const decide = (accepted: boolean) => {
    try {
      localStorage.setItem(
        "adore-consent",
        JSON.stringify({ analytics: accepted, ads: accepted, ts: Date.now() }),
      );
    } catch {
      // The banner still closes if browser storage is disabled.
    }
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <div className="consent-wrap" role="dialog" aria-modal="false" aria-labelledby="consent-title" aria-describedby="consent-desc">
      <div className="consent-island">
        <div className="consent-copy">
          <p id="consent-title" className="consent-title">Cookies</p>
          <p id="consent-desc" className="consent-desc">
            destiny&apos;s website uses analytics and ads cookies. Accept them, reject them, or read the{" "}
            <Link href="/privacy" className="link-soft">privacy policy</Link> first.
          </p>
        </div>
        <div className="consent-actions">
          <button type="button" className="ui-btn consent-btn" onClick={() => decide(false)}>Reject</button>
          <button type="button" className="ui-btn ui-btn-solid consent-btn" onClick={() => decide(true)}>Accept all</button>
        </div>
      </div>
    </div>
  );
}

export const FAQ_ITEMS = [
  {
    question: "What is destiny?",
    answer:
      "destiny is an anonymous matchmaking bot for Discord. You fill in one application, get a private destiny# handle, and chat with compatible people without showing your real username until both of you agree to swap.",
  },
  {
    question: "How do I start?",
    answer:
      "Run /application to apply and get your private handle. Once your application is complete, run /find match to find someone compatible.",
  },
  {
    question: "Is it really anonymous?",
    answer:
      "Yes. Everyone sees your destiny# handle and your application answers - never your username, ID, or avatar. Usernames swap only after both people run /user reveal.",
  },
  {
    question: "What if I change my mind?",
    answer:
      "Run /cancel match. The match closes, nothing is revealed, and you can look again straight away.",
  },
  {
    question: "What is match scope?",
    answer:
      "Scope decides who you can be matched with. Admins set the server default with /setup search scope - inside the server only, or across every server destiny is in. You can narrow it for yourself with /search scope.",
  },
  {
    question: "What does destiny store?",
    answer:
      "Your application answers, your handle, and your match history. destiny does not read or store messages outside the commands you run. Ask in the support server to have your data deleted.",
  },
  {
    question: "Where do I get help?",
    answer:
      "Join the support server linked in the footer. To flag someone, use /report and staff will review the handle.",
  },
] as const;

export function HeartMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  );
}

export function FaqList({ defaults = false }: { defaults?: boolean }) {
  return (
    <div className="faq-list">
      {FAQ_ITEMS.map((item, index) => (
        <details className="faq-item" key={item.question} open={defaults && index < 2}>
          <summary className="faq-question">
            <span className="faq-marker"><HeartMark /></span>
            <span>{item.question}</span>
          </summary>
          <div className="faq-answer"><p>{item.answer}</p></div>
        </details>
      ))}
    </div>
  );
}

export function FeatureIcon({ index }: { index: number }) {
  const common = {
    className: "feature-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  return (
    <svg {...common}>
      {index === 0 && <><path d="M2 10.5C2 7.5 4.8 5 8.5 5c2.2 0 3.1 1.2 3.5 1.2S13.3 5 15.5 5c3.7 0 6.5 2.5 6.5 5.5 0 4.2-3.8 8.5-7 8.5s-3-1.2-4.2-1.2S7.2 19 5 19C3 19 2 15 2 10.5Z"/><path d="M6.5 11c.8-.8 2.2-.8 3 0s-.5 1.5-1.5 1.5-1.5-.7-1.5-1.5ZM14.5 11c.8-.8 2.2-.8 3 0s-.5 1.5-1.5 1.5-1.5-.7-1.5-1.5Z"/></>}
      {index === 1 && <><path d="M19.5 13.5c1.5-1.5 2.5-3.2 2.5-5A4.5 4.5 0 0 0 17.5 4c-1.8 0-3.1.9-3.9 2.2C12.8 4.9 11.5 4 9.7 4a4.5 4.5 0 0 0-4.5 4.5c0 2.2 1.2 4.1 2.8 5.5l4 4.5 7.5-5Z"/><path d="M12 6.5V9m-1.2-1.2h2.4" strokeWidth="1.4"/></>}
      {index === 2 && <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 13h5m-5 3h4"/><circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" stroke="none"/></>}
      {index === 3 && <><path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="2.5" fill="var(--color-surface)"/><circle cx="16" cy="17" r="2.5" fill="var(--color-surface)"/><path d="m7.2 7 .7.7 1.4-1.4m5.9 10.7.7.7 1.4-1.4" strokeWidth="1.3"/></>}
      {index === 4 && <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v5m0 3h.01" strokeWidth="2"/></>}
      {index === 5 && <><circle cx="12" cy="12" r="2.8"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m6.6 7.6 3.4 2.8m7.4-2.8-3.4 2.8m-7.4 5.8 3.4-2.8m7.4 2.8-3.4-2.8"/></>}
    </svg>
  );
}

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </header>
  );
}

export function MatchScene() {
  const [live, setLive] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setLive(true), 1300);
    return () => window.clearTimeout(timer);
  }, [replayKey]);

  const replay = () => {
    setLive(false);
    setReplayKey((key) => key + 1);
  };

  return (
    <div className="hero-scene">
      <div className={`mascot-slot${live ? " scene-live" : ""}`} aria-hidden="true">
        <img className="mascot" src="/brand/destiny-mark-256.png?v=3" alt="" width="256" height="256" />
      </div>
      <div className={`match-card soft-card${live ? " scene-live scene-matched" : ""}`}>
        <p className="scene-label">what a match looks like</p>
        <div className="match-row">
          <p className="handle">destiny#0417</p>
          <svg className="match-arc" viewBox="0 0 320 78" fill="none" aria-hidden="true">
            <path d="M8 64C74 6 246 6 312 64" />
            <path d="M8 64C74 6 246 6 312 64" strokeDasharray="430" strokeDashoffset={live ? "0" : "430"} />
          </svg>
          <p className="handle">destiny#1183</p>
        </div>
      </div>
      <button className="scene-replay" type="button" onClick={replay} disabled={!live}>
        <svg viewBox="0 0 22 11" fill="none" aria-hidden="true">
          <path d="M2 8.4C5.6 1.6 13.2 1.6 16.6 6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor" transform="translate(18 6.9) scale(0.26) translate(-12 -12.1)" />
        </svg>
        watch it again
      </button>
    </div>
  );
}
