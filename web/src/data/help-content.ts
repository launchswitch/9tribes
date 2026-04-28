// ── Help System Content ──
// All player-facing prose for the in-game Help Panel.
// Each section is rendered as HTML (safe, curated content only).

export interface HelpSection {
  id: string;
  title: string;
  body: string; // HTML-safe prose
}

export interface TribeProfile {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  homeBiome: string;
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
}

export interface SynergyGuideEntry {
  pairId: string;
  playerDescription: string;
}

export interface HelpContent {
  quickStart: HelpSection;
  combat: HelpSection;
  research: HelpSection;
  tribes: TribeProfile[];
  synergyGuide: SynergyGuideEntry[];
}

export const helpContent: HelpContent = {
  quickStart: {
    id: 'quick-start',
    title: 'Quick Start',
    body: `
<h3>Welcome, Commander</h3>
<p>You're looking at a war map populated by rival factions. There are two ways to win: <strong>eliminate</strong> all rival tribes, or <strong>control 40% of the cities</strong> on the map (domination). Expand your territory, build cities, and crush the competition. Here's everything you need to play your first few turns.</p>

<h3>Moving Units</h3>
<p><strong>Click</strong> any of your units to select it. You'll see highlighted hexes showing where it can move. <strong>Right-click</strong> a highlighted hex (or click it directly) to send your unit there. Each unit has limited movement per turn — use it wisely.</p>

<h3>Attacking Enemies</h3>
<p>When a unit is selected, enemy units within range will be highlighted as attack targets. <strong>Click an enemy</strong> to attack. Combat resolves instantly: the attacker deals damage, then the defender <strong>counter-attacks</strong> (unless destroyed). Terrain, unit type, and faction abilities all affect the outcome.</p>

<h3>Turn Flow</h3>
<p>During your turn, activate each unit — move, attack, or both. When you're done, click <strong>End Turn</strong> in the command tray at the bottom of the screen. The AI factions take their turns, then control returns to you.</p>

<h3>Building &amp; Expanding</h3>
<p>Select a unit near a suitable hex to <strong>found a city</strong>. Cities produce new units over time. Capture enemy cities by moving units onto them. Build forts to secure strategic positions.</p>

<h3>Opening Panels</h3>
<ul>
  <li><strong>Reports</strong> — Click the <em>Reports</em> menu to see faction summaries, supply logistics, combat logs, and AI intents.</li>
  <li><strong>Research</strong> — Click the <em>Research</em> chip in the top bar (or use Reports → Research Tree) to open the Domain Research panel. Here you spend XP to unlock new abilities.</li>
  <li><strong>Help</strong> — You're reading it! Click <em>Help → How to Play</em> anytime to return here.</li>
</ul>

<h3>What's Next?</h3>
<p>Once you've got the basics down, dig into <strong>Synergies</strong> — the deep strategic system that lets you combine abilities from different factions for devastating combos. Check the Synergies tab to learn more.</p>
`,
  },

  combat: {
    id: 'combat',
    title: 'Combat',
    body: `
<h3>How Combat Works</h3>
<p>Combat in War &amp; Civilization is straightforward: <strong>select a unit</strong>, then <strong>click an enemy</strong> within attack range. Your unit deals damage based on its attack stat, and then the defender <strong>counter-attacks</strong> — unless you killed them outright. Three big factors shape every fight: terrain, unit type, and faction abilities. A hilltop archer fights very differently than a plains cavalryman.</p>

<h3>Terrain Effects</h3>
<p>The ground under your feet matters. <strong>Forests, hills, and fortifications</strong> grant defense bonuses that make units significantly harder to damage. A unit dug in behind walls or perched on high ground can hold off forces twice their size. On the flip side, open plains leave you fully exposed — great for charging, terrible for surviving.</p>
<p>Some factions laugh at terrain penalties. <strong>Desert Nomads</strong> treat sand dunes like paved roads, and <strong>Jungle Clans</strong> move through dense vegetation without penalty. If you're fighting them on their home turf, don't expect terrain to save you.</p>

<h3>Opportunity Attacks</h3>
<p>Every unit projects a <strong>Zone of Control</strong> over the hexes surrounding it. If you march through an enemy-controlled hex, that unit gets a free attack on you — no action required. This means you can't just casually stroll past enemies. Plan your routes, or you'll arrive at your destination already bleeding.</p>

<h3>Skirmish Pursuit</h3>
<p>Factions with the <strong>Skirmish Pursuit</strong> domain press their advantage in combat. When one of their units deals more damage than it takes in an exchange, they deal <strong>+2 bonus damage</strong> — pressing the wound before the enemy can recover. This rewards winning trades and makes skirmishers dangerous in sustained exchanges where they consistently come out ahead. Combined with research upgrades that add mobility and disengage options, pursuit forms the foundation of a hit-and-run playstyle built around attrition through repeated favorable exchanges.</p>

<h3>Morale &amp; Rout</h3>
<p>Units aren't mindless. When they take heavy losses and their HP drops low enough, they may <strong>rout</strong> — that is, flee the battlefield entirely. A routed unit is gone for that fight. Keep your units healthy, and watch for enemies who are one good hit away from breaking. Certain synergy effects can push the rout threshold higher or lower, turning a stable line into a rout cascade.</p>

<h3>How Synergies Change Combat</h3>
<p>Here's where things get wild. <strong>Synergies</strong> are combo abilities that activate when a unit carries tags from two different domains. Think of them as hidden power-ups unlocked by mixing playstyles. Here are three to get your imagination going:</p>

<p><strong>Toxic Bulwark</strong> <em>(Venom + Fortress)</em> — Your fortress units radiate a poison zone. Enemies standing next to them take 2 damage per turn even without being attacked. Park one at a choke point and watch the enemy wither as they try to push through. You don't even need to lift a finger.</p>

<p><strong>Unstoppable Momentum</strong> <em>(Charge + Heavy)</em> — Heavy charges deal massive knockback and stun enemies for a full turn. The enemy can't move, can't attack, can't retreat. Perfect for smashing through fortified lines and creating chaos in the back row.</p>

<p><strong>Death from the Shadows</strong> <em>(Venom + Stealth)</em> — Stealth ambushes with poison deal double damage and instantly apply 2 poison stacks. The enemy doesn't see it coming — and by the time they notice, they're already dying. This is the assassin's dream combo.</p>

<h3>Explore Them All</h3>
<p>There are 55 pair synergies and even more emergent triple-stack combos that trigger when you stack three domain tags on a single unit. Every combination opens a new strategic door. Check the <strong>Synergies</strong> tab to browse them all and plan your faction's build.
`,
  },

  research: {
    id: 'research',
    title: 'Research & Codify',
    body: `
<h3>The Big Picture</h3>
<p>You start with your faction's <strong>native domain</strong> — the one ability tree that's always yours (T1 is unlocked automatically). But to unlock the game's most powerful combos, you need <strong>foreign domains</strong>: abilities stolen from other factions. You acquire them through combat learning, city captures, and exposure, and then research them through tiers to unlock synergies and emergent rules.</p>

<h3>Learn by Kill</h3>
<p>When your units destroy an enemy, there's a chance they'll <strong>learn</strong> one of that enemy's faction domains. The chance scales with veterancy: <strong>Green 25%</strong>, <strong>Seasoned 40%</strong>, <strong>Veteran 55%</strong>, <strong>Elite 70%</strong>. Each unit can hold up to <strong>3 learned abilities</strong>. You can't learn your own faction's domains. Killing enemies near their cities also grants a guaranteed domain learn on capture. Veterans are your best students — send them to the front.</p>

<h3>Exposure (Proximity Learning)</h3>
<p>Your faction learns foreign domains passively through <strong>proximity</strong> to enemy units. When your units are within 2 hexes of enemies, your faction gains 1 exposure point per contact per turn. After accumulating enough exposure (10 for the first foreign domain, 20 for the second), that domain is automatically added to your research tree with <strong>T1 already completed</strong>. A faction can learn up to <strong>3 domains total</strong> (native + 2 foreign) through exposure. This requires no kills or manual return trips — just press units against enemy territory and wait.</p>

<h3>Automatic Codification</h3>
<p>When one of your units learns a foreign domain in battle, or when your faction acquires a domain through exposure or conquest, it is <strong>codified automatically</strong>. The faction immediately gains the domain and its <strong>T1 research node is completed for free</strong>. Units can still carry learned abilities for flavor and tracking, but you no longer need to ferry them home to unlock the faction benefit.</p>

<h3>The Research Tree — Three Tiers</h3>
<p>Each codified domain climbs through three tiers at a rate of <strong>8 XP per turn</strong>:</p>
<ul>
  <li><strong>T1 — Foundation (free):</strong> Automatic upon codification or exposure learn. The domain becomes available and <strong>pair synergies</strong> activate — if your faction knows both domains at T1, units carrying the right tags gain the paired synergy effect (e.g., Venom + Fortress = Toxic Bulwark).</li>
  <li><strong>T2 — Mastery (60 XP, ~8 turns):</strong> Enhanced domain effects. Critically, T2 is the threshold for <strong>Emergent Rule</strong> eligibility — domains at T2+ count toward the 3-domain patterns that unlock emergent triple stacks.</li>
  <li><strong>T3 — Transcendence (100 XP, ~13 turns):</strong> The ultimate domain effect. Each domain has a unique T3 bonus, with an extra-powerful version for your <strong>native</strong> domain. T3 deepens one domain but does not unlock new synergy tiers — pair synergies already work at T1.</li>
</ul>

<h3>Pair Synergies (55 total)</h3>
<p>When your faction knows two different domains (both at T1 or higher), any unit carrying tags from both domains gains a <strong>pair synergy</strong>. For example, a unit with both <em>poison</em> and <em>fortress</em> tags gains <strong>Toxic Bulwark</strong> (poison aura around fortress units) as soon as both domains are in your tree. You don't need to research to T3 for pair synergies — they activate at T1. There are 55 pair synergies covering every two-domain combination. Check the <strong>Synergies</strong> tab to browse them all.</p>

<h3>Emergent Triple Stacks</h3>
<p>When your faction reaches <strong>T2 in 3 domains</strong> that match a specific pattern, you unlock a powerful faction-wide bonus called an <strong>Emergent Rule</strong>. These are the ultimate builds — examples include <em>Ghost Army</em> (3 mobility domains = ignore all terrain penalties), <em>Iron Turtle</em> (fortress + heavy + terrain = damage reflection + zone control), and <em>Withering Citadel</em> (venom + fortress + healing = sustained poison fortress). The patterns vary — some require 3 domains from the same category (all mobility), others require 1 from each of 3 categories (terrain + combat + mobility). These are the endgame goals you build toward across the entire match.</p>

<h3>How It Plays Out — An Example</h3>
<p>You're playing <strong>Jungle Clans</strong> (native: Venom). You send your Serpent God into Steppe Rider territory and kill one of their units — the Serpent God learns <strong>Skirmish Pursuit</strong> (the Steppe Riders' native domain). The faction immediately codifies it, so Skirmish Pursuit appears in your research tree at T1. Right away, any unit with both <em>poison</em> and <em>skirmish</em> tags gains the <strong>Poisoned Skirmish</strong> pair synergy: after retreating, the unit leaves a poison trap on the hex it vacated. Now you research Skirmish Pursuit to T2, and if you acquire a third domain at T2 matching an emergent pattern, you unlock a game-changing Emergent Rule. <em>That's the loop.</em></p>

<h3>Strategic Tips</h3>
<ul>
  <li><strong>Exposure is your steadiest domain acquisition path</strong> — simply having units near enemies accumulates domain exposure automatically, adding foreign domains to your research tree with T1 completed for free.</li>
  <li><strong>Pair synergies activate at T1</strong> — as soon as both domains are in your tree, units with the right tags get the synergy. You don't need T3 for pairs.</li>
  <li><strong>Breadth before depth</strong> — T2 in three domains unlocks emergent rules, which are far more impactful than T3 in one domain. Spread your XP early to hit 3 domains at T2.</li>
  <li><strong>Prioritize domains that synergize with your native domain</strong> — check the Synergies tab to plan which foreign domains will combo best with what you already have.</li>
</ul>
`,
  },

  tribes: [
    {
      id: 'jungle_clan',
      name: 'Jungle Clans',
      color: '#2f7d4a',
      nativeDomain: 'venom',
      homeBiome: 'Jungle',
      intro: 'The Jungle Clans thrive where others fear to tread — deep in the canopy, where poison drips from every leaf and visibility ends at arm\'s reach. Their units move through dense jungle as naturally as you walk down a hallway, turning hostile terrain into a weapon. Their signature unit, the Serpent God, is a terrifying summon that emerges from the undergrowth to shatter enemy formations. Thanks to their Jungle Stalkers trait, enemy scouts rarely spot them until it\'s way too late.',
      strengths: [
        'Jungle interiors are your kingdom. Enemies who enter fight blind while you strike from concealment — use the canopy to set up ambushes on anyone foolish enough to chase you.',
        'Poison warfare means even battles you don\'t win outright still hurt. Enemies limp away damaged, making follow-up attacks devastating.',
        'Attritional play suits you perfectly. Drag fights into the jungle, chip away, and watch opponents bleed out trying to root you out.',
      ],
      weaknesses: [
        'Long-range armies that sit outside the jungle and shell you are your worst nightmare. If you can\'t close the distance, you\'re just targets in trees.',
        'You struggle badly on open ground. Leaving your biome strips away most of your advantages — don\'t get dragged into fights on plains.',
      ],
      tip: 'Lure enemies into the jungle by retreating with a sacrificial unit, then spring your real force on them once they\'re deep in the canopy. The Serpent God is perfect for this — let them chase, then summon behind them.',
    },
    {
      id: 'druid_circle',
      name: 'Druid Circle',
      color: '#5d8f57',
      nativeDomain: 'nature_healing',
      homeBiome: 'Forest',
      intro: 'The Druid Circle believes the forest itself fights on their side — and honestly, it kind of does. Their Healing Druids passive means units recover faster when fighting near forest hexes, turning what should be costly victories for attackers into grinding stalemates. Their Druid Wizard unit can mend wounds mid-battle, keeping your front line alive long past when any normal army would have broken. If you like playing the long game and wearing opponents down through sheer endurance, these are your people.',
      strengths: [
        'Your units simply don\'t stay dead. Between the Healing Druids passive and the Druid Wizard\'s battlefield mending, you can sustain fights far longer than opponents expect.',
        'Forest terrain amplifies everything good about you. Fighting in woods? You\'re tankier, you heal faster, and enemies have to come to you.',
        'Patient defensive play is incredibly strong. Let attackers wear themselves out against your resilient warbands, then counter-attack with fresh units.',
      ],
      weaknesses: [
        'Fast shock cavalry can run circles around you before your healing kicks in. If you can\'t pin them down, they\'ll pick off your units one by one.',
        'Your offensive punch is modest. You\'re great at not losing, but actually crushing an enemy in a timely way takes real effort.',
      ],
      tip: 'Plant your forces just inside a forest edge and let enemies commit into the treeline. Your healing kicks in on forest hexes, so fight one step inside the woods — they\'ll take terrain penalties while you regenerate.',
    },
    {
      id: 'steppe_clan',
      name: 'Steppe Riders',
      color: '#b98a2f',
      nativeDomain: 'hitrun',
      homeBiome: 'Plains',
      intro: 'Speed is life for the Steppe Riders. These horse lords race across open plains, striking where enemies are weakest and vanishing before reinforcements arrive. Their Foraging Riders passive means their cavalry doesn\'t slow down to resupply — they eat on the move, keeping pressure on from turn one. Their signature Warlord unit rallies nearby cavalry with an aura boost, turning already-fast units into an absolute blur. If you like keeping opponents off-balance and never fighting fair, this is your faction.',
      strengths: [
        'You dictate when and where fights happen. Your Skirmish Pursuit domain deals +2 bonus damage whenever you win an exchange — press the advantage before enemies can recover.',
        'Supply isn\'t your problem. The Foraging Riders passive means long cavalry raids don\'t need logistics planning, letting you operate deep in enemy territory.',
        'Slow, stationary armies are free food. Your horse archers punish anyone who tries to form a static firing line on open ground.',
      ],
      weaknesses: [
        'Camel riders hard-counter your horses. Desert Nomads in particular will shut down your cavalry advantage — avoid that matchup on open terrain.',
        'Fortified spear walls on hills are a brick wall. You can\'t charge into a prepared hill position without bleeding units you can\'t afford to lose.',
      ],
      tip: 'Use a single fast unit as bait to draw enemy forces out of position, then hit their exposed flank with the rest of your cavalry. The Warlord\'s aura makes this devastating — keep him near the main strike group.',
    },
    {
      id: 'hill_clan',
      name: 'Hill Engineers',
      color: '#7a5b3f',
      nativeDomain: 'fortress',
      homeBiome: 'Hill',
      intro: 'The Hill Engineers are the faction that turns "sit there and dare them to attack" into an art form. Their Hill Engineering passive makes their fortifications stronger and their siege resistance absurd — good luck cracking a Hill Engineer city without a serious investment of resources. Their signature Catapult unit provides ranged firepower that most factions can\'t match, softening up attackers before they even reach your walls. They\'re not flashy, but they\'re the faction you underestimate at your peril.',
      strengths: [
        'Defensive positions are your superpower. A fortified hill hex held by Hill Engineers is one of the hardest nuts to crack in the entire game.',
        'Your Catapult gives you ranged punch that compensates for slower movement. Use it to bombard enemies as they approach your positions.',
        'Siege warfare is heavily tilted in your favor. Whether attacking or defending fortified positions, you get more value out of static fronts than anyone.',
      ],
      weaknesses: [
        'Armies that refuse to engage on your terms are deeply frustrating. If an opponent maneuvers around your forts and raids elsewhere, you\'re too slow to respond.',
        'Open-field fights without prepared positions expose your lack of mobility. If you\'re caught on flat ground without fortifications, you\'re just okay — not great.',
      ],
      tip: 'Fortify choke points between hills early, then use your Catapults to control the approaches. Don\'t chase — let enemies come to you. A single well-placed fort on a hill can hold off forces twice your size.',
    },
    {
      id: 'coral_people',
      name: 'Pirate Lords',
      color: '#2a9d8f',
      nativeDomain: 'slaving',
      homeBiome: 'Coast',
      intro: 'The Pirate Lords rule the coastlines and waterways, raiding settlements and growing rich off other people\'s misery. Their Greedy passive means they extract more resources from captured villages and plundered cities — every raid pays dividends. Their signature Galley unit dominates coastal waters, ferrying troops for lightning amphibious assaults that most factions can\'t respond to quickly enough. They\'re the faction that makes coastal cities everywhere nervous.',
      strengths: [
        'Coastal raiding is your bread and butter. Galley transports let you strike anywhere with a shoreline, and your Greedy passive means every captured settlement pays off big.',
        'Enemies near water are always vulnerable. Your amphibious assault capability means no coastal city is truly safe, creating constant pressure across the map.',
        'Economic snowballing through raids is uniquely powerful. Other factions need to build economies; you can steal yours.',
      ],
      weaknesses: [
        'Deep inland, you\'re out of your element. Once you\'re far from water, your mobility advantage evaporates and your army is just average.',
        'Land-locked factions that turtle inland are hard to crack. If there\'s no coast to raid, your economy engine sputters.',
      ],
      tip: 'Prioritize coastal cities and settlements for early raids — each one feeds your economy through the Greedy passive. Use Galleys to hop between targets faster than opponents can react. Don\'t waste time pushing deep inland until your coastal economy is humming.',
    },
    {
      id: 'desert_nomads',
      name: 'Desert Nomads',
      color: '#e9c46a',
      nativeDomain: 'camel_adaptation',
      homeBiome: 'Desert',
      intro: 'The Desert Nomads treat the scorching sands like a highway while other factions see them as a death trap. Their Desert Logistics passive means their units suffer far less attrition in desert terrain — where others wither, they thrive. Their signature Desert Immortals are elite shock troops that don\'t break, fighting at full strength even when supply lines would cripple any other army. They\'re the faction that turns the map\'s most hostile biome into a home-field advantage.',
      strengths: [
        'Desert terrain is your playground. Where other factions lose units to attrition and heat, you march through like it\'s a pleasant Sunday — use this to strike from angles nobody expects.',
        'Lean supply needs mean long campaigns don\'t drain you. Your Desert Logistics passive keeps your army fighting-fit far from base, letting you operate in areas others can\'t sustain.',
        'Horse-dependent factions are natural prey. Your camels don\'t spook like horses do, giving you a real edge against cavalry-heavy opponents in open terrain.',
      ],
      weaknesses: [
        'Heavy infantry in rough terrain can box you in. If an opponent occupies hills or forests and refuses to come out into the open, you\'ll struggle to dislodge them.',
        'Maps without significant desert corridors reduce your advantage considerably. You\'re still playable, but you lose the terrain edge that makes you special.',
      ],
      tip: 'Use desert corridors as invasion routes that other factions won\'t expect — they avoid the desert while you sprint through it. Hit them from the "impossible" direction and watch their lines collapse.',
    },
    {
      id: 'savannah_lions',
      name: 'Savannah Lions',
      color: '#d4a373',
      nativeDomain: 'charge',
      homeBiome: 'Savannah',
      intro: 'The Savannah Lions are all about one thing: momentum. Their Charge Momentum passive means their units hit harder after moving — the faster they come, the harder they smash. Their signature War Elephants are walking siege engines that trample through infantry like cardboard, and their charge bonuses make them genuinely terrifying on the approach. This is the faction for players who like to decide battles in a single thunderous collision.',
      strengths: [
        'First-contact power is unmatched. A full charge from Savannah Lions hits like a freight train — if your opening clash goes well, the battle is often over before it starts.',
        'Open ground maximizes everything good about you. Charge bonuses, elephant mobility, formation warfare — it all clicks on savannah and plains.',
        'Light infantry and skirmishers get crushed. Your charge mechanics specifically punish small, scattered units that can\'t absorb the impact.',
      ],
      weaknesses: [
        'Disciplined anti-large formations are your kryptonite. Focused missile fire and spear walls that brace for impact can turn your charging elephants into very expensive casualties.',
        'Terrain that slows your approach nullifies your charge bonus. Forests, hills, and jungles force you to fight at walking speed, where you\'re just decent.',
      ],
      tip: 'Don\'t charge headlong into spear walls. Angle your approach so War Elephants hit the flank or rear of enemy formations — the charge bonus is just as devastating from the side, but the defensive penalty is much worse for them.',
    },
    {
      id: 'river_people',
      name: 'River People',
      color: '#4f86c6',
      nativeDomain: 'river_stealth',
      homeBiome: 'River',
      intro: 'The River People treat waterways like roads — except these roads let them appear anywhere along the bank without warning. Their River Assault passive gives their units combat bonuses near rivers, and their River Stealth transcendence now lets true stealth units cloak nearby allies for surprise strikes. Their signature Ancient Alligator is a nightmare amphibious predator that can strike from water onto land, turning every river crossing into a potential ambush point. They\'re the faction that makes you nervous every time there\'s water on the map.',
      strengths: [
        'River corridors give you unmatched mobility and surprise. You can move forces along waterways faster than anyone, and your stealth means defenders rarely spot you in time.',
        'Once River Stealth reaches Tier 3, a single hidden scout can cloak adjacent allies and hand them full sneak-attack pressure. Your front line stops telegraphing which unit is actually dangerous.',
        'Cities split by waterways are incredibly vulnerable to you. Strike from the river side while the defender\'s attention is on land approaches — classic double-envelopment.',
        'Your River Assault passive means even routine fights near water tip in your favor. Try to keep engagements close to rivers whenever possible.',
      ],
      weaknesses: [
        'Getting dragged into dry, inland fights strips away your biggest advantages. Without water nearby, you\'re fighting on even ground — and "even" isn\'t where you want to be.',
        'Opponents who recognize your river dependency can bait you into unfavorable terrain. Don\'t chase too far from water just because you\'re winning.',
      ],
      tip: 'Map out river networks early — they\'re your highway system. Once you hit River Stealth Tier 3, keep one real stealth unit tucked behind your lead attackers so it cloaks the whole contact point. The Ancient Alligator still excels at river crossing ambushes: hide one in a river hex near a crossing point and let enemies walk into it.',
    },
    {
      id: 'frost_wardens',
      name: 'Arctic Wardens',
      color: '#a8dadc',
      nativeDomain: 'heavy_hitter',
      homeBiome: 'Tundra',
      intro: 'The Arctic Wardens are the faction that turns the game\'s worst terrain into the best neighborhood. Their Cold-Hardened Growth passive means they get better economic returns from poor land than anyone else — while other factions look at tundra and see wasteland, the Wardens see opportunity. Their signature Polar Bear unit is a heavy-hitting beast that thrives in cold terrain, and their overall toughness makes them surprisingly hard to dislodge from frozen positions. They\'re a slow-burn faction that rewards patience and terrain awareness.',
      strengths: [
        'Poor terrain is your advantage, not a problem. You grow stronger on tundra, hills, and marginal land while opponents fight over the "good" real estate — and then you attack them while they\'re overextended.',
        'Economic resilience is unmatched. Your Cold-Hardened Growth passive means you can build a functioning economy on land other factions can\'t even farm effectively.',
        'Heavy units like the Polar Bear hit extremely hard in sustained fights. You may not be fast, but you hit like a truck once you arrive.',
      ],
      weaknesses: [
        'Rich agrarian economies will out-produce you if left unchecked. A faction with fertile land and time to build will eventually overwhelm you with sheer numbers.',
        'Your slow expansion means fast factions can grab key positions before you get there. You need to plan your expansion routes carefully.',
      ],
      tip: 'Don\'t compete for the fertile center early — claim tundra and marginal hexes that others ignore. You\'ll get solid income from "worthless" land, while opponents waste resources fighting each other over the good stuff. By mid-game, you\'ll have a quiet economic base they never saw coming.',
    },
  ],

  synergyGuide: [
    { pairId: 'venom+fortress', playerDescription: 'Your fortress units leak poison into the air around them. Anything standing within 1 hex takes 2 damage per turn — no attack needed. Phenomenal for holding choke points. Enemies can\'t approach without burning.' },
    { pairId: 'venom+charge', playerDescription: 'Charging with venom doubles your poison duration. Enemies knocked back land in their new position already coated in toxins. Essential for elephant poison builds — every charge is a two-for-one.' },
    { pairId: 'venom+hitrun', playerDescription: 'After a hit-and-run retreat, your unit leaves a poison trap on the hex it just vacated. Pursuers step right into 2 damage per turn plus a movement slow. Great for baiting aggressive enemies into a death march.' },
    { pairId: 'venom+tidal_warfare', playerDescription: 'Naval poison units contaminate coastal hexes, dealing 2 damage per turn to anything standing on the shore. Zone control from the water. Forces enemies to abandon coastline positions or burn.' },
    { pairId: 'venom+nature_healing', playerDescription: 'Poisoned enemies heal at only 50% effectiveness. This shuts down druid stacking and regeneration builds completely. Pair with sustained poison pressure to make attrition fights unwinnable for the opponent.' },
    { pairId: 'venom+river_stealth', playerDescription: 'A stealth ambush backed by venom deals double damage, instantly applies 2 poison stacks, and costs the victim 1 action point to respond. The hardest opener in the game. Devastating when you control sight lines.' },
    { pairId: 'venom+camel_adaptation', playerDescription: 'Camel poison units weaponize difficult terrain itself. Enemies standing in desert or mountain hexes near your camel take 2 passive poison damage per turn. Turns the map against them. Niche but oppressive on desert-heavy maps.' },
    { pairId: 'venom+slaving', playerDescription: 'Captured units are poisoned at 3 damage per turn, making them ticking time bombs. Your slave armies gain +25% damage output but heal at only half rate — disposable shock troops that hit harder than they should.' },
    { pairId: 'venom+heavy_hitter', playerDescription: 'Heavy strikes ignore 50% of enemy armor when the target is already poisoned. Every poison stack amplifies the heavy hit further. Stack poison first, then send in the hammer. Core combo for any poison-focused army.' },
    { pairId: 'venom+venom', playerDescription: 'Poison damage multiplies instead of stacking linearly. Two poison sources deal 3× damage; three sources hit 6×. The scaling is absurd. Building around double-venom is the fastest way to melt anything with HP.' },
    { pairId: 'fortress+charge', playerDescription: 'Charging near fortress allies grants a charge shield — the first hit after you charge deals zero damage to you. Lets elephant units dive into enemy lines without fear. Incredible for aggressive fortress plays.' },
    { pairId: 'fortress+hitrun', playerDescription: 'After retreating, the unit digs in for one turn with +75% defense. You get the mobility of skirmish and the resilience of a fortification in alternating turns. Punishes enemies who chase without thinking.' },
    { pairId: 'fortress+tidal_warfare', playerDescription: 'Naval fortress units project a +30% defense aura onto adjacent land hexes. Park your ships near the coast and your land forces fight like they\'re behind walls. Excellent for amphibious defensive positions.' },
    { pairId: 'fortress+nature_healing', playerDescription: 'Combining fortress and healing creates a 2-hex healing aura where allies recover 3 HP per turn. The tradeoff: the unit cannot be moved. Think of it as a mobile hospital that becomes stationary once deployed.' },
    { pairId: 'fortress+river_stealth', playerDescription: 'A stealth fortress is invisible until it attacks or an enemy walks adjacent. Imagine a fortification that doesn\'t exist — until you\'re already next to it. Brutal ambush defense. Enemies never see the wall coming.' },
    { pairId: 'fortress+camel_adaptation', playerDescription: 'Camel fortress units ignore terrain penalties and project a fortress aura on desert hexes. Build fortifications where nobody else can, with +30% defense in the harshest terrain. Desert maps become your fortress.' },
    { pairId: 'fortress+slaving', playerDescription: 'Fortress units guarding captured slaves gain +50% defense, and those slaves cannot escape. Build a prison that literally cannot be broken. Great for locking down high-value captives deep in your territory.' },
    { pairId: 'fortress+heavy_hitter', playerDescription: 'Heavy units in fortress formation reflect 25% of incoming damage back to attackers and cannot be displaced by knockback. An immovable wall that punishes you for hitting it. Core defensive anchor for late-game armies.' },
    { pairId: 'fortress+fortress', playerDescription: 'Overlapping fortress auras stack at +50% each instead of the normal +30%. Cluster your fortress units to create zones where the defense bonus scales exponentially. The more forts you stack, the harder the position becomes.' },
    { pairId: 'charge+hitrun', playerDescription: 'Units with both charge and skirmish can charge, retreat, and charge again in the same turn if they have the movement points. Hit-and-run on steroids. The mobility ceiling is absurd if you manage your action economy well.' },
    { pairId: 'charge+tidal_warfare', playerDescription: 'Naval charges become devastating rams that knock enemy ships 1 hex back. Combines charge burst damage with positional disruption on the water. Dominates ship-to-ship combat and pushes enemies into worse positions.' },
    { pairId: 'charge+nature_healing', playerDescription: 'Charging units near healers recover 100% of the damage they deal as HP. You charge in, deal massive damage, and come out healthier than you went in. The ultimate sustain charge combo. Nearly unkillable on offense.' },
    { pairId: 'charge+river_stealth', playerDescription: 'Charging from stealth deals +50% damage from surprise, but reveals you until your next turn. One devastating alpha strike per stealth cycle. Best used to eliminate high-value targets before they can react.' },
    { pairId: 'charge+camel_adaptation', playerDescription: 'Camel charges through desert deal 2 AoE damage to adjacent enemies and raise a sandstorm that gives all nearby enemies -25% accuracy. Area denial on top of burst damage. Phenomenal for desert battles where you charge into clusters.' },
    { pairId: 'charge+slaving', playerDescription: 'Charge attacks have a 30% chance to capture the target instead of killing it. Captured units join your faction immediately. Every charge is a recruitment drive. Build elephant-cavalry armies and watch your roster grow mid-fight.' },
    { pairId: 'charge+heavy_hitter', playerDescription: 'Heavy charges deal massive knockback and stun enemies for 1 full turn. The charger also ignores opportunity attacks when moving through enemy zones. Nothing stops the momentum. Devastating against fortified positions.' },
    { pairId: 'charge+charge', playerDescription: 'When two or more charge units attack from adjacent hexes simultaneously, the knockback becomes a 2-hex push and stuns for 1 turn. Formation charges become artillery. Coordinate your elephants for maximum impact.' },
    { pairId: 'hitrun+tidal_warfare', playerDescription: 'Naval hit-and-run units retreat into water after attacking. Land-based enemies cannot retaliate. Attack from the shore, vanish into the waves. Perfect for coastal harassment — hit docks and coastal cities with impunity.' },
    { pairId: 'hitrun+nature_healing', playerDescription: 'Skirmish units heal for 3 HP every time they retreat. Chip away at the enemy, fall back, recover, and repeat. Sustained harassment with built-in sustain. Very hard to kill if you alternate attacks and retreats.' },
    { pairId: 'hitrun+river_stealth', playerDescription: 'Stealth skirmishers automatically re-enter stealth after attacking and retreating — no cooldown, no delay. Perpetual hit-and-run from the shadows. The enemy never knows where the next strike comes from. Core stealth build.' },
    { pairId: 'hitrun+camel_adaptation', playerDescription: 'Horse and camel skirmishers can retreat through impassable terrain — mountains, cliffs, any obstacle. You can chase them, but you can\'t follow. Elite kiting on rough terrain maps. Nearly impossible to pin down.' },
    { pairId: 'hitrun+slaving', playerDescription: 'Hit-and-run attacks have a 15% chance to capture wounded enemies below 50% HP. Weaken them with skirmish fire, then snatch them on retreat. Slow but reliable slave generation from any fight you\'re winning.' },
    { pairId: 'hitrun+heavy_hitter', playerDescription: 'Heavy units with skirmish take 30% less damage when retreating and can retreat through enemy-occupied hexes. A heavy that can disengage at will and barely takes damage doing so. Breaks the usual heavy unit weakness of getting surrounded.' },
    { pairId: 'hitrun+hitrun', playerDescription: 'Skirmish units that retreat near another skirmish ally gain +1 movement on their next turn. Swarm coordination — the more skirmishers you field, the faster they all become. Scales with army size. Core for skirmish-focused compositions.' },
    { pairId: 'tidal_warfare+nature_healing', playerDescription: 'Naval healing units project a 2-hex healing aura from water onto adjacent land hexes. Friendly land units near your ships heal 2 HP per turn. Park your healer ships near the front line for mobile field hospitals.' },
    { pairId: 'tidal_warfare+river_stealth', playerDescription: 'Stealth naval units can make amphibious landings without breaking stealth. Disembark invisible troops directly onto the beach. Perfect for coastal invasions — the enemy sees your ships but not the forces you\'ve already landed.' },
    { pairId: 'tidal_warfare+camel_adaptation', playerDescription: 'Camel units adjacent to water gain +25% defense and +1 movement. They patrol desert and shoreline with equal ease. Versatile for maps with mixed terrain. Strong for defending coastal desert cities.' },
    { pairId: 'tidal_warfare+slaving', playerDescription: 'Naval units gain +30% capture chance on coastal hexes. Raid enemy shores and drag captives back to your ships. Naval slave raids are fast, safe, and highly productive. Core combo for coastal slaver strategies.' },
    { pairId: 'tidal_warfare+heavy_hitter', playerDescription: 'Heavy naval units deal massive ram damage and ignore enemy armor entirely. Ship-to-ship, nothing survives a heavy ram. Your heavy ships become battering rams that shred armor. Dominates any naval engagement.' },
    { pairId: 'tidal_warfare+tidal_warfare', playerDescription: 'Multiple naval units in formation project an extended control zone — all enemy ships within 3 hexes of any fleet member suffer -20% attack. Fleet coordination suppresses enemy navy just by existing near them. Numbers matter.' },
    { pairId: 'nature_healing+river_stealth', playerDescription: 'Stealth healers can restore HP without breaking their stealth state. Heal your army from the shadows, invisible and untouchable. The enemy can\'t prioritize your healers if they can\'t see them. Core for stealth support builds.' },
    { pairId: 'nature_healing+camel_adaptation', playerDescription: 'Camel healing units create an oasis: the hex they occupy and all adjacent hexes count as neutral terrain for movement. Your entire army ignores terrain penalties near the healer. Mobile terrain conversion. Incredibly strong on harsh maps.' },
    { pairId: 'nature_healing+slaving', playerDescription: 'Slave units regenerate 2 HP per turn but deal 25% less damage. Slaves near healing units heal at double rate. Keeps your expendable units alive longer at the cost of offensive output. Ideal for slave-wall strategies.' },
    { pairId: 'nature_healing+heavy_hitter', playerDescription: 'Heavy units regenerate 30% of all damage they deal as HP. The harder they hit, the more they heal. Sustain through prolonged fights just by swinging. Turns heavy units into self-healing juggernauts. Core combo for heavy sustain builds.' },
    { pairId: 'nature_healing+nature_healing', playerDescription: 'Double healing sources create a massive 3-hex aura: allies within range heal 4 HP per turn, and the unit itself regenerates 6 HP per turn. The strongest healing in the game. Build your entire army around protecting this unit.' },
    { pairId: 'river_stealth+camel_adaptation', playerDescription: 'Camel stealth units in desert terrain are permanently invisible — no cooldown, no proximity reveal, nothing. Desert becomes a kill zone where your enemies literally cannot see the threat. Map-defining on desert-heavy worlds.' },
    { pairId: 'river_stealth+slaving', playerDescription: 'Stealth attacks have a 40% chance to capture enemies instead of killing them, and captured units don\'t alert nearby enemies. Silent recruitment from the shadows. Extremely high-value for building slave armies without triggering alarms.' },
    { pairId: 'river_stealth+heavy_hitter', playerDescription: 'Heavy attacks from stealth permanently shred 100% of enemy armor. One hit from stealth and the target has zero armor for the rest of the fight. The ultimate assassin opener. Send in the heavy stealth unit first, then everyone else benefits.' },
    { pairId: 'river_stealth+river_stealth', playerDescription: 'Multiple stealth units within 3 hexes share stealth state. Killing or revealing one reveals nothing about the others. Shadow networks make your stealth units exponentially harder to root out. The more you field, the stronger the system becomes.' },
    { pairId: 'camel_adaptation+slaving', playerDescription: 'Slave caravans move 1 hex faster across desert terrain and traverse any desert without penalty. Logistics solved for desert maps. Keeps your slave economy flowing even through the harshest terrain. Essential for desert slaver strategies.' },
    { pairId: 'camel_adaptation+heavy_hitter', playerDescription: 'Heavy camel units project a sandstorm aura with 2-hex radius, inflicting -30% accuracy on all enemies inside. Your heavy units become walking weather systems that blind the enemy. Dominates open desert battles where positioning is everything.' },
    { pairId: 'camel_adaptation+camel_adaptation', playerDescription: 'Horse and camel units within 3 hexes share terrain ignore — if one unit can traverse a terrain type, all units in the network can. Terrain mastery spreads through proximity. Scales beautifully with larger armies. Core for any terrain-heavy strategy.' },
    { pairId: 'slaving+slaving', playerDescription: 'Multiple slave units fighting together gain +25% attack but suffer -15% defense. Quantity over quality — your slave swarm hits harder as it grows. Risky if caught out, but devastating when you have numbers. Core for slave army compositions.' },
    { pairId: 'slaving+heavy_hitter', playerDescription: 'Heavy units commanding slaves boost slave damage by 50%, and nearby slaves cannot rout. Your enforcers keep the fodder in line and hitting hard. The backbone of any serious slave army. Always keep heavy units near your slave clusters.' },
    { pairId: 'heavy_hitter+heavy_hitter', playerDescription: 'Heavy units fighting together knock enemies back 1 hex on every single hit. The front line becomes a battering ram that shoves everything backward. Disrupts enemy formations with every exchange. Core for heavy-heavy compositions.' },
  ],
};
