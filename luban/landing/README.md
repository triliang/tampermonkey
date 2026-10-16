# Luban landing page

The default `index.html` has been restored to the original light mint-green design. Run `npm run dev` from `luban` and visit `/landing/`. Interactive demos, FAQ and installation instructions remain available.

Alternative pixel editions remain as separate files and are not linked from the restored page.

# Luban pixel worlds

Run `npm run dev` from the `luban` directory and open `/landing/`.

Five complete landing-page editions share working local demos, FAQ accordions, installation instructions, and a world selector:

1. `index.html` — Mossvale Quest: woodland castle and forest adventure.
2. `version-2.html` — Neon District: neon city and cyberpunk streets.
3. `version-3.html` — Sunken Temple: underwater ruins and coral.
4. `version-4.html` — Ember Citadel: volcano, lava and fortress.
5. `version-5.html` — Lunar Outpost: moon base, rocket and rover.

Original canvas pixel artwork is generated locally by `pixel-scenes.js`, with five deterministic still scenes per edition. `pixel.css` controls the responsive game HUD and landing-page presentation. No image downloads or animation are required. Web fonts have local monospace/sans-serif fallbacks.

Demo content is illustrative and sends no AI requests. The article example exports CSV; focus mode can be restored; titles can be copied. Installation buttons explain loading the existing extension locally. The extension build configuration is unchanged.
