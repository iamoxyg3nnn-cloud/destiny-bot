const root = document.getElementById('app');
const app = document.body.dataset.app;
const customEmoji = (name) => `<img class="destiny-emoji destiny-emoji-${name}" src="/assets/${name}.png" alt="" aria-hidden="true" loading="lazy">`;
const destinyMarkMarkup = () => '<img class="destiny-brand-icon" src="/assets/destiny-mark.svg" alt="" aria-hidden="true" fetchpriority="high">';
document.querySelectorAll('.brand-mark').forEach((mark) => { mark.innerHTML = destinyMarkMarkup(); });
const favicon = document.querySelector('[data-destiny-favicon]');
if (favicon) {
  favicon.href = '/assets/destiny-mark.svg';
  favicon.type = 'image/svg+xml';
}
const state = { session: null, csrf: '', guilds: [], guild: null, settings: null, channels: [], page: 'overview', overview: null, ownerServers: null, ownerServersLoading: false, ownerServerSearch: '', ownerServerOffset: 0, selectedServer: null, serverDetailsLoading: false, audit: null, auditLoading: false, auditOffset: 0, reports: null, reportsLoading: false, reportOffset: 0, selectedReport: null, reportLoading: false, verifications: null, verificationsLoading: false, verificationOffset: 0, selectedVerification: null, verificationLoading: false, userLookup: null, userLookupLoading: false, rooms: null, roomsLoading: false, roomOffset: 0, operators: null, operatorsLoading: false, busy: false };
const icon = {
  overview: '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
  start: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="9"/></svg>',
  portal: '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></svg>',
  match: '<svg viewBox="0 0 24 24"><path d="m4 7 5 5-5 5M20 7l-5 5 5 5M9 12h6"/></svg>',
  safety: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></svg>',
  servers: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>',
  monitoring: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 1 18 0"/><path d="m12 12 5-4M5 18h14"/><circle cx="12" cy="12" r="1"/></svg>',
  audit: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  reports: '<svg viewBox="0 0 24 24"><path d="M5 21V4a1 1 0 0 1 1-1h12l-2 5 2 5H6"/></svg>',
  verification: '<svg viewBox="0 0 24 24"><path d="m12 3 2.2 1.5 2.7-.1 1.2 2.4 2.4 1.2-.1 2.7L22 13l-1.5 2.2.1 2.7-2.4 1.2-1.2 2.4-2.7-.1L12 23l-2.2-1.5-2.7.1-1.2-2.4-2.4-1.2.1-2.7L2 13l1.5-2.2-.1-2.7 2.4-1.2L7 4.5l2.7.1z"/><path d="m8.5 12.5 2.2 2.2 4.8-5"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 8M18 14a5 5 0 0 1 4 5v2"/></svg>',
  rooms: '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></svg>',
  operators: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8v6M16 11h6"/></svg>',
};
const themeKey = 'destiny-dashboard-theme';
const operatorCapabilityLabels = {
  'platform.health.read': 'Platform health',
  'platform.servers.read': 'Connected servers',
  'platform.audit.read': 'Platform audit history',
  'safety.reports.review': 'Safety report review',
  'safety.verification.review': 'Verification review',
  'users.status.lookup': 'User status lookup',
  'conversations.metadata.read': 'Conversation metadata',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function getTheme() {
  try { return localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#e9f7f3' : '#181b1a');
  try { localStorage.setItem(themeKey, theme); } catch { /* The selected theme still applies for this page. */ }
  const button = document.getElementById('theme-toggle');
  if (button) {
    const next = theme === 'light' ? 'dark' : 'light';
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.title = `Switch to ${next} theme`;
    button.innerHTML = theme === 'light'
      ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>'
      : '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
  }
}

function themeButton() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  return `<button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to ${next} theme" title="Switch to ${next} theme"></button>`;
}

document.documentElement.dataset.theme = getTheme();

async function request(url, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw Object.assign(new Error(data.error || 'The request could not be completed.'), { status: response.status });
  return { response, data };
}

function showToast(message, error = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 4500);
}

function loginPage(message = '') {
  const owner = app === 'owner';
  document.title = owner ? 'Destiny · Platform operations' : 'Destiny · Discord communities, closer';
  root.innerHTML = `<main class="public-site">
    <header class="public-nav" id="top">
      <a class="brand" href="#top" aria-label="Destiny home"><span class="brand-mark" aria-hidden="true">${destinyMarkMarkup()}</span><span>Destiny<small>For Discord communities</small></span></a>
      <button class="public-menu" id="public-menu" type="button" aria-expanded="false" aria-controls="public-links" aria-label="Open navigation"><span></span><span></span></button>
      <nav class="public-links" id="public-links" aria-label="Main navigation"><a href="#features">What Destiny does</a><a href="#how-it-works">Getting started</a><a href="#safety">Safety</a><a class="public-dashboard-link" href="/auth/login">Dashboard <span aria-hidden="true">↗</span></a>${themeButton()}</nav>
    </header>
    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="landing-copy"><span class="landing-eyebrow"><i aria-hidden="true"></i> A little more human, together</span>
        <h1 id="landing-title">Good conversations start with a <em>hello.</em></h1>
        <p>Destiny helps Discord communities make new connections at their own pace—with thoughtful matching, clear boundaries, and the tools moderators need to keep things welcoming.</p>
        <div class="landing-actions"><a class="primary landing-primary" href="/auth/login">Open your dashboard <span aria-hidden="true">→</span></a><a class="landing-secondary" href="#features">Explore Destiny <span aria-hidden="true">↓</span></a></div>
        ${message ? `<p class="login-note" role="status">${escapeHtml(message)}</p>` : ''}
        <div class="landing-assurance"><span class="landing-check" aria-hidden="true">✓</span><span>Sign in with Discord<small>Your server access is checked when you sign in.</small></span></div>
      </div>
      <div class="landing-art" aria-label="Illustration of Destiny's community dashboard" role="img"><img src="/assets/destiny-hero.svg" alt="A constellation links community, matchmaking, and safety panels" /><div class="art-caption"><span class="art-live-dot"></span><span>Made for communities that care</span><span class="art-caption-mark">D</span></div></div>
      <a class="scroll-cue" href="#features" aria-label="Scroll to Destiny features"><span></span> Discover what you can do</a>
    </section>
    <section class="trust-strip" aria-label="Destiny principles"><div><span class="trust-symbol">01</span><span><strong>Community-led</strong><small>You choose how matching works</small></span></div><div><span class="trust-symbol">02</span><span><strong>Private by default</strong><small>Server access stays scoped</small></span></div><div><span class="trust-symbol">03</span><span><strong>Safety built in</strong><small>Controls for members and moderators</small></span></div></section>
    <section class="feature-section" id="features" aria-labelledby="features-title"><div class="section-heading"><div><span class="landing-eyebrow">A calmer way to connect</span><h2 id="features-title">Give your community room to meet.</h2></div><p>Useful controls for the people running a server, and a considerate path for the people in it.</p></div>
      <div class="feature-grid">
        <article class="feature-card feature-card-mint"><img src="/assets/feature-portal.svg" alt="" loading="lazy"><div class="feature-copy"><span class="feature-index">01 ${customEmoji('destiny_profile')} · SET UP</span><h3>A clear place to begin</h3><p>Choose a chat portal and give members one easy starting point for Destiny.</p><a href="/auth/login" aria-label="Set up your chat portal">Set up your portal <span aria-hidden="true">↗</span></a></div></article>
        <article class="feature-card feature-card-lilac"><img src="/assets/feature-match.svg" alt="" loading="lazy"><div class="feature-copy"><span class="feature-index">02 ${customEmoji('destiny_match')} · CONNECT</span><h3>Matching on your terms</h3><p>Choose whether your server joins cross-community matchmaking.</p><a href="/auth/login" aria-label="Manage matchmaking settings">Explore matchmaking <span aria-hidden="true">↗</span></a></div></article>
        <article class="feature-card feature-card-peach" id="safety"><img src="/assets/feature-safety.svg" alt="" loading="lazy"><div class="feature-copy"><span class="feature-index">03 ${customEmoji('destiny_shield')} · LOOK OUT</span><h3>Boundaries come first</h3><p>Members can block and report. Authorized reviewers can resolve safety reports.</p><a href="/auth/login" aria-label="Open Destiny safety tools">See safety tools <span aria-hidden="true">↗</span></a></div></article>
        <article class="feature-card feature-card-lilac"><img src="/assets/feature-anonymous.svg" alt="" loading="lazy"><div class="feature-copy"><span class="feature-index">04 ${customEmoji('destiny_match')} · SAY HELLO</span><h3>Talk before you reveal</h3><p>Meet through an anonymous conversation, then decide together what comes next.</p><a href="#how-it-works">How it works <span aria-hidden="true">↘</span></a></div></article>
        <article class="feature-card feature-card-peach"><img src="/assets/feature-profile.svg" alt="" loading="lazy"><div class="feature-copy"><span class="feature-index">05 ${customEmoji('destiny_profile')} · BE YOURSELF</span><h3>A profile that feels like you</h3><p>Share the interests, languages, and details you want to use for matching.</p><a href="#how-it-works">How it works <span aria-hidden="true">↘</span></a></div></article>
        <article class="feature-card feature-card-mint"><img src="/assets/feature-reveal.svg" alt="" loading="lazy"><div class="feature-copy"><span class="feature-index">06 ${customEmoji('destiny_spark')} · CHOOSE TO SHARE</span><h3>Reveals need two yeses</h3><p>Personal profile details appear only when both people choose to share them.</p><a href="#how-it-works">How it works <span aria-hidden="true">↘</span></a></div></article>
      </div>
    </section>
    <section class="how-section" id="how-it-works" aria-labelledby="how-title"><div class="how-art"><img src="/assets/feature-community.svg" alt="Connected community spaces orbiting a central Destiny server" loading="lazy"><span class="how-orbit how-orbit-one"></span><span class="how-orbit how-orbit-two"></span></div><div class="how-copy"><span class="landing-eyebrow">Three small steps</span><h2 id="how-title">From server to first hello.</h2><ol class="steps-list"><li><span>1</span><div><strong>Sign in with Discord</strong><p>Destiny checks which servers you can manage.</p></div></li><li><span>2</span><div><strong>Choose your community</strong><p>Open the server where Destiny is installed.</p></div></li><li><span>3</span><div><strong>Set the tone</strong><p>Pick a portal channel and review your matching settings.</p></div></li></ol><a class="primary" href="/auth/login">Get started <span aria-hidden="true">→</span></a></div></section>
    <section class="landing-cta"><div class="cta-spark" aria-hidden="true">${customEmoji('destiny_spark')}</div><span class="landing-eyebrow">Your next hello is closer</span><h2>Make space for good people.</h2><p>Bring a little more connection to the Discord community you already love.</p><a class="primary landing-primary" href="/auth/login">Continue with Discord <span aria-hidden="true">→</span></a></section>
    <footer class="landing-footer"><a class="brand" href="#top"><span class="brand-mark" aria-hidden="true">${destinyMarkMarkup()}</span><span>Destiny<small>For Discord communities</small></span></a><span class="footer-note">A more welcoming way to find your people.</span><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">Getting started</a><a href="/auth/login">Dashboard</a></nav><span class="footer-copy">© ${new Date().getFullYear()} Destiny</span></footer>
  </main>`;
  setTheme(getTheme());
  document.getElementById('theme-toggle')?.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
  const menu = document.getElementById('public-menu');
  const links = document.getElementById('public-links');
  menu?.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') === 'true';
    menu.setAttribute('aria-expanded', String(!expanded));
    menu.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
    links?.classList.toggle('is-open', !expanded);
  });
  links?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', 'Open navigation');
    links.classList.remove('is-open');
  }));
}

function userName() { return state.session?.user?.global_name || state.session?.user?.username || 'Discord user'; }
function avatarUrl() {
  const user = state.session?.user;
  return user?.avatar ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64` : '';
}

function renderLayout(content, title, description = '') {
  const owner = app === 'owner';
  const items = owner
    ? [['overview', 'Global overview'], ['servers', 'Servers'], ['users', 'Users'], ['rooms', 'Active conversations'], ['reports', 'Safety and reports'], ['verification', 'Verification'], ['monitoring', 'System monitoring'], ['audit', 'Audit history'], ...(state.session?.rootOwner ? [['operators', 'Platform operators']] : [])]
    : [['overview', 'Overview'], ['start', 'Getting started'], ['portal', 'Chat portal'], ['match', 'Matchmaking']];
  const selected = state.guild?.id || '';
  const guildPicker = owner ? '' : `<div class="server-picker"><label for="guild-picker">Current server</label><select id="guild-picker" aria-label="Select a Discord server">${state.guilds.map((guild) => `<option value="${escapeHtml(guild.id)}" ${guild.id === selected ? 'selected' : ''}>${escapeHtml(guild.name)}${guild.configurable ? '' : ' · Destiny not connected'}</option>`).join('')}</select></div>`;
  const avatar = avatarUrl();
  root.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${destinyMarkMarkup()}</span><span>Destiny<small>${owner ? 'Platform' : 'Server settings'}</small></span></a>${guildPicker}<nav aria-label="${owner ? 'Platform navigation' : 'Server navigation'}"><div class="nav-label">${owner ? 'Operations' : 'Manage'}</div><ul class="nav-list">${items.map(([id, label]) => `<li><button class="nav-link" data-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon[id]}</span><span>${label}</span></button></li>`).join('')}</ul></nav><div class="sidebar-bottom"><div class="identity"><div class="avatar">${avatar ? `<img alt="" src="${escapeHtml(avatar)}">` : escapeHtml(userName().slice(0, 1).toUpperCase())}</div><div class="identity-copy"><strong>${escapeHtml(userName())}</strong><span>${owner ? 'Platform owner' : 'Discord account'}</span></div><button id="signout" class="quiet signout" type="button">Sign out</button></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb"><span>Destiny</span><span class="breadcrumb-separator" aria-hidden="true">/</span>${escapeHtml(title)}</div><div class="topbar-right"><span class="workspace-label">${owner ? 'Platform workspace' : 'Server workspace'}</span>${themeButton()}</div></header><section class="content"><div class="page-heading"><div><div class="eyebrow">${owner ? 'Platform operations' : escapeHtml(state.guild?.name || 'Server')}</div><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>${state.guild && !owner ? `<span class="status-pill ok"><span class="status-dot"></span>Destiny connected</span>` : ''}</div>${content}</section></main></div><div id="toast" class="toast" role="status" aria-live="polite" hidden></div>`;
  setTheme(getTheme());
  root.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => { state.page = button.dataset.page; renderCurrent(); }));
  document.getElementById('theme-toggle')?.addEventListener('click', () => setTheme(getTheme() === 'light' ? 'dark' : 'light'));
  document.getElementById('signout')?.addEventListener('click', signOut);
  document.getElementById('guild-picker')?.addEventListener('change', async (event) => {
    state.guild = null;
    state.settings = null;
    renderLayout('<div class="skeleton" aria-label="Loading server settings"></div>', 'Server');
    await loadGuild(event.target.value);
  });
}

function metric(label, value, detail = '') {
  return `<article class="panel"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div>${detail ? `<div class="metric-detail">${escapeHtml(detail)}</div>` : ''}</article>`;
}

function channelOptions(selected, allowNone, currentLabel) {
  const first = allowNone ? '<option value="">Not configured</option>' : '<option value="">Choose a channel</option>';
  return `${first}${state.channels.map((channel) => `<option value="${escapeHtml(channel.id)}" ${channel.id === selected ? 'selected' : ''}># ${escapeHtml(channel.name)}</option>`).join('')}`;
}

function overviewPage() {
  const setting = state.settings || {};
  const channelName = (id) => id ? state.channels.find((channel) => channel.id === id)?.name || 'Configured channel' : 'Not configured';
  const warning = !setting.matchChannelId ? '<div class="callout info">Choose a portal channel to give members a place to start matchmaking.</div>' : '';
  const portal = state.channels.find((channel) => channel.id === setting.matchChannelId);
  const log = state.channels.find((channel) => channel.id === setting.modLogChannelId);
  const channelStatus = (channel, needsEmbed = false) => !channel ? 'Not configured' : channel.canView && channel.canSend && (!needsEmbed || channel.canEmbed) ? 'Ready' : 'Needs bot permissions';
  return `<div class="grid metric-grid">${metric('Server members', state.guild?.memberCount == null ? 'Unavailable' : Number(state.guild.memberCount).toLocaleString(), 'Reported by the connected Discord bot')}${metric('Matchmaking portal', setting.matchChannelId ? `# ${channelName(setting.matchChannelId)}` : 'Not set')}${metric('Cross-server matching', setting.crossServerEnabled === false ? 'Off' : 'On', 'Current saved server preference')}</div>${warning}<div class="grid two-col"><section class="panel"><h2 class="section-title">Server setup</h2><p class="section-description">Current settings and live bot access for this Discord server.</p><ul class="activity-list"><li><strong>Portal channel</strong><span>${escapeHtml(channelName(setting.matchChannelId))} · ${escapeHtml(channelStatus(portal, true))}</span></li><li><strong>Private moderation log</strong><span>${escapeHtml(channelName(setting.modLogChannelId))} · ${escapeHtml(channelStatus(log))}</span></li><li><strong>Cross-server participation</strong><span>${setting.crossServerEnabled === false ? 'Disabled' : 'Enabled'}</span></li><li><strong>Last saved</strong><span>${setting.updatedAt ? new Date(setting.updatedAt).toLocaleString() : 'No saved settings yet'}</span></li></ul></section><section class="panel"><h2 class="section-title">Privacy boundary</h2><p class="section-description">Server settings control where Destiny posts and whether this server participates in shared matchmaking.</p><div class="callout info">Anonymous conversations, user profiles, and global safety records are private to Destiny’s platform. They are not available in this server workspace.</div><button class="secondary" type="button" data-page="portal">Configure portal</button></section></div>${auditPanel()}`;
}

function auditPanel() {
  const entries = state.audit?.logs || [];
  const rollbackable = (entry) => {
    const keyByAction = {
      DASHBOARD_SET_PORTAL_CHANNEL: 'matchChannelId',
      DASHBOARD_SET_MODLOG_CHANNEL: 'modLogChannelId',
      DASHBOARD_SET_CROSS_SERVER: 'crossServerEnabled',
    };
    const key = keyByAction[entry.action];
    if (!key || entry.changes?.key !== key || entry.changes.previous === entry.changes.next) return false;
    const current = key === 'crossServerEnabled' ? state.settings?.crossServerEnabled !== false : state.settings?.[key] ?? null;
    return current === entry.changes.next;
  };
  const content = state.auditLoading
    ? '<div class="skeleton" aria-label="Loading audit history"></div>'
    : state.audit?.error
      ? `<div class="error-box">${escapeHtml(state.audit.error)} <button class="secondary" id="retry-audit" type="button">Retry</button></div>`
      : entries.length === 0
        ? '<div class="empty">No audit events are available for this server yet.</div>'
        : `<div class="table-scroll"><table><thead><tr><th scope="col">Event</th><th scope="col">Actor</th><th scope="col">Change</th><th scope="col">When</th><th scope="col">Action</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${escapeHtml(entry.action)}</td><td><code>${escapeHtml(entry.adminId)}</code></td><td><code>${escapeHtml(JSON.stringify(entry.changes || {}))}</code></td><td>${escapeHtml(new Date(entry.createdAt).toLocaleString())}</td><td>${rollbackable(entry) ? `<button class="secondary" type="button" data-rollback-audit="${escapeHtml(entry.id)}">Undo</button>` : '—'}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Most recent events for this server</span><div><button class="secondary" id="previous-audit" type="button" ${state.auditOffset === 0 ? 'disabled' : ''}>Previous</button><button class="secondary" id="next-audit" type="button" ${state.audit?.nextOffset == null ? 'disabled' : ''}>Next</button></div></div>`;
  return `<section class="panel"><h2 class="section-title">Configuration history</h2><p class="section-description">Guild-scoped setup changes recorded by Destiny. IP addresses and unrelated platform events are not shown here.</p>${content}</section>`;
}

function portalPage() {
  const setting = state.settings || {};
  const choices = channelOptions(setting.matchChannelId, true);
  const logChoices = channelOptions(setting.modLogChannelId, true);
  return `<div class="callout info">Destiny checks the bot’s current channel permissions before saving. The portal needs View Channel, Send Messages, and Embed Links.</div><section class="panel"><h2 class="section-title">Matchmaking portal</h2><p class="section-description">Choose where Destiny posts the permanent matchmaking entry point. This channel is separate from private staff alerts.</p><div class="setting-row"><div class="setting-copy"><strong>Portal channel</strong><span>Members can use this channel to open Destiny’s private matchmaking experience.</span></div><div class="control"><select id="portal-channel" aria-label="Matchmaking portal channel">${choices}</select><button class="primary" id="save-portal" type="button">Save</button></div></div><h2 class="section-title spaced-top">Private moderation log</h2><p class="section-description">Select a staff-only channel for privacy-safe report alerts. Report contents and identities are not posted there.</p><div class="setting-row"><div class="setting-copy"><strong>Staff alert channel</strong><span>Keep this channel restricted to trusted server staff.</span></div><div class="control"><select id="modlog-channel" aria-label="Private moderation log channel">${logChoices}</select><button class="secondary" id="save-modlog" type="button">Save</button></div></div><h2 class="section-title spaced-top">Configuration backup</h2><p class="section-description">Download the supported Destiny settings for this server. The export contains channel IDs and cross-server participation only.</p><button class="secondary" id="export-guild-config" type="button">Download configuration JSON</button></section>`;
}

function matchmakingPage() {
  const enabled = state.settings?.crossServerEnabled !== false;
  return `<section class="panel"><h2 class="section-title">Cross-server participation</h2><p class="section-description">Destiny matches people across participating servers by default. This setting controls whether this server’s matchmaking requests can join that shared pool. Unscoped direct-message matching retains the behavior already defined by Destiny.</p><div class="setting-row"><div class="setting-copy"><strong>Include this server in cross-server matching</strong><span>${enabled ? 'This server currently participates in shared matchmaking.' : 'This server is currently excluded from shared matchmaking.'}</span></div><div class="control"><button class="toggle" id="cross-server" type="button" aria-pressed="${enabled}" aria-label="${enabled ? 'Disable' : 'Enable'} cross-server participation" ${state.busy ? 'disabled' : ''}></button></div></div><p class="metric-detail inline-note">Changes are saved to the same Destiny configuration used by Discord setup commands.</p></section>`;
}

function gettingStartedPage() {
  const settings = state.settings || {};
  const portal = state.channels.find((channel) => channel.id === settings.matchChannelId);
  const log = state.channels.find((channel) => channel.id === settings.modLogChannelId);
  const portalReady = Boolean(portal?.canView && portal?.canSend && portal?.canEmbed);
  const logReady = Boolean(log?.canView && log?.canSend);
  const step = (number, title, detail, complete, action = '') => `<li><span class="setup-step-number ${complete ? 'complete' : ''}">${complete ? '✓' : number}</span><div class="setup-step-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>${action}</div></li>`;
  const completed = 2 + Number(portalReady);
  return `<div class="callout info">Setup status is based on live bot channel permissions and Destiny’s effective settings, including the existing default for cross-server participation.</div><section class="panel"><div class="panel-heading"><div><h2 class="section-title">Set up ${escapeHtml(state.guild?.name || 'your server')}</h2><p class="section-description">${portalReady ? 'The required matchmaking portal is ready.' : 'Choose a portal channel and verify the bot can post there.'}</p></div><span class="status-pill ${portalReady ? 'ok' : 'warn'}"><span class="status-dot"></span>${portalReady ? 'Portal ready' : 'Setup needed'}</span></div><ol class="setup-steps">${step(1, 'Connect Destiny', 'The bot is currently reporting this server as connected.', true)}${step(2, 'Choose the matchmaking portal', portalReady ? `# ${portal.name} is accessible to the bot.` : 'Select a text channel where Destiny can view, send, and embed messages.', portalReady, `<button class="secondary" type="button" data-page="portal">${portalReady ? 'Review portal' : 'Choose channel'}</button>`)}${step(3, 'Choose cross-server participation', settings.crossServerEnabled === false ? 'This server is currently excluded from shared matchmaking.' : 'This server currently participates in shared matchmaking.', true, `<button class="secondary" type="button" data-page="match">Review matchmaking</button>`)}${step(4, 'Configure private staff alerts', logReady ? `# ${log.name} is accessible to the bot.` : 'Optional. Choose a private staff channel for moderation alerts.', logReady, `<button class="secondary" type="button" data-page="portal">${logReady ? 'Review alerts' : 'Configure alerts'}</button>`)}</ol><p class="metric-detail">${completed} of 3 core setup checks are complete. Staff alerts are optional.</p></section><div class="callout info">Destiny does not currently store dashboard manager-role assignments. Server access follows Discord’s live Owner, Administrator, or Manage Server permissions.</div>`;
}

function ownerOverviewPage() {
  if (!state.overview) return '<div class="skeleton" aria-label="Loading live platform health"></div>';
  const services = state.overview.services;
  const metrics = state.overview.metrics || {};
  const readable = (value) => value === 'unavailable' ? 'Unavailable' : value;
  const metricValue = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString();
  const pill = (value) => `<span class="status-pill ${value === 'connected' || value === '0' ? 'ok' : 'warn'}"><span class="status-dot"></span>${escapeHtml(readable(value))}</span>`;
  return `<div class="callout info">These values come from current Discord snapshots, Supabase counts, and worker heartbeats. Unavailable means no healthy source could be verified.</div><div class="grid metric-grid">${metric('Connected servers', metricValue(metrics.connectedServers))}${metric('Registered Destiny users', metricValue(metrics.registeredUsers))}${metric('Active conversations', metricValue(metrics.activeConversations))}</div><section class="panel"><h2 class="section-title">Service status</h2><p class="section-description">Checked ${new Date(state.overview.checkedAt).toLocaleString()}</p><ul class="activity-list"><li><strong>Supabase</strong>${pill(services.database)}</li><li><strong>Runtime state</strong>${pill(services.runtimeState)}</li><li><strong>Discord shard snapshots</strong>${pill(services.discordShards)}</li><li><strong>Worker heartbeats</strong>${pill(services.workers)}</li></ul><button class="secondary inline-note" id="refresh-health" type="button">Refresh status</button></section>`;
}

function ownerMonitoringPage() {
  if (!state.overview) return '<div class="skeleton" aria-label="Loading system diagnostics"></div>';
  const diagnostics = state.overview.diagnostics || { workers: [], shards: [] };
  const workerRows = diagnostics.workers.length ? diagnostics.workers.map((worker) => `<tr><td>${escapeHtml(worker.role)}</td><td><code>${escapeHtml(worker.id)}</code></td><td>${escapeHtml(worker.status)}</td><td>${worker.updatedAt ? escapeHtml(new Date(worker.updatedAt).toLocaleString()) : 'Unavailable'}</td></tr>`).join('') : '<tr><td colspan="4">No worker heartbeat records are available.</td></tr>';
  const shardRows = diagnostics.shards.length ? diagnostics.shards.map((shard) => `<tr><td><code>${escapeHtml(shard.id)}</code></td><td>${escapeHtml(shard.status)}</td><td>${shard.connectedServers == null ? 'Unavailable' : Number(shard.connectedServers).toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="3">No shard snapshot records are available.</td></tr>';
  return `<div class="callout info">Worker status uses Supabase-backed 90-second heartbeat leases. Shard status uses the bot’s existing short-lived guild snapshots.</div><section class="panel"><h2 class="section-title">Workers</h2><div class="table-scroll"><table><thead><tr><th scope="col">Role</th><th scope="col">Instance</th><th scope="col">Status</th><th scope="col">Last heartbeat</th></tr></thead><tbody>${workerRows}</tbody></table></div></section><section class="panel"><h2 class="section-title">Discord shards</h2><div class="table-scroll"><table><thead><tr><th scope="col">Shard</th><th scope="col">Status</th><th scope="col">Connected servers</th></tr></thead><tbody>${shardRows}</tbody></table></div></section>`;
}

function ownerAuditPage() {
  const entries = state.audit?.logs || [];
  const content = state.auditLoading
    ? '<div class="skeleton" aria-label="Loading platform audit history"></div>'
    : state.audit?.error
      ? `<div class="error-box">${escapeHtml(state.audit.error)} <button class="secondary" id="retry-audit" type="button">Retry</button></div>`
      : entries.length === 0
        ? '<div class="empty">No audit events are available.</div>'
        : `<div class="table-scroll"><table><thead><tr><th scope="col">Event</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Change</th><th scope="col">When</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${escapeHtml(entry.action)}</td><td><code>${escapeHtml(entry.adminId)}</code></td><td>${escapeHtml(entry.targetType)} <code>${escapeHtml(entry.targetId)}</code></td><td><code>${escapeHtml(JSON.stringify(entry.changes || {}))}</code></td><td>${escapeHtml(new Date(entry.createdAt).toLocaleString())}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Latest platform audit events</span><div><button class="secondary" id="previous-audit" type="button" ${state.auditOffset === 0 ? 'disabled' : ''}>Previous</button><button class="secondary" id="next-audit" type="button" ${state.audit?.nextOffset == null ? 'disabled' : ''}>Next</button></div></div>`;
  return `<section class="panel"><h2 class="section-title">Platform audit history</h2><p class="section-description">Read-only records from Destiny’s existing audit table. Sensitive IP metadata is omitted.</p>${content}</section>`;
}

function ownerReportsPage() {
  if (state.reportLoading) return '<div class="skeleton" aria-label="Loading report details"></div>';
  if (state.selectedReport?.error) return `<div class="error-box">${escapeHtml(state.selectedReport.error)} <button class="secondary" id="back-reports" type="button">Back to queue</button></div>`;
  if (state.selectedReport) {
    const report = state.selectedReport;
    const excerpt = Array.isArray(report.chatExcerpt) && report.chatExcerpt.length
      ? `<ol class="activity-list">${report.chatExcerpt.map((message) => `<li><strong>${escapeHtml(message.senderPseudonym || 'Anonymous participant')}</strong><span>${escapeHtml(message.content || '')}<br><small>${escapeHtml(new Date(message.timestamp).toLocaleString())}</small></span></li>`).join('')}</ol>`
      : '<div class="empty">This report has no attached conversation excerpt.</div>';
    return `<button class="secondary inline-note" id="back-reports" type="button">← Back to pending reports</button><section class="panel"><h2 class="section-title">${escapeHtml(report.category)} report</h2><p class="section-description">Submitted ${escapeHtml(new Date(report.createdAt).toLocaleString())} · Case <code>${escapeHtml(report.id)}</code></p><div class="callout info">Evidence is limited to this owner-authorized report case. Participant account IDs are not shown.</div><h3>Description</h3><p>${escapeHtml(report.description || 'No additional description was provided.')}</p><h3>Relevant reported excerpt</h3>${excerpt}</section><form class="panel" id="resolve-report-form"><h2 class="section-title">Resolve report</h2><label for="report-action">Action</label><select id="report-action" required><option value="none">No account action</option><option value="warned">Warning</option><option value="temp_ban">Temporary restriction</option><option value="perma_ban">Permanent restriction</option></select><label for="report-notes">Moderator rationale</label><textarea id="report-notes" minlength="5" maxlength="1000" required aria-describedby="report-notes-help"></textarea><p id="report-notes-help" class="metric-detail">5–1,000 characters. This note is retained with the report.</p><button class="primary" type="submit">Resolve case</button></form>`;
  }
  const list = state.reports?.error
    ? `<div class="error-box">${escapeHtml(state.reports.error)} <button class="secondary" id="retry-reports" type="button">Retry</button></div>`
    : state.reportsLoading || !state.reports
      ? '<div class="skeleton" aria-label="Loading pending reports"></div>'
      : state.reports.reports.length === 0
        ? '<div class="empty">There are no pending reports.</div>'
        : `<div class="table-scroll"><table><thead><tr><th scope="col">Category</th><th scope="col">Received</th><th scope="col">Case</th><th scope="col">Status</th></tr></thead><tbody>${state.reports.reports.map((report) => `<tr><td><button class="table-link" type="button" data-report-id="${escapeHtml(report.id)}">${escapeHtml(report.category)}</button></td><td>${escapeHtml(new Date(report.createdAt).toLocaleString())}</td><td><code>${escapeHtml(report.id)}</code></td><td>${escapeHtml(report.status)}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Pending reports</span><div><button class="secondary" id="previous-reports" type="button" ${state.reports.offset === 0 ? 'disabled' : ''}>Previous</button><button class="secondary" id="next-reports" type="button" ${state.reports.nextOffset == null ? 'disabled' : ''}>Next</button></div></div>`;
  return `<section class="panel"><h2 class="section-title">Pending safety reports</h2><p class="section-description">The queue shows case metadata only. Open a specific case to review its pseudonymized evidence.</p>${list}</section>`;
}

function ownerVerificationPage() {
  if (state.verificationLoading) return '<div class="skeleton" aria-label="Loading verification request"></div>';
  if (state.selectedVerification?.error) return `<div class="error-box">${escapeHtml(state.selectedVerification.error)} <button class="secondary" id="back-verification" type="button">Back to requests</button></div>`;
  if (state.selectedVerification) {
    const requestData = state.selectedVerification;
    const evidence = requestData.evidence ? `<pre class="verification-evidence">${escapeHtml(requestData.evidence)}</pre>` : '<div class="empty">Evidence is unavailable for this request.</div>';
    return `<button class="secondary inline-note" id="back-verification" type="button">← Back to pending requests</button><section class="panel"><h2 class="section-title">Verification request</h2><p class="section-description">Destiny ID <code>${escapeHtml(requestData.destinyId)}</code> · Submitted ${escapeHtml(new Date(requestData.submittedAt).toLocaleString())}</p><ul class="activity-list"><li><strong>Age</strong><span>${escapeHtml(requestData.age)}</span></li><li><strong>Gender</strong><span>${escapeHtml(requestData.gender)}</span></li></ul><div class="callout info">Private evidence is shown only in this root-owner review case. Discord account IDs are not exposed.</div><h3>Submitted evidence</h3>${evidence}</section><form class="panel" id="review-verification-form"><h2 class="section-title">Review decision</h2><label for="verification-notes">Reviewer rationale</label><textarea id="verification-notes" minlength="5" maxlength="1000" required aria-describedby="verification-notes-help"></textarea><p id="verification-notes-help" class="metric-detail">5–1,000 characters. The rationale is retained in the existing moderation audit.</p><div class="control"><button class="primary" type="submit" data-decision="approve">Approve</button><button class="secondary" type="submit" data-decision="reject">Reject</button></div></form>`;
  }
  const content = state.verifications?.error
    ? `<div class="error-box">${escapeHtml(state.verifications.error)} <button class="secondary" id="retry-verification" type="button">Retry</button></div>`
    : state.verificationsLoading || !state.verifications
      ? '<div class="skeleton" aria-label="Loading pending verification requests"></div>'
      : state.verifications.requests.length === 0
        ? '<div class="empty">There are no pending verification requests.</div>'
        : `<div class="table-scroll"><table><thead><tr><th scope="col">Destiny ID</th><th scope="col">Submitted</th><th scope="col">Case ID</th></tr></thead><tbody>${state.verifications.requests.map((requestData) => `<tr><td><button class="table-link" type="button" data-verification-id="${escapeHtml(requestData.id)}">${escapeHtml(requestData.destinyId)}</button></td><td>${escapeHtml(new Date(requestData.createdAt).toLocaleString())}</td><td><code>${escapeHtml(requestData.id)}</code></td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Pending verification requests</span><div><button class="secondary" id="previous-verification" type="button" ${state.verificationOffset === 0 ? 'disabled' : ''}>Previous</button><button class="secondary" id="next-verification" type="button" ${state.verifications.nextOffset == null ? 'disabled' : ''}>Next</button></div></div>`;
  return `<section class="panel"><h2 class="section-title">Pending verification</h2><p class="section-description">The list contains Destiny IDs only. Open a specific request to review its evidence.</p>${content}</section>`;
}

function ownerUsersPage() {
  let result = '';
  if (state.userLookupLoading) result = '<div class="skeleton" aria-label="Searching Destiny users"></div>';
  else if (state.userLookup?.error) result = `<div class="error-box">${escapeHtml(state.userLookup.error)}</div>`;
  else if (state.userLookup?.user) {
    const user = state.userLookup.user;
    const restriction = user.restriction;
    result = `<section class="panel"><h2 class="section-title">${escapeHtml(user.destinyId)}</h2><p class="section-description">Account created ${escapeHtml(new Date(user.createdAt).toLocaleString())} · Last updated ${escapeHtml(new Date(user.updatedAt).toLocaleString())}</p><ul class="activity-list"><li><strong>Destiny ID</strong><span>${escapeHtml(user.destinyId)}</span></li>${user.discordUserId ? `<li><strong>Discord ID</strong><span><code>${escapeHtml(user.discordUserId)}</code></span></li>` : ''}<li><strong>Age</strong><span>${escapeHtml(user.age)}</span></li><li><strong>Verification</strong><span>${user.genderVerified ? 'Verified' : escapeHtml(user.genderVerificationStatus)}</span></li><li><strong>Current restriction</strong><span>${restriction.active ? 'Active' : 'None'}</span></li>${restriction.active ? `<li><strong>Restriction reason</strong><span>${escapeHtml(restriction.reason)}</span></li><li><strong>Expires</strong><span>${restriction.expiresAt ? escapeHtml(new Date(restriction.expiresAt).toLocaleString()) : 'No expiry recorded'}</span></li>` : ''}</ul><div class="callout info">This view is read-only. Destiny has no separate global restriction service for dashboard changes; report actions remain case-scoped in Safety and reports.</div></section>`;
  }
  return `<section class="panel"><h2 class="section-title">Find a Destiny user</h2><p class="section-description">Search by exact Destiny ID or exact Discord ID. Every lookup is recorded in the platform audit log.</p><form id="user-lookup-form" class="search-form"><label for="user-lookup">Destiny ID or Discord ID</label><div><input id="user-lookup" name="query" type="search" maxlength="24" autocomplete="off" required placeholder="Exact ID"><button class="primary" type="submit">Search</button></div></form></section>${result}`;
}

function ownerRoomsPage() {
  const content = state.rooms?.error
    ? `<div class="error-box">${escapeHtml(state.rooms.error)} <button class="secondary" id="retry-rooms" type="button">Retry</button></div>`
    : state.roomsLoading || !state.rooms
      ? '<div class="skeleton" aria-label="Loading active conversations"></div>'
      : state.rooms.rooms.length === 0
        ? '<div class="empty">There are no active conversations.</div>'
        : `<div class="table-scroll"><table><thead><tr><th scope="col">Room</th><th scope="col">Participants</th><th scope="col">Started</th><th scope="col">Duration</th><th scope="col">Last activity</th></tr></thead><tbody>${state.rooms.rooms.map((room) => `<tr><td><code>${escapeHtml(room.roomCode)}</code></td><td>${escapeHtml(room.participants.join(' · '))}</td><td>${escapeHtml(new Date(room.startedAt).toLocaleString())}</td><td>${room.durationSeconds == null ? 'Unavailable' : escapeHtml(formatDuration(room.durationSeconds))}</td><td>${escapeHtml(new Date(room.lastActivityAt).toLocaleString())}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Active conversation metadata · page size ${state.rooms.limit}</span><div><button class="secondary" id="previous-rooms" type="button" ${state.roomOffset === 0 ? 'disabled' : ''}>Previous</button><button class="secondary" id="next-rooms" type="button" ${state.rooms.nextOffset == null ? 'disabled' : ''}>Next</button></div></div>`;
  return `<section class="panel"><div class="panel-heading"><div><h2 class="section-title">Active anonymous conversations</h2><p class="section-description">This view contains only room codes, participant pseudonyms, and timing. It does not expose account identities or message contents. Viewing the inventory is recorded in the platform audit log.</p></div><button class="secondary" id="refresh-rooms" type="button">Refresh</button></div>${content}</section>`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function ownerServersPage() {
  if (state.serverDetailsLoading) return '<div class="skeleton" aria-label="Loading connected-server details"></div>';
  if (state.selectedServer) {
    if (state.selectedServer.error) return `<div class="error-box">${escapeHtml(state.selectedServer.error)} <button class="secondary" id="back-servers" type="button">Back to servers</button></div>`;
    const detail = state.selectedServer;
    const settings = detail.settings || {};
    const channelName = (id) => id ? detail.channels.find((channel) => channel.id === id)?.name || 'Configured channel (not visible to the bot)' : 'Not configured';
    const channelRows = detail.channels.map((channel) => `<tr><td># ${escapeHtml(channel.name)}</td><td><code>${escapeHtml(channel.id)}</code></td><td>${channel.canView ? 'View' : 'No view'} · ${channel.canSend ? 'Send' : 'No send'}${channel.canEmbed ? ' · Embed' : ''}</td></tr>`).join('') || '<tr><td colspan="3">No supported text channels were found.</td></tr>';
    return `<button class="secondary inline-note" id="back-servers" type="button">← Back to servers</button><div class="grid metric-grid">${metric('Server', detail.server.name)}${metric('Server members', detail.server.memberCount == null ? 'Unavailable' : Number(detail.server.memberCount).toLocaleString())}${metric('Bot connection', 'Connected', 'Verified from the current shard snapshot')}</div>${detail.configurationAvailable ? '' : '<div class="callout">Guild configuration is unavailable because the database connection could not be verified.</div>'}<section class="panel"><h2 class="section-title">Destiny configuration</h2><ul class="activity-list"><li><strong>Portal channel</strong><span>${detail.configurationAvailable ? escapeHtml(channelName(settings.matchChannelId)) : 'Unavailable'}</span></li><li><strong>Private moderation log</strong><span>${detail.configurationAvailable ? escapeHtml(channelName(settings.modLogChannelId)) : 'Unavailable'}</span></li><li><strong>Cross-server matching</strong><span>${detail.configurationAvailable ? settings.crossServerEnabled ? 'Enabled' : 'Disabled' : 'Unavailable'}</span></li><li><strong>Last saved</strong><span>${detail.configurationAvailable ? settings.updatedAt ? escapeHtml(new Date(settings.updatedAt).toLocaleString()) : 'No saved settings yet' : 'Unavailable'}</span></li></ul></section><section class="panel"><h2 class="section-title">Live bot channel access</h2><div class="table-scroll"><table><thead><tr><th scope="col">Channel</th><th scope="col">Channel ID</th><th scope="col">Bot permissions</th></tr></thead><tbody>${channelRows}</tbody></table></div></section>`;
  }
  const table = !state.ownerServersLoading && state.ownerServers?.error
    ? `<div class="error-box">${escapeHtml(state.ownerServers.error)} <button class="secondary" id="retry-servers" type="button">Retry</button></div>`
    : state.ownerServersLoading || !state.ownerServers
      ? '<div class="skeleton" aria-label="Loading connected servers"></div>'
      : !state.ownerServers.available
        ? '<div class="empty">Discord server inventory is unavailable because the bot snapshot is missing.</div>'
        : state.ownerServers.servers.length === 0
          ? '<div class="empty">No connected servers matched this search.</div>'
          : `<div class="table-scroll"><table><thead><tr><th scope="col">Server</th><th scope="col">Members</th><th scope="col">Server ID</th></tr></thead><tbody>${state.ownerServers.servers.map((server) => `<tr><td><button class="table-link" type="button" data-server-id="${escapeHtml(server.id)}">${escapeHtml(server.name)}</button></td><td>${server.memberCount == null ? 'Unavailable' : Number(server.memberCount).toLocaleString()}</td><td><code>${escapeHtml(server.id)}</code></td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>${state.ownerServers.total.toLocaleString()} connected servers</span><div><button class="secondary" id="previous-servers" type="button" ${state.ownerServerOffset === 0 ? 'disabled' : ''}>Previous</button><button class="secondary" id="next-servers" type="button" ${state.ownerServers.nextOffset == null ? 'disabled' : ''}>Next</button></div></div>`;
  return `<section class="panel"><form id="server-search-form" class="search-form"><label for="server-search">Search by server name or ID</label><div><input id="server-search" name="search" type="search" maxlength="100" value="${escapeHtml(state.ownerServerSearch)}" placeholder="Find a server"><button class="primary" type="submit">Search</button></div></form>${table}</section>`;
}

function ownerUnavailablePage(title) {
  return `<section class="panel"><h2 class="section-title">${escapeHtml(title)}</h2><div class="empty">This function has no owner-dashboard API yet. No sample data or controls are shown.</div></section>`;
}

function ownerOperatorsPage() {
  const grants = state.operators?.grants || [];
  const rows = state.operatorsLoading
    ? '<tr><td colspan="4"><div class="skeleton" aria-label="Loading platform operator grants"></div></td></tr>'
    : state.operators?.error
      ? `<tr><td colspan="4"><div class="error-box">${escapeHtml(state.operators.error)} <button class="secondary" id="retry-operators" type="button">Retry</button></div></td></tr>`
      : grants.length === 0
        ? '<tr><td colspan="4">No delegated platform capabilities are active.</td></tr>'
        : grants.map((grant) => `<tr><td><code>${escapeHtml(grant.discordUserId)}</code></td><td>${escapeHtml(operatorCapabilityLabels[grant.capability] || grant.capability)}</td><td>${escapeHtml(grant.grantedBy)} · ${escapeHtml(new Date(grant.grantedAt).toLocaleString())}</td><td><button class="secondary" type="button" data-operator-revoke="${escapeHtml(grant.discordUserId)}" data-capability="${escapeHtml(grant.capability)}">Revoke</button></td></tr>`).join('');
  const choices = (state.operators?.capabilities || Object.keys(operatorCapabilityLabels))
    .map((capability) => `<option value="${escapeHtml(capability)}">${escapeHtml(operatorCapabilityLabels[capability] || capability)}</option>`).join('');
  return `<div class="callout info">Only configured root owners can grant these capabilities. Grants are checked again on every request, and changes are committed with their audit record. Root owners remain controlled only by BOT_OWNER_IDS.</div><section class="panel"><h2 class="section-title">Grant an operator capability</h2><form id="operator-grant-form" class="search-form"><label for="operator-discord-id">Discord user ID</label><div><input id="operator-discord-id" name="discordUserId" inputmode="numeric" pattern="[0-9]{17,20}" minlength="17" maxlength="20" required placeholder="17–20 digit ID"><select id="operator-capability" aria-label="Capability to grant">${choices}</select><button class="primary" type="submit">Grant access</button></div></form></section><section class="panel"><h2 class="section-title">Active delegated capabilities</h2><p class="section-description">Each row grants one capability. Revocation takes effect on the operator’s next request.</p><div class="table-scroll"><table><thead><tr><th scope="col">Discord user</th><th scope="col">Capability</th><th scope="col">Granted by</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table></div><button class="secondary inline-note" id="refresh-operators" type="button">Refresh grants</button></section>`;
}

function renderCurrent() {
  if (app === 'owner') {
    const titles = { overview: 'Global overview', servers: 'Servers', users: 'Users', rooms: 'Active conversations', reports: 'Safety and reports', verification: 'Verification', monitoring: 'System monitoring', audit: 'Audit history', operators: 'Platform operators' };
    const description = state.page === 'overview' ? 'Live service health from Destiny’s existing runtime and connection checks.' : 'Owner-only operational information.';
    const content = state.page === 'overview' ? ownerOverviewPage() : state.page === 'servers' ? ownerServersPage() : state.page === 'users' ? ownerUsersPage() : state.page === 'rooms' ? ownerRoomsPage() : state.page === 'reports' ? ownerReportsPage() : state.page === 'verification' ? ownerVerificationPage() : state.page === 'monitoring' ? ownerMonitoringPage() : state.page === 'audit' ? ownerAuditPage() : state.page === 'operators' ? ownerOperatorsPage() : ownerUnavailablePage(titles[state.page] || 'Unavailable');
    renderLayout(content, titles[state.page] || 'Platform', description);
    document.getElementById('refresh-health')?.addEventListener('click', loadOwnerOverview);
    if (state.page === 'monitoring') document.getElementById('refresh-health')?.addEventListener('click', loadOwnerOverview);
    document.getElementById('server-search-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      state.ownerServerSearch = document.getElementById('server-search').value.trim();
      state.ownerServerOffset = 0;
      state.selectedServer = null;
      void loadOwnerServers();
    });
    document.getElementById('retry-servers')?.addEventListener('click', () => loadOwnerServers());
    document.querySelectorAll('[data-server-id]').forEach((button) => button.addEventListener('click', () => loadOwnerServer(button.dataset.serverId)));
    document.getElementById('back-servers')?.addEventListener('click', () => { state.selectedServer = null; renderCurrent(); });
    document.getElementById('retry-reports')?.addEventListener('click', () => loadOwnerReports());
    document.getElementById('next-reports')?.addEventListener('click', () => { if (state.reports?.nextOffset != null) { state.reportOffset = state.reports.nextOffset; void loadOwnerReports(); } });
    document.getElementById('previous-reports')?.addEventListener('click', () => { state.reportOffset = Math.max(0, state.reportOffset - 25); void loadOwnerReports(); });
    document.querySelectorAll('[data-report-id]').forEach((button) => button.addEventListener('click', () => loadOwnerReport(button.dataset.reportId)));
    document.getElementById('back-reports')?.addEventListener('click', () => { state.selectedReport = null; renderCurrent(); });
    document.getElementById('resolve-report-form')?.addEventListener('submit', (event) => { void resolveOwnerReport(event); });
    document.getElementById('retry-verification')?.addEventListener('click', () => loadOwnerVerifications());
    document.getElementById('next-verification')?.addEventListener('click', () => { if (state.verifications?.nextOffset != null) { state.verificationOffset = state.verifications.nextOffset; void loadOwnerVerifications(); } });
    document.getElementById('previous-verification')?.addEventListener('click', () => { state.verificationOffset = Math.max(0, state.verificationOffset - 25); void loadOwnerVerifications(); });
    document.querySelectorAll('[data-verification-id]').forEach((button) => button.addEventListener('click', () => loadOwnerVerification(button.dataset.verificationId)));
    document.getElementById('back-verification')?.addEventListener('click', () => { state.selectedVerification = null; renderCurrent(); });
    document.getElementById('review-verification-form')?.addEventListener('submit', (event) => { void reviewOwnerVerification(event); });
    document.getElementById('user-lookup-form')?.addEventListener('submit', (event) => { void loadOwnerUserLookup(event); });
    document.getElementById('operator-grant-form')?.addEventListener('submit', (event) => { void grantOwnerOperatorCapability(event); });
    document.getElementById('retry-operators')?.addEventListener('click', () => loadOwnerOperators());
    document.getElementById('refresh-operators')?.addEventListener('click', () => loadOwnerOperators());
    document.querySelectorAll('[data-operator-revoke]').forEach((button) => button.addEventListener('click', () => revokeOwnerOperatorCapability(button.dataset.operatorRevoke, button.dataset.capability)));
    document.getElementById('retry-rooms')?.addEventListener('click', () => loadOwnerRooms());
    document.getElementById('refresh-rooms')?.addEventListener('click', () => loadOwnerRooms());
    document.getElementById('next-rooms')?.addEventListener('click', () => { if (state.rooms?.nextOffset != null) { state.roomOffset = state.rooms.nextOffset; void loadOwnerRooms(); } });
    document.getElementById('previous-rooms')?.addEventListener('click', () => { state.roomOffset = Math.max(0, state.roomOffset - 25); void loadOwnerRooms(); });
    document.getElementById('next-servers')?.addEventListener('click', () => {
      if (state.ownerServers?.nextOffset != null) { state.ownerServerOffset = state.ownerServers.nextOffset; void loadOwnerServers(); }
    });
    document.getElementById('previous-servers')?.addEventListener('click', () => {
      state.ownerServerOffset = Math.max(0, state.ownerServerOffset - 25);
      void loadOwnerServers();
    });
    bindAuditPagination(() => loadOwnerAudit());
    if (state.page === 'servers' && !state.ownerServers && !state.ownerServersLoading) void loadOwnerServers();
    if (state.page === 'reports' && !state.reports && !state.reportsLoading && !state.selectedReport) void loadOwnerReports();
    if (state.page === 'rooms' && !state.rooms && !state.roomsLoading) void loadOwnerRooms();
    if (state.page === 'verification' && !state.verifications && !state.verificationsLoading && !state.selectedVerification) void loadOwnerVerifications();
    if (state.page === 'audit' && !state.audit && !state.auditLoading) void loadOwnerAudit();
    if (state.page === 'operators' && state.session?.rootOwner && !state.operators && !state.operatorsLoading) void loadOwnerOperators();
    return;
  }
  const titles = { overview: 'Overview', start: 'Getting started', portal: 'Chat portal', match: 'Matchmaking' };
  const content = state.page === 'start' ? gettingStartedPage() : state.page === 'portal' ? portalPage() : state.page === 'match' ? matchmakingPage() : overviewPage();
  renderLayout(content, titles[state.page] || 'Overview', state.page === 'overview' ? 'A current view of Destiny in this server.' : 'Manage settings that belong to this server.');
  document.getElementById('save-portal')?.addEventListener('click', () => saveSetting('matchChannelId', document.getElementById('portal-channel').value || null));
  document.getElementById('save-modlog')?.addEventListener('click', () => saveSetting('modLogChannelId', document.getElementById('modlog-channel').value || null));
  document.getElementById('export-guild-config')?.addEventListener('click', downloadGuildConfiguration);
  document.getElementById('cross-server')?.addEventListener('click', () => saveSetting('crossServerEnabled', !(state.settings?.crossServerEnabled !== false)));
  document.querySelectorAll('[data-rollback-audit]').forEach((button) => button.addEventListener('click', () => rollbackGuildSetting(button.dataset.rollbackAudit)));
  bindAuditPagination(() => loadAudit());
}

async function rollbackGuildSetting(auditId) {
  const event = state.audit?.logs?.find((entry) => entry.id === auditId);
  if (!state.guild || !event || state.busy) return;
  const keyLabels = { matchChannelId: 'portal channel', modLogChannelId: 'private moderation log channel', crossServerEnabled: 'cross-server participation' };
  const key = event.changes?.key;
  if (!keyLabels[key]) return;
  const confirmed = window.confirm(`Restore the previous ${keyLabels[key]} value from this audit event? This only works while that value is still current and Destiny still has the required access.`);
  if (!confirmed) return;
  state.busy = true;
  try {
    const { data } = await request(`/api/guilds/${encodeURIComponent(state.guild.id)}/audit/${encodeURIComponent(auditId)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: state.settings?.updatedAt ?? null }),
    });
    showToast(data.audit === 'unavailable' ? data.message : 'Setting restored and rollback recorded in audit history.', data.audit === 'unavailable');
    await loadGuild(state.guild.id, false);
    await loadAudit();
  } catch (error) {
    showToast(error.message || 'This setting could not be restored.', true);
    if (error.status === 409) {
      await loadGuild(state.guild.id, false);
      await loadAudit();
    }
  } finally {
    state.busy = false;
  }
}

async function downloadGuildConfiguration() {
  const button = document.getElementById('export-guild-config');
  if (!state.guild || !button) return;
  button.disabled = true;
  try {
    const { data } = await request(`/api/guilds/${encodeURIComponent(state.guild.id)}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `destiny-guild-${state.guild.id}-config.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    showToast('Configuration downloaded. The export access was recorded in server audit history.');
  } catch (error) {
    showToast(error.message || 'The configuration export could not be completed.', true);
  } finally {
    button.disabled = false;
  }
}

function bindAuditPagination(loader) {
  document.getElementById('retry-audit')?.addEventListener('click', () => loader());
  document.getElementById('next-audit')?.addEventListener('click', () => {
    if (state.audit?.nextOffset != null) { state.auditOffset = state.audit.nextOffset; void loader(); }
  });
  document.getElementById('previous-audit')?.addEventListener('click', () => {
    state.auditOffset = Math.max(0, state.auditOffset - (app === 'owner' ? 50 : 25));
    void loader();
  });
}

async function saveSetting(key, value) {
  if (!state.guild || state.busy) return;
  state.busy = true;
  try {
    const { data } = await request(`/api/guilds/${encodeURIComponent(state.guild.id)}/settings`, { method: 'PUT', body: JSON.stringify({ [key]: value, expectedUpdatedAt: state.settings?.updatedAt ?? null }) });
    if (data.audit === 'unavailable') showToast(data.message, true);
    else showToast('Setting saved and audit recorded.');
    await loadGuild(state.guild.id, false);
  } catch (error) {
    showToast(error.message, true);
    if (error.status === 409) await loadGuild(state.guild.id, false);
  }
  finally { state.busy = false; }
}

async function loadGuild(id, showLoading = true) {
  if (showLoading) renderLayout('<div class="skeleton" aria-label="Loading server settings"></div>', 'Server');
  try {
    const { data } = await request(`/api/guilds/${encodeURIComponent(id)}`);
    state.guild = data.guild;
    state.settings = data.settings;
    state.channels = data.channels;
    state.audit = null;
    state.auditOffset = 0;
    renderCurrent();
    void loadAudit();
  } catch (error) {
    const guild = state.guilds.find((item) => item.id === id);
    state.guild = guild ? { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.memberCount } : null;
    renderLayout(`<div class="error-box">${escapeHtml(error.message)} <button class="secondary" id="retry-guild" type="button">Retry</button></div>`, 'Server settings');
    document.getElementById('retry-guild')?.addEventListener('click', () => loadGuild(id));
  }
}

async function loadOwnerOverview() {
  state.overview = null;
  renderCurrent();
  try {
    const { data } = await request('/api/owner/overview');
    state.overview = data;
  } catch (error) { state.overview = { error: error.message }; }
  if (state.overview?.error) {
    renderLayout(`<div class="error-box">${escapeHtml(state.overview.error)} <button class="secondary" id="refresh-health" type="button">Retry</button></div>`, 'Global overview', 'Live Destiny service health.');
    document.getElementById('refresh-health')?.addEventListener('click', loadOwnerOverview);
  } else renderCurrent();
}

async function loadOwnerOperators() {
  state.operatorsLoading = true;
  state.operators = null;
  renderCurrent();
  try {
    const { data } = await request('/api/owner/operators');
    state.operators = data;
  } catch (error) { state.operators = { error: error.message }; }
  state.operatorsLoading = false;
  renderCurrent();
}

async function grantOwnerOperatorCapability(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const discordUserId = String(new FormData(form).get('discordUserId') || '').trim();
  const capability = document.getElementById('operator-capability')?.value;
  state.busy = true;
  try {
    const { data } = await request('/api/owner/operators', {
      method: 'POST',
      body: JSON.stringify({ discordUserId, capability }),
    });
    showToast(data.changed ? 'Capability granted and audit recorded.' : 'That capability is already active.');
    form.reset();
    await loadOwnerOperators();
  } catch (error) { showToast(error.message || 'The capability could not be granted.', true); }
  finally { state.busy = false; }
}

async function revokeOwnerOperatorCapability(discordUserId, capability) {
  if (state.busy) return;
  const label = operatorCapabilityLabels[capability] || capability;
  if (!window.confirm(`Revoke ${label} for Discord user ${discordUserId}? Access ends on their next request.`)) return;
  state.busy = true;
  try {
    const { data } = await request(`/api/owner/operators/${encodeURIComponent(discordUserId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ capability }),
    });
    showToast(data.changed ? 'Capability revoked and audit recorded.' : 'That capability was already inactive.');
    await loadOwnerOperators();
  } catch (error) { showToast(error.message || 'The capability could not be revoked.', true); }
  finally { state.busy = false; }
}

async function loadOwnerServers() {
  state.ownerServersLoading = true;
  state.ownerServers = null;
  renderCurrent();
  const query = new URLSearchParams({ search: state.ownerServerSearch, limit: '25', offset: String(state.ownerServerOffset) });
  try {
    const { data } = await request(`/api/owner/servers?${query}`);
    state.ownerServers = data;
  } catch (error) { state.ownerServers = { error: error.message }; }
  state.ownerServersLoading = false;
  renderCurrent();
}

async function loadOwnerRooms() {
  if (state.roomsLoading) return;
  state.roomsLoading = true;
  state.rooms = null;
  renderCurrent();
  const query = new URLSearchParams({ limit: '25', offset: String(state.roomOffset) });
  try {
    const { data } = await request(`/api/owner/rooms?${query}`);
    state.rooms = data;
  } catch (error) { state.rooms = { error: error.message }; }
  state.roomsLoading = false;
  renderCurrent();
}

async function loadOwnerServer(id) {
  state.serverDetailsLoading = true;
  state.selectedServer = null;
  renderCurrent();
  try {
    const { data } = await request(`/api/owner/servers/${encodeURIComponent(id)}`);
    state.selectedServer = data;
  } catch (error) { state.selectedServer = { error: error.message }; }
  state.serverDetailsLoading = false;
  renderCurrent();
}

async function loadAudit() {
  if (!state.guild || state.auditLoading) return;
  state.auditLoading = true;
  state.audit = null;
  renderCurrent();
  const query = new URLSearchParams({ limit: '25', offset: String(state.auditOffset) });
  try {
    const { data } = await request(`/api/guilds/${encodeURIComponent(state.guild.id)}/audit?${query}`);
    state.audit = data;
  } catch (error) { state.audit = { error: error.message }; }
  state.auditLoading = false;
  renderCurrent();
}

async function loadOwnerAudit() {
  if (state.auditLoading) return;
  state.auditLoading = true;
  state.audit = null;
  renderCurrent();
  const query = new URLSearchParams({ limit: '50', offset: String(state.auditOffset) });
  try {
    const { data } = await request(`/api/owner/audit?${query}`);
    state.audit = data;
  } catch (error) { state.audit = { error: error.message }; }
  state.auditLoading = false;
  renderCurrent();
}

async function loadOwnerReports() {
  if (state.reportsLoading) return;
  state.reportsLoading = true;
  state.reports = null;
  renderCurrent();
  const query = new URLSearchParams({ status: 'pending', limit: '25', offset: String(state.reportOffset) });
  try {
    const { data } = await request(`/api/owner/reports?${query}`);
    state.reports = data;
  } catch (error) { state.reports = { error: error.message }; }
  state.reportsLoading = false;
  renderCurrent();
}

async function loadOwnerReport(id) {
  state.reportLoading = true;
  state.selectedReport = null;
  renderCurrent();
  try {
    const { data } = await request(`/api/owner/reports/${encodeURIComponent(id)}`);
    state.selectedReport = data.report;
  } catch (error) { state.selectedReport = { error: error.message }; }
  state.reportLoading = false;
  renderCurrent();
}

async function resolveOwnerReport(event) {
  event.preventDefault();
  if (!state.selectedReport || state.busy) return;
  const action = document.getElementById('report-action').value;
  const notes = document.getElementById('report-notes').value.trim();
  if (action === 'perma_ban' && !window.confirm('Permanently restrict the reported account and close this case? This action cannot be reversed from this dashboard.')) return;
  if (action === 'temp_ban' && !window.confirm('Temporarily restrict the reported account and close this case?')) return;
  state.busy = true;
  try {
    const { data } = await request(`/api/owner/reports/${encodeURIComponent(state.selectedReport.id)}`, { method: 'POST', body: JSON.stringify({ action, notes }) });
    showToast(data.message || 'Report resolved and audit recorded.', data.audit === 'unavailable');
    state.selectedReport = null;
    state.reportOffset = 0;
    await loadOwnerReports();
  } catch (error) { showToast(error.message, true); }
  finally { state.busy = false; }
}

async function loadOwnerVerifications() {
  if (state.verificationsLoading) return;
  state.verificationsLoading = true;
  state.verifications = null;
  renderCurrent();
  const query = new URLSearchParams({ limit: '25', offset: String(state.verificationOffset) });
  try {
    const { data } = await request(`/api/owner/verification?${query}`);
    state.verifications = data;
  } catch (error) { state.verifications = { error: error.message }; }
  state.verificationsLoading = false;
  renderCurrent();
}

async function loadOwnerUserLookup(event) {
  event.preventDefault();
  if (state.userLookupLoading) return;
  const query = document.getElementById('user-lookup').value.trim();
  state.userLookupLoading = true;
  state.userLookup = null;
  renderCurrent();
  try {
    const { data } = await request('/api/owner/users/search', { method: 'POST', body: JSON.stringify({ query }) });
    state.userLookup = data;
  } catch (error) { state.userLookup = { error: error.message }; }
  state.userLookupLoading = false;
  renderCurrent();
}

async function loadOwnerVerification(id) {
  state.verificationLoading = true;
  state.selectedVerification = null;
  renderCurrent();
  try {
    const { data } = await request(`/api/owner/verification/${encodeURIComponent(id)}`);
    state.selectedVerification = data.request;
  } catch (error) { state.selectedVerification = { error: error.message }; }
  state.verificationLoading = false;
  renderCurrent();
}

async function reviewOwnerVerification(event) {
  event.preventDefault();
  if (!state.selectedVerification || state.busy) return;
  const decision = event.submitter?.dataset.decision;
  if (decision !== 'approve' && decision !== 'reject') return;
  const approved = decision === 'approve';
  const notes = document.getElementById('verification-notes').value.trim();
  if (!window.confirm(`${approved ? 'Approve' : 'Reject'} this verification request and notify the user?`)) return;
  state.busy = true;
  try {
    const { data } = await request(`/api/owner/verification/${encodeURIComponent(state.selectedVerification.id)}`, { method: 'POST', body: JSON.stringify({ approved, notes }) });
    showToast(data.message || 'Verification review saved.', data.audit === 'unavailable');
    state.selectedVerification = null;
    state.verificationOffset = 0;
    await loadOwnerVerifications();
  } catch (error) { showToast(error.message, true); }
  finally { state.busy = false; }
}

async function signOut() {
  try { await request('/auth/logout', { method: 'POST', body: '{}' }); } catch { /* The cookie expires if the session store is unavailable. */ }
  window.location.assign('/');
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('auth') === 'denied') return loginPage('This Discord account is not configured as a Destiny platform owner.');
  if (params.get('auth') === 'audit-unavailable') return loginPage('Owner sign-in is unavailable until the security audit service is healthy.');
  if (params.get('auth') === 'failed') return loginPage('Sign-in did not finish. Please try again.');
  try {
    const { data } = await request('/api/session');
    state.session = data;
    state.csrf = data.csrfToken;
    if (app === 'owner') {
      if (data.app !== 'owner') throw new Error('This session belongs to the server dashboard.');
      state.page = 'overview';
      return await loadOwnerOverview();
    }
    if (data.app !== 'server') throw new Error('This session belongs to the owner dashboard.');
    const { data: guildData } = await request('/api/guilds');
    state.guilds = guildData.guilds;
    if (!state.guilds.length) {
      return renderLayout('<div class="empty">No server where you have Manage Server access and Destiny is currently connected was found.</div>', 'Overview', 'Select a server where Destiny is installed.');
    }
    const chosen = params.get('guild');
    const selected = state.guilds.find((guild) => guild.id === chosen && guild.configurable) || state.guilds.find((guild) => guild.configurable);
    if (!selected) return renderLayout('<div class="empty">Destiny is not currently connected to any server you can manage.</div>', 'Overview');
    await loadGuild(selected.id);
  } catch (error) {
    if (error.status === 401) return loginPage();
    loginPage(error.message || 'Dashboard unavailable.');
  }
}

setTheme(getTheme());
boot();
