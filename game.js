/*
 * Core game logic for the Run and Choose endless runner.  The code uses
 * vanilla JavaScript and HTML5 Canvas – no external libraries are required.
 * When the page loads it registers a service worker (if available) and
 * resizes the canvas to fill the screen.  Assets are loaded from the
 * `assets` directory.  The game consists of 10 levels of increasing
 * difficulty.  At regular intervals the player must choose a power‑up
 * (sword or magic wand) which determines whether they can defeat
 * subsequent monsters.  If all monsters in a level are defeated the
 * player advances; otherwise losing all hearts ends the game.  The
 * progressive web app can be installed on Android devices and will
 * function offline【92065133406526†L136-L150】.
 */

(() => {
  // Register the service worker to enable offline support.  Browsers that
  // support service workers will cache all assets defined in
  // `service-worker.js`.  According to MDN, installed PWAs behave like
  // platform‑specific apps with their own icon and standalone display
  //【92065133406526†L136-L150】.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Resize the canvas to fit the display.  Listen for resize events so
  // orientation changes on mobile are handled gracefully.
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Asset definitions.  In this variant of the project all image files live
  // in the root of the site rather than inside an `assets` folder.  Keeping
  // the assets at the root simplifies deploying to GitHub Pages because
  // GitHub’s upload UI doesn’t allow folder uploads.  Each entry
  // corresponds to a PNG file committed alongside this script.
  const ASSETS = {
    hero: 'hero.png',
    sword: 'sword.png',
    wand: 'wand.png',
    monster1: 'monster1.png',
    monster2: 'monster2.png',
    background: 'background.png'
  };

  function loadImages(assetList) {
    return new Promise((resolve) => {
      const images = {};
      let loaded = 0;
      const keys = Object.keys(assetList);
      const total = keys.length;
      keys.forEach((key) => {
        const img = new Image();
        img.src = assetList[key];
        img.onload = img.onerror = () => {
          images[key] = img;
          loaded++;
          if (loaded === total) resolve(images);
        };
      });
    });
  }

  // Heart drawing helper.  Draws a heart shape at (x, y) with the given
  // size and color.  Hearts are drawn using bezier curves.
  function drawHeart(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const topCurveHeight = size * 0.3;
    ctx.moveTo(x, y + topCurveHeight);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(
      x - size / 2,
      y + (size + topCurveHeight) / 2,
      x,
      y + (size + topCurveHeight) / 2,
      x,
      y + size
    );
    ctx.bezierCurveTo(
      x,
      y + (size + topCurveHeight) / 2,
      x + size / 2,
      y + (size + topCurveHeight) / 2,
      x + size / 2,
      y + topCurveHeight
    );
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Define level parameters.  Each level has a monsterCount (how many
  // monsters must be defeated) and a base speed.  Later levels spawn
  // monsters faster and move the background more quickly to increase
  // difficulty.
  const LEVELS = [
    { monsterCount: 5, speed: 2.0 },
    { monsterCount: 8, speed: 2.2 },
    { monsterCount: 10, speed: 2.5 },
    { monsterCount: 12, speed: 2.8 },
    { monsterCount: 14, speed: 3.1 },
    { monsterCount: 16, speed: 3.4 },
    { monsterCount: 18, speed: 3.7 },
    { monsterCount: 20, speed: 4.0 },
    { monsterCount: 22, speed: 4.3 },
    { monsterCount: 25, speed: 4.6 }
  ];

  class Hero {
    constructor(img) {
      this.img = img;
      this.x = 0;
      this.y = 0;
      this.width = 80;
      this.height = 80;
      this.weapon = 'sword';
    }
    // Position the hero relative to the canvas size.  Called when
    // starting a level or when resizing the canvas.
    resetPosition() {
      this.width = canvas.height * 0.15;
      this.height = this.width;
      this.x = canvas.width * 0.1;
      this.y = canvas.height - this.height - canvas.height * 0.1;
    }
    draw(ctx) {
      ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
      // Optionally draw a small indicator of the current weapon.
      const iconSize = this.width * 0.4;
      const iconX = this.x + this.width * 0.3;
      const iconY = this.y - iconSize * 0.8;
      const weaponImg = this.weapon === 'sword' ? images.sword : images.wand;
      ctx.drawImage(weaponImg, iconX, iconY, iconSize, iconSize);
    }
    getBounds() {
      return { x: this.x, y: this.y, w: this.width, h: this.height };
    }
  }

  class Monster {
    constructor(type, img) {
      this.type = type; // 'beast' or 'ghost'
      this.img = img;
      this.x = canvas.width + Math.random() * canvas.width * 0.5;
      this.speed = 0;
      this.width = canvas.height * 0.12;
      this.height = this.width;
      this.y = canvas.height - this.height - canvas.height * 0.1;
      // Determine which weapon defeats this monster.  Beasts require
      // swords, ghosts require magic.
      this.required = type === 'beast' ? 'sword' : 'magic';
    }
    update(dt, baseSpeed) {
      // Monsters move left at the current level speed.
      this.x -= baseSpeed * dt;
    }
    draw(ctx) {
      ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
    }
    offscreen() {
      return this.x + this.width < 0;
    }
    getBounds() {
      return { x: this.x, y: this.y, w: this.width, h: this.height };
    }
  }

  class Game {
    constructor(images) {
      this.images = images;
      this.levelIndex = 0;
      this.reset();
    }
    reset() {
      this.monsters = [];
      this.spawnTimer = 0;
      this.spawnInterval = 1000; // milliseconds; will be adjusted per level
      this.monstersSpawned = 0;
      this.monstersDefeated = 0;
      this.monstersToSpawn = 0;
      this.nextChoiceAt = 0;
      this.hearts = 3;
      this.hero = new Hero(this.images.hero);
      this.bgX = 0;
      this.gameState = 'intro'; // 'intro','choice','playing','levelEnd','gameOver'
      this.choiceActive = false;
      this.leftOption = 'sword';
      this.rightOption = 'magic';
    }
    startLevel(index) {
      this.levelIndex = index;
      const level = LEVELS[index];
      this.hearts = 3;
      this.monsters = [];
      this.spawnTimer = 0;
      // spawnInterval gets slightly faster for later levels
      this.spawnInterval = Math.max(400, 1000 - index * 50);
      this.monstersSpawned = 0;
      this.monstersDefeated = 0;
      this.monstersToSpawn = level.monsterCount;
      // Show a choice every 3 monsters, but ensure at least one choice
      this.nextChoiceAt = Math.min(3, this.monstersToSpawn);
      this.hero.resetPosition();
      this.hero.weapon = 'sword';
      this.bgX = 0;
      this.gameState = 'choice';
      this.choiceActive = true;
      // Randomize first choice to keep the game fresh
      this.randomizeChoices();
    }
    randomizeChoices() {
      // Randomly swap the positions of sword and magic options so the
      // player can't always rely on left being sword.
      if (Math.random() < 0.5) {
        this.leftOption = 'sword';
        this.rightOption = 'magic';
      } else {
        this.leftOption = 'magic';
        this.rightOption = 'sword';
      }
    }
    spawnMonster() {
      // Randomly choose a monster type.  50% chance each.
      const type = Math.random() < 0.5 ? 'beast' : 'ghost';
      const img = type === 'beast' ? this.images.monster1 : this.images.monster2;
      const m = new Monster(type, img);
      this.monsters.push(m);
      this.monstersSpawned++;
    }
    update(delta) {
      const level = LEVELS[this.levelIndex];
      const speed = level.speed;
      // Advance background for parallax scrolling
      this.bgX -= speed * delta;
      const bgWidth = canvas.width;
      if (this.bgX <= -bgWidth) {
        this.bgX += bgWidth;
      }
      if (this.gameState === 'playing') {
        // Spawn monsters over time
        this.spawnTimer += delta * 1000; // delta is in seconds
        if (this.monstersSpawned < this.monstersToSpawn && this.spawnTimer >= this.spawnInterval) {
          this.spawnTimer = 0;
          this.spawnMonster();
        }
        // Update monsters
        for (let i = this.monsters.length - 1; i >= 0; i--) {
          const m = this.monsters[i];
          m.update(delta * 100, speed); // scale delta for smoothness
          if (m.offscreen()) {
            // Monster escaped: treat as defeated for progress purposes
            this.monsters.splice(i, 1);
            this.monstersDefeated++;
          }
        }
        // Collision detection
        const heroBounds = this.hero.getBounds();
        for (let i = this.monsters.length - 1; i >= 0; i--) {
          const m = this.monsters[i];
          const b = m.getBounds();
          if (b.x < heroBounds.x + heroBounds.w * 0.7 &&
              b.x + b.w > heroBounds.x + heroBounds.w * 0.3 &&
              b.y < heroBounds.y + heroBounds.h &&
              b.y + b.h > heroBounds.y) {
            // Collision occurred
            if (this.hero.weapon === (m.type === 'beast' ? 'sword' : 'magic')) {
              // Defeated
              this.monsters.splice(i, 1);
              this.monstersDefeated++;
            } else {
              // Wrong weapon: lose a heart
              this.monsters.splice(i, 1);
              this.hearts--;
              this.monstersDefeated++;
              // Briefly flash the hero red to indicate damage (handled in draw)
              this.damageFlash = 0.2; // seconds
            }
          }
        }
        // Damage flash timer
        if (this.damageFlash !== undefined) {
          this.damageFlash -= delta;
          if (this.damageFlash <= 0) this.damageFlash = undefined;
        }
        // Check for next choice
        if (!this.choiceActive && this.monstersDefeated >= this.nextChoiceAt && this.monstersDefeated < this.monstersToSpawn) {
          this.choiceActive = true;
          this.gameState = 'choice';
          this.randomizeChoices();
          // Advance the threshold for the next choice
          this.nextChoiceAt = Math.min(this.nextChoiceAt + 3, this.monstersToSpawn);
        }
        // Check for game over
        if (this.hearts <= 0) {
          this.gameState = 'gameOver';
        }
        // Check for level completion
        if (this.monstersDefeated >= this.monstersToSpawn && this.monsters.length === 0) {
          this.gameState = 'levelEnd';
        }
      }
    }
    draw() {
      // Draw sky background
      ctx.fillStyle = '#87ceeb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Draw scrolling background image twice for seamless looping
      const bgImg = this.images.background;
      const bgHeight = canvas.height;
      const bgWidth = bgImg.width * (bgHeight / bgImg.height);
      const x1 = this.bgX % bgWidth;
      ctx.drawImage(bgImg, x1, 0, bgWidth, bgHeight);
      ctx.drawImage(bgImg, x1 + bgWidth, 0, bgWidth, bgHeight);

      // Draw ground line
      ctx.fillStyle = '#654321';
      const groundHeight = canvas.height * 0.1;
      ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

      // Draw hero (with damage flash overlay if needed)
      if (this.damageFlash !== undefined) {
        // Tint hero red when damaged
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.filter = 'brightness(1.5)';
        this.hero.draw(ctx);
        ctx.restore();
      } else {
        this.hero.draw(ctx);
      }
      // Draw monsters
      for (const m of this.monsters) {
        m.draw(ctx);
      }
      // Draw UI: hearts and level text
      const heartSize = Math.min(canvas.width, canvas.height) * 0.04;
      const heartMargin = heartSize * 0.3;
      for (let i = 0; i < 3; i++) {
        const x = heartMargin + i * (heartSize + heartMargin);
        const y = heartMargin;
        if (i < this.hearts) {
          drawHeart(ctx, x, y, heartSize, '#e74c3c');
        } else {
          drawHeart(ctx, x, y, heartSize, 'rgba(0,0,0,0.2)');
        }
      }
      // Draw level label
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.min(canvas.width, canvas.height) * 0.05}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`Level ${this.levelIndex + 1}`, canvas.width - heartMargin, heartMargin + heartSize);
      // Draw score (monsters remaining)
      ctx.textAlign = 'left';
      ctx.fillText(`Remaining: ${Math.max(0, this.monstersToSpawn - this.monstersDefeated)}`, heartMargin, heartMargin + heartSize * 2.0);

      // Draw choice overlay
      if (this.gameState === 'choice') {
        ctx.save();
        // Dark translucent background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Text prompt
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `${Math.min(canvas.width, canvas.height) * 0.06}px sans-serif`;
        ctx.fillText('Choose your power!', canvas.width / 2, canvas.height * 0.25);
        // Draw option boxes
        const boxSize = Math.min(canvas.width, canvas.height) * 0.25;
        const gap = canvas.width * 0.05;
        const leftX = (canvas.width / 2) - gap/2 - boxSize;
        const rightX = (canvas.width / 2) + gap/2;
        const y = canvas.height * 0.4;
        // Draw backgrounds
        const drawOptionBox = (x, label) => {
          ctx.fillStyle = label === 'sword' ? '#f1c40f' : '#9b59b6';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = boxSize * 0.03;
          ctx.fillRect(x, y, boxSize, boxSize);
          ctx.strokeRect(x, y, boxSize, boxSize);
          const icon = label === 'sword' ? this.images.sword : this.images.wand;
          const iconSize = boxSize * 0.6;
          ctx.drawImage(icon, x + (boxSize - iconSize) / 2, y + (boxSize - iconSize) / 2, iconSize, iconSize);
        };
        drawOptionBox(leftX, this.leftOption);
        drawOptionBox(rightX, this.rightOption);
        // Instructions
        ctx.fillStyle = '#ecf0f1';
        ctx.font = `${Math.min(canvas.width, canvas.height) * 0.035}px sans-serif`;
        ctx.fillText('Tap left or right side', canvas.width / 2, y + boxSize + heartMargin * 4);
        ctx.restore();
      }
      // Draw level end or game over overlay
      if (this.gameState === 'levelEnd' || this.gameState === 'gameOver') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.min(canvas.width, canvas.height) * 0.08}px sans-serif`;
        const message = this.gameState === 'gameOver' ? 'Game Over' : (this.levelIndex === LEVELS.length - 1 ? 'You Win!' : `Level ${this.levelIndex + 1} Complete`);
        ctx.fillText(message, canvas.width / 2, canvas.height * 0.4);
        ctx.font = `${Math.min(canvas.width, canvas.height) * 0.04}px sans-serif`;
        const sub = this.gameState === 'gameOver' ? 'Tap to restart' : (this.levelIndex === LEVELS.length - 1 ? 'Tap to play again' : 'Tap to continue');
        ctx.fillText(sub, canvas.width / 2, canvas.height * 0.5);
        ctx.restore();
      }
    }
  }

  let images;
  let game;
  // Track last timestamp to compute delta for game updates
  let lastTimestamp;
  function loop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = (timestamp - lastTimestamp) / 1000; // seconds
    lastTimestamp = timestamp;
    if (game) {
      game.update(delta);
      game.draw();
    }
    requestAnimationFrame(loop);
  }

  // Input handling: respond to pointer and keyboard events
  function handleChoiceSelection(choice) {
    if (game.gameState !== 'choice') return;
    // Set hero weapon according to chosen option
    const selected = choice === 'left' ? game.leftOption : game.rightOption;
    game.hero.weapon = selected;
    game.choiceActive = false;
    game.gameState = 'playing';
  }
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (game.gameState === 'choice') {
      // Determine left or right based on horizontal position relative to center
      const choice = x < canvas.width / 2 ? 'left' : 'right';
      handleChoiceSelection(choice);
    } else if (game.gameState === 'levelEnd') {
      // Advance to next level or finish
      if (game.levelIndex < LEVELS.length - 1) {
        game.startLevel(game.levelIndex + 1);
      } else {
        // Completed final level: restart
        game.startLevel(0);
      }
    } else if (game.gameState === 'gameOver') {
      // Restart game from level 0
      game.startLevel(0);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (game.gameState === 'choice') {
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        handleChoiceSelection('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        handleChoiceSelection('right');
      }
    } else if (game.gameState === 'levelEnd') {
      if (e.key === ' ' || e.key === 'Enter') {
        if (game.levelIndex < LEVELS.length - 1) {
          game.startLevel(game.levelIndex + 1);
        } else {
          game.startLevel(0);
        }
      }
    } else if (game.gameState === 'gameOver') {
      if (e.key === ' ' || e.key === 'Enter') {
        game.startLevel(0);
      }
    }
  });

  // Begin loading assets.  Once images have loaded the first level
  // starts and the main loop begins.
  loadImages(ASSETS).then((imgs) => {
    images = imgs;
    game = new Game(images);
    game.startLevel(0);
    requestAnimationFrame(loop);
  });
})();