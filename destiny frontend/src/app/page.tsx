import Link from "next/link";
import { FeatureIcon, FaqList, INVITE_URL, MatchScene, SUPPORT_URL } from "./components";
import { PetalCanvas } from "./PetalCanvas";

const guilds = [
  ["ceyi", "6,930 members", "1506537061082075166.png"],
  ["the valley of forever", "1,649 members", "1400537266094342286.png"],
  ["strawberry cafe", "1,310 members", "1476093454885982221.png"],
  ["aureole", "1,163 members", "1525016952886657116.gif"],
  ["grimmy", "630 members", "1496531049168109668.png"],
  ["destiny's stage", "419 members", "1497005298802495642.gif"],
  ["destiny's arrow", "223 members", "1529823286123565108.gif"],
  ["parasite", "104 members", "1525947706374226070.gif"],
  ["k social", "95 members", "1528261797012836372.png"],
  ["matchmaking", "86 members", "1525823083217289226.png"],
] as const;

const features = [
  ["Anonymous handles", "Everyone gets a destiny# handle. That's all anyone sees until both sides confirm a reveal."],
  ["Smart matching", "Lookup ranks compatible people from your answers - not a random roulette."],
  ["Application panel", "Drop a panel in your server so members can apply without leaving Discord."],
  ["Match controls", "Confirm, cancel, and check match status with clear slash commands."],
  ["Reports & safety", "Report handles for staff review. Scope matching per server or globally."],
  ["Built for communities", "Part of the adore.rest network - free to invite, support one click away."],
] as const;

function Divider({ flip = false }: { flip?: boolean }) {
  return (
    <div className={`divider${flip ? " divider-flip" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 320 24" fill="none">
        <path d="M4 12q10-5 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0" />
        <circle cx="160" cy="12" r="3" />
      </svg>
    </div>
  );
}

function CommunityTicker() {
  const items = [...guilds, ...guilds];
  return (
    <section className="community-section" aria-label="Destiny communities">
      <p className="community-intro">
        Powering <strong>12k+ users</strong> across <em>20+ communities</em>
      </p>
      <div className="marquee">
        <div className="guild-track">
          {items.map(([name, members, image], index) => (
            <div className="guild-item" key={`${name}-${index}`} aria-hidden={index >= guilds.length}>
              <img className="guild-icon" src={`/guilds/${image}`} width="52" height="52" alt="" />
              <div>
                <div className="guild-name">{name}</div>
                <div className="guild-members">{members}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Divider />
    </section>
  );
}

export default function HomePage() {
  return (
    <main id="main">
      <PetalCanvas />
      <section className="home-hero">
        <div className="hero-copy">
          <h1 className="hero-title">
            <span className="hero-line">
              <span className="hero-word">
                <span translate="no">destiny</span>
                <svg viewBox="0 0 80 8" fill="none" aria-hidden="true">
                  <path d="M2 5c14-3 28 2 40-1s26-2 38 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </span>{" "}is Discord&apos;s
            </span>
            <span className="hero-line">anonymous <em>matchmaking</em> app</span>
          </h1>
          <p className="hero-subtitle">
            Apply once, browse matches as a handle, and swap real usernames only when you both agree.
          </p>
          <div className="hero-actions">
            <a className="cta cta-primary" href={INVITE_URL} target="_blank" rel="noopener noreferrer">
              Invite to Discord
            </a>
            <Link className="cta cta-secondary" href="/commands">Explore commands</Link>
          </div>
        </div>
        <MatchScene />
      </section>

      <CommunityTicker />

      <section className="section-block home-section">
        <div className="section-heading">
          <p className="section-eyebrow">How it works</p>
          <h2>Three commands, start to finish</h2>
          <p>No dashboard, no signup, no leaving Discord.</p>
        </div>
        <ol className="steps">
          <li className="step">
            <span className="step-node">01</span>
            <p className="step-who">Anyone</p>
            <h3 className="step-title">Apply once</h3>
            <div className="step-command"><code className="code-pill">/application</code></div>
            <p className="step-body">Answer the questions and pick up a destiny# handle. Your username stays hidden from this point on.</p>
          </li>
          <li className="step">
            <span className="step-node">02</span>
            <p className="step-who">Anyone</p>
            <h3 className="step-title">Get a match</h3>
            <div className="step-command"><code className="code-pill">/find match</code></div>
            <p className="step-body">destiny ranks handles against your answers and introduces the closest one. Not a random roulette.</p>
          </li>
          <li className="step">
            <span className="step-node">03</span>
            <p className="step-who">Both sides</p>
            <h3 className="step-title">Reveal together</h3>
            <div className="step-command"><code className="code-pill">/user reveal</code></div>
            <p className="step-body">Usernames swap only when you both confirm. Until then, cancelling reveals nothing.</p>
          </li>
        </ol>
      </section>

      <Divider />

      <section className="section-block home-section">
        <div className="section-heading">
          <p className="section-eyebrow">Why destiny</p>
          <h2>Built for privacy-first communities</h2>
          <p>Anonymous matchmaking for Discord. Part of the <a href="https://adore.rest" target="_blank" rel="noopener noreferrer" className="link-soft">adore.rest</a> network.</p>
        </div>
        <div className="feature-grid">
          {features.map(([title, description], index) => (
            <article className="feature-card soft-card" key={title}>
              <div className="feature-well"><FeatureIcon index={index} /></div>
              <h3 className="feature-title">{title}</h3>
              <p className="feature-body">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <Divider flip />

      <section className="home-cta">
        <h2>Ready when your server is</h2>
        <p>Invite destiny, explore the commands, and join support if you need a hand.</p>
        <div className="hero-actions">
          <a className="cta cta-primary" href={INVITE_URL} target="_blank" rel="noopener noreferrer">Invite to Discord</a>
          <Link className="cta cta-secondary" href="/commands">Explore commands</Link>
          <a className="cta cta-secondary" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Join support</a>
        </div>
      </section>

      <Divider />

      <section className="faq-section home-section">
        <div className="section-heading">
          <p className="section-eyebrow">Help</p>
          <h2>Before you invite</h2>
        </div>
        <FaqList />
        <div className="faq-more"><Link className="ui-btn" href="/faq">All questions</Link></div>
      </section>
      <div className="home-bottom-space" />
    </main>
  );
}
