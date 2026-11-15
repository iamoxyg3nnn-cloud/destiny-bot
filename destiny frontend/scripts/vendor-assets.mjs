import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const bundle = "C:/Users/basud/AppData/Local/Temp/browser-use/assets/d8ce43ec-2a38-4668-9f14-7c0e7e0d77aa";
const out = "public";

mkdirSync(join(out, "brand"), { recursive: true });
mkdirSync(join(out, "guilds"), { recursive: true });
mkdirSync(join(out, "fonts"), { recursive: true });

const copy = (from, to) => copyFileSync(join(bundle, from), join(out, to));
copy("d84365e45526a18b.png", "brand/cupid-mark-128.png");
copy("83674aec1aa56751.png", "brand/cupid-mark-256.png");
copy("378497e856bc9729.png", "favicon.png");
copy("0e8c5f8abdf5d111.woff2", "fonts/fraunces-latin.woff2");
copy("de6784c8a40d61ba.png", "guilds/1506537061082075166.png");
copy("5e9ea98129d60d70.png", "guilds/1400537266094342286.png");
copy("814d00097f6c4bc1.png", "guilds/1476093454885982221.png");
copy("825a3c2493ca16c9.gif", "guilds/1525016952886657116.gif");

const downloads = [
  ["https://cupid.adore.rest/guilds/1496531049168109668.png", "guilds/1496531049168109668.png"],
  ["https://cupid.adore.rest/guilds/1497005298802495642.gif", "guilds/1497005298802495642.gif"],
  ["https://cupid.adore.rest/guilds/1529823286123565108.gif", "guilds/1529823286123565108.gif"],
  ["https://cupid.adore.rest/guilds/1525947706374226070.gif", "guilds/1525947706374226070.gif"],
  ["https://cupid.adore.rest/guilds/1528261797012836372.png", "guilds/1528261797012836372.png"],
  ["https://cupid.adore.rest/guilds/1525823083217289226.png", "guilds/1525823083217289226.png"],
  ["https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2", "fonts/nunito-latin.woff2"],
  ["https://fonts.gstatic.com/s/dmmono/v16/aFTU7PB1QTsUX8KYthqQBA.woff2", "fonts/dm-mono-400-latin.woff2"],
  ["https://fonts.gstatic.com/s/dmmono/v16/aFTR7PB1QTsUX8KYvumzEYOtbQ.woff2", "fonts/dm-mono-500-latin.woff2"],
];

for (const [url, destination] of downloads) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  writeFileSync(join(out, destination), Buffer.from(await response.arrayBuffer()));
}

console.log(`Copied original branding and downloaded ${downloads.length} public assets/fonts.`);
