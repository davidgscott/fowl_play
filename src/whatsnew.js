// The WHAT'S NEW popup on the title screen.
//
// The copy here is written by hand on purpose. Commit subjects make miserable
// patch notes ("fix NaN in latch test" means nothing to a player), so the build
// stamp from vite.config.js only supplies the version number and freshness -
// everything a player actually reads lives in RELEASE_NOTES below.
//
// When we ship something new, add it here.
// NB: the headline is styled CSS text, not the game's 3x5 pixel font - that
// font's W is a near-twin of its H, so "WHAT'S NEW" renders as "HHATS HEH".

const RELEASE_NOTES = {
  headline: 'THE BIGGEST UPDATE YET',
  sections: [
    {
      title: 'NEW WEAPONS',
      icon: '🔥',
      tone: 'orange',
      items: [
        { name: 'MACHINE GUN', unlock: 'LVL 5',
          text: 'HOLD THE TRIGGER DOWN AND NEVER LET GO. 50 BULLETS PER MAG!' },
        { name: 'SNIPER RIFLE', unlock: 'LVL 7',
          text: 'ZOOM WAY IN AND POP A HEAD FROM CLEAR ACROSS THE MAP. ONE SHOT, ONE BIRD.' },
        { name: 'FLAMETHROWER', unlock: 'LVL 8',
          text: 'WHOOOOSH! ROAST A WHOLE FLOCK AT ONCE. WATCH YOUR FUEL.' },
        { name: 'A.A. FLAK CANNON', unlock: 'LVL 10',
          text: 'FOUR BARRELS. GIANT EXPLODING AIRBURSTS. NOW COSTS BIG MONEY.' },
        { name: 'SHARK LAUNCHER', unlock: 'LVL 12',
          text: 'LAUNCH A REAL LIVE SHARK INTO THE SKY! IT GRABS A BIRD, SHAKES IT LIKE CRAZY, THEN BITES IT CLEAN IN HALF!!' },
      ],
    },
    {
      title: 'NEW ENEMIES',
      icon: '🦢',
      tone: 'red',
      items: [
        { name: 'GEESE', unlock: 'LVL 3',
          text: 'BIGGER, MEANER AND FASTER THAN DUCKS - AND MORE OF THEM EVERY SINGLE LEVEL.' },
        { name: 'TUMMY TROUBLES', unlock: 'LVL 20',
          text: 'THE GIANT ALBATROSS BOSS. HE CARPET BOMBS YOU WITH POOP. GOOD LUCK!' },
        { name: 'ALBATROSS SQUADS', unlock: 'LVL 21',
          text: 'ENORMOUS WINGS. SUPER TOUGH. AND THEY KEEP BRINGING FRIENDS.' },
      ],
    },
    {
      title: 'NEW MOVES',
      icon: '⭐',
      tone: 'green',
      items: [
        { name: 'THE FLYING V', unlock: '3 ALLIES',
          text: 'FEED 3 DUCKS AND THEY LINE UP IN A V AND BLAST THROUGH EVERYTHING IN THEIR PATH!' },
        { name: 'RECRUIT A GOOSE', unlock: '5 BREAD',
          text: 'GEESE TAKE 5 BREAD INSTEAD OF 3. TOTALLY WORTH IT.' },
        { name: 'NOWHERE TO HIDE', unlock: 'ALL LEVELS',
          text: 'BIRDS NOW SWOOP IN FROM EVERY DIRECTION, NON-STOP. NO MORE BACKING AWAY!' },
      ],
    },
  ],
};

// Builds the popup inside `root`. `info` is the injected build stamp (may be
// null if git wasn't available at build time - the panel still works, it just
// shows no version chip).
export function renderWhatsNew(root, info) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.id = 'wn-card';

  const head = document.createElement('div');
  head.id = 'wn-head';
  head.textContent = "WHAT'S NEW!";
  card.appendChild(head);

  const sub = document.createElement('div');
  sub.id = 'wn-sub';
  sub.textContent = RELEASE_NOTES.headline;
  card.appendChild(sub);

  if (info && info.version) {
    const chip = document.createElement('div');
    chip.id = 'wn-chip';
    chip.textContent = info.fresh
      ? `${info.version} - JUST LANDED TODAY!`
      : `${info.version} - ${info.commits && info.commits[0] ? info.commits[0].date : 'LATEST'}`;
    card.appendChild(chip);
  }

  const body = document.createElement('div');
  body.id = 'wn-body';
  for (const section of RELEASE_NOTES.sections) {
    const sec = document.createElement('section');
    sec.className = `wn-section wn-${section.tone}`;

    const h = document.createElement('h2');
    h.innerHTML = `<span class="wn-icon"></span>`;
    h.querySelector('.wn-icon').textContent = section.icon;
    h.appendChild(document.createTextNode(` ${section.title}`));
    sec.appendChild(h);

    for (const item of section.items) {
      const row = document.createElement('div');
      row.className = 'wn-item';

      const name = document.createElement('div');
      name.className = 'wn-name';
      name.textContent = item.name;
      const badge = document.createElement('span');
      badge.className = 'wn-badge';
      badge.textContent = item.unlock;
      name.appendChild(badge);
      row.appendChild(name);

      const text = document.createElement('div');
      text.className = 'wn-text';
      text.textContent = item.text;
      row.appendChild(text);

      sec.appendChild(row);
    }
    body.appendChild(sec);
  }
  card.appendChild(body);

  const go = document.createElement('button');
  go.id = 'wn-go';
  go.textContent = "LET'S GO!";
  go.addEventListener('click', (e) => {
    e.stopPropagation();
    root.classList.add('hidden');
  });
  card.appendChild(go);

  root.appendChild(card);
  // the title screen starts the game on click - the popup must swallow its own
  root.addEventListener('click', (e) => e.stopPropagation());
}
