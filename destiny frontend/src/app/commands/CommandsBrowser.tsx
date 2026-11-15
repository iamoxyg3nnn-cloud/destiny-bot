"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const commands = [
  ["/application", "Everyone", "Open your destiny application panel."],
  ["/find match", "Everyone", "Ask destiny to match you with someone."],
  ["/cancel match", "Everyone", "End your match or stop looking for one."],
  ["/user info", "Everyone", "View your own destiny profile."],
  ["/user overview", "Everyone", "Where your account stands: sections, pool, lookups left."],
  ["/user match", "Everyone", "Check where your match stands."],
  ["/user reveal", "Everyone", "Agree to swap real usernames with your match."],
  ["/search scope", "Everyone", "Choose who you can find, and who can find you."],
  ["/partner profile", "Everyone", "View your active match's destiny profile."],
  ["/partner birthday", "Everyone", "View your active match's upcoming birthday."],
  ["/partner time", "Everyone", "View your active match's current local time."],
  ["/report", "Everyone", "Report a user by their destiny id."],
  ["/latency", "Everyone", "Check whether destiny is responding."],
  ["/help", "Everyone", "Show destiny commands and how matching works."],
  ["/invite", "Everyone", "Get the invite link to add Destiny to your server."],
  ["/setup application send", "Manage Server", "Post the destiny application panel in this channel."],
  ["/setup application embed", "Manage Server", "Replace this server's application panel with a custom embed."],
  ["/setup paired-logs channel", "Manage Server", "Set the channel where match logs are posted."],
  ["/setup paired-logs embed", "Manage Server", "Customise the match log embed with a script."],
  ["/setup paired-logs enable", "Manage Server", "Enable posting match logs in this server."],
  ["/setup paired-logs disable", "Manage Server", "Stop posting match logs in this server."],
  ["/setup search scope", "Manage Server", "Set this server's default match pool (Global or Guild Only)."],
  ["/setup overview", "Manage Server", "This server's scope, panel status and applicant count."],
] as const;

const filters = [
  ["all", "All", "23"],
  ["everyone", "Everyone", "15"],
  ["manage", "Manage Server", "8"],
] as const;

const directives = [
  ["$v{color: #hex}", "Sets the embed accent sidebar colour.", "Example: $v{color: #e8a0bf}"],
  ["$v{title: text}", "The primary heading of the embed.", "Example: $v{title: Destiny Matchmaking}"],
  ["$v{description: text}", "Main body text. Supports Discord Markdown, emojis, subtext (-# text), and links.", "Example: $v{description: -# Answer questions to join the queue}"],
  ["$v{author: name && icon && url}", "Author header line. Icon image URL and click URL are optional.", "Example: $v{author: {guild.name} Destiny && {guild.icon} && https://destiny.adore.rest}"],
  ["$v{field: name && value && inline}", "Adds an embed field. Inline accepts true or false (default false).", "Example: $v{field: Status && Looking for matches && true}"],
  ["$v{footer: text && icon}", "Small footer text at the bottom. Footer icon URL is optional.", "Example: $v{footer: Powered by destiny.adore.rest && {guild.icon}}"],
  ["$v{thumbnail: url}", "Corner thumbnail image URL.", "Example: $v{thumbnail: {guild.icon}}"],
  ["$v{image: url}", "Large full-width banner image placed below the embed description.", "Example: $v{image: https://example.com/banner.png}"],
] as const;

const matchVariables = [
  ["{destiny1.alias}", "Destiny handle of the requester (e.g. destiny#0417)"],
  ["{destiny1.mention}", "Discord @mention of the requester (<@1234...>)"],
  ["{destiny1.name}", "Discord username of the requester"],
  ["{destiny1.id}", "Discord user ID of the requester"],
  ["{destiny2.alias}", "Destiny handle of the match partner (e.g. destiny#1183)"],
  ["{destiny2.mention}", "Discord @mention of the match partner"],
  ["{destiny2.name}", "Discord username of the match partner"],
  ["{destiny2.id}", "Discord user ID of the match partner"],
  ["{match.type}", "The event type (Pair, Reveal, Unmatch)"],
] as const;

const serverVariables = [
  ["{guild.name}", "Name of the current server"],
  ["{guild.id}", "Server ID"],
  ["{guild.count}", "Total member count in the server"],
  ["{guild.icon}", "URL of the server's icon"],
  ["{guild.boost_count}", "Number of Nitro boosts on the server"],
  ["{guild.created_at}", "Server creation date (UTC)"],
  ["{user.name}", "Username of the member running the command"],
  ["{user.mention}", "Mention of the member running the command"],
  ["{user.id}", "Discord user ID"],
  ["{user.avatar}", "URL of the user's avatar"],
  ["{user.nick}", "Server nickname (or display name)"],
  ["{user.joined_at}", "Date when the user joined the server"],
  ["{user.join_position}", "Ordinal join order (e.g. 42nd)"],
] as const;

const panelTemplate = "{embed}$v{color: #e8a0bf}$v{author: {guild.name} Matchmaking && {guild.icon}}$v{title: Welcome to Destiny}$v{description: Click the button below to start your anonymous application.\\n\\n-# You will receive a private destiny# handle. Your real username stays hidden until both sides agree to reveal.}$v{field: 1. Apply && Answer profile questions && true}$v{field: 2. Match && Run /find match && true}$v{footer: Powered by destiny.adore.rest}";
const logTemplate = "{embed}$v{color: #e8a0bf}$v{title: New Match Formed!}$v{description: **{destiny1.alias}** has been matched with **{destiny2.alias}**!}$v{field: Event && {match.type} && true}$v{field: Server && {guild.name} && true}$v{footer: Destiny Match Logging && {guild.icon}}";

function MagnifyingGlass() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      className="ui-btn"
      style={{ padding: "0.2rem 0.65rem", fontSize: "0.75rem", height: "auto" }}
      onClick={handleCopy}
      aria-label="Copy script template to clipboard"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function CommandsBrowser() {
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commands.filter(([name, category, description]) => {
      const byCategory = filter === "all" || (filter === "everyone" ? category === "Everyone" : category === "Manage Server");
      const byQuery = !normalized || `${name} ${description} ${category}`.toLowerCase().includes(normalized);
      return byCategory && byQuery;
    });
  }, [filter, query]);
  const visibleCategoryCount = filter === "all" ? 22 : filter === "everyone" ? 14 : 8;

  return (
    <>
      <div className="command-controls">
        <label className="command-search" htmlFor="cmd-search">
          <MagnifyingGlass />
          <input
            ref={searchRef}
            id="cmd-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands (e.g. match, reveal, panel)…"
            aria-label="Search commands"
          />
          <kbd className="command-shortcut" aria-hidden="true">/</kbd>
        </label>
        <div className="command-filters" role="group" aria-label="Filter by who can run it">
          {filters.map(([key, label, count]) => (
            <button key={key} type="button" className="filter-button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              <span>{label}</span><span className="filter-count">{count}</span>
            </button>
          ))}
        </div>
        <p className="command-count" aria-live="polite">{visibleCategoryCount} of 22 commands</p>
      </div>

      {matches.length > 0 ? (
        <ul className="command-grid">
          {matches.map(([name, category, description]) => (
            <li className="command-card" key={name}>
              <div className="command-card-head">
                <code className="command-name">{name}</code>
                <span className="command-category">{category}</span>
              </div>
              <p>{description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="no-commands soft-card" role="status">No commands match “{query}”. Try another search.</div>
      )}

      <section className="embed-docs" aria-labelledby="embed-title">
        <div className="section-heading">
          <p className="section-eyebrow">Server Customization</p>
          <h2 id="embed-title">Embed Scripting &amp; Variables</h2>
        </div>
        <p className="embed-intro">
          Customize your server&apos;s application panel with <code>/setup application embed</code> or match log notifications with <code>/setup paired-logs embed</code>.
        </p>
        <article className="doc-intro-card soft-card">
          <h3>How Embed Scripts Work</h3>
          <p>
            Embed scripts are single-line templates starting with <code className="chip-mono">{"{embed}"}</code> followed by directives in the format <code className="chip-mono">$v&#123;directive: value&#125;</code>. Multi-parameter directives use <code className="chip-mono">&amp;&amp;</code> to separate values. To reset any panel or log embed back to default, submit an empty script.
          </p>
        </article>
        <article className="ref-card soft-card">
          <header className="ref-head">
            <h3>Embed Directives</h3>
            <span className="ref-tag">Syntax &amp; Options</span>
          </header>
          <dl className="ref-list directive-list">
            {directives.map(([syntax, description, example]) => (
              <div className="ref-row directive-row" key={syntax}>
                <dt><code className="ref-key">{syntax}</code></dt>
                <dd className="ref-value">
                  <p>{description}</p>
                  <code className="ref-example">{example}</code>
                </dd>
              </div>
            ))}
          </dl>
        </article>
        <div className="variable-doc-grid">
          <article className="ref-card soft-card">
            <header className="ref-head">
              <h3>Match Variables</h3>
              <span className="ref-tag">/setup paired-logs embed</span>
            </header>
            <dl className="ref-list variable-list">
              {matchVariables.map(([name, description]) => (
                <div className="ref-row variable-row" key={name}>
                  <dt><code className="ref-key">{name}</code></dt>
                  <dd className="ref-value variable-value">{description}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article className="ref-card soft-card">
            <header className="ref-head">
              <h3>Server &amp; User Variables</h3>
              <span className="ref-tag">All Embeds</span>
            </header>
            <dl className="ref-list variable-list">
              {serverVariables.map(([name, description]) => (
                <div className="ref-row variable-row" key={name}>
                  <dt><code className="ref-key">{name}</code></dt>
                  <dd className="ref-value variable-value">{description}</dd>
                </div>
              ))}
            </dl>
          </article>
        </div>
        <div className="template-section">
          <h3>Ready-to-Use Templates</h3>
          <p className="template-intro">Copy and paste these scripts directly into your Discord embed modals.</p>
          <div className="template-card-list">
            <article className="template-card soft-card">
              <div className="template-card-head">
                <span className="ref-tag template-tag">Application Panel Script</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <code>/setup application embed</code>
                  <CopyButton text={panelTemplate} />
                </div>
              </div>
              <pre>{panelTemplate}</pre>
            </article>
            <article className="template-card soft-card">
              <div className="template-card-head">
                <span className="ref-tag template-tag">Match Announcement Log Script</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <code>/setup paired-logs embed</code>
                  <CopyButton text={logTemplate} />
                </div>
              </div>
              <pre>{logTemplate}</pre>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
