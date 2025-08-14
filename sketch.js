// toxiclibs.js setup
let VerletPhysics2D, Vec2D, Rect, VerletParticle2D, VerletSpring2D, GravityBehavior;
let physics;

let slimes = [];
const shapes = ['circle', 'square', 'triangle', 'bomb', 'arrow', 'killer', 'cluster', 'blackhole'];

// Create a weighted list of shapes to make bombs 10x less likely
const weightedShapes = [];
for (const shape of shapes) {
  if (shape === 'killer' || shape === 'arrow') {
    weightedShapes.push(shape);
  } else {
    for (let i = 0; i < 10; i++) {
      weightedShapes.push(shape);
    }
  }
}

// Cannon properties
let cannon;

// Painter Mode
let painterModeCheckbox;
let isPainterMode = true;
let debugModeCheckbox;

// Graphics buffer for persistent paint splatters
let paintCanvas;

let flowfield;

function setup() {
  createCanvas(windowWidth, windowHeight);
  paintCanvas = createGraphics(windowWidth, windowHeight);

  // --- UI Controls Setup ---
  painterModeCheckbox = select('#painterMode');
  painterModeCheckbox.changed(() => {
    isPainterMode = painterModeCheckbox.checked();
  });
  debugModeCheckbox = select('#debugMode');

  // Initialize toxiclibs
  VerletPhysics2D = toxi.physics2d.VerletPhysics2D;
  VerletParticle2D = toxi.physics2d.VerletParticle2D;
  VerletSpring2D = toxi.physics2d.VerletSpring2D;
  GravityBehavior = toxi.physics2d.behaviors.GravityBehavior;
  Vec2D = toxi.geom.Vec2D;
  Rect = toxi.geom.Rect;

  physics = new VerletPhysics2D();
  physics.setWorldBounds(new Rect(0, 0, width, height));
  physics.setDrag(0.0);

  flowfield = new FlowField(20);
  cannon = new Cannon(); // Create the cannon instance
  const numSlimes = 15;
  for (let i = 0; i < numSlimes; i++) {
    const radius = random(20, 50);
    const x = random(radius, width - radius);
    const y = random(radius, height - radius);
    const shape = random(weightedShapes);
    const col = color(random(100, 255), random(100, 255), random(100, 255), 60);

    if (shape === 'killer') {
      slimes.push(new KillerSlime(x, y, radius, p5.Vector.random2D().mult(2), col, shape));
    } else if (shape === 'cluster') {
      slimes.push(new ClusterSlime(x, y, radius, p5.Vector.random2D().mult(2), col));
    } else {
      slimes.push(new Slime(x, y, radius, p5.Vector.random2D().mult(2), col, shape));
    }
  }
}

function draw() {
  // Conditionally set the background based on painter mode
  if (isPainterMode) {
    // A low alpha value creates the "trail" effect by not fully clearing the previous frame.
    background(230, 240, 255, 30);
  } else {
    // The original, opaque background.
    background(230, 240, 255);
  }

  // Draw the persistent paint canvas
  image(paintCanvas, 0, 0);

  // Apply flow field force to ClusterSlime particles before updating the physics
  for (const slime of slimes) {
    if (slime instanceof ClusterSlime) {
      for (const p of slime.particles) {
        const p5pos = createVector(p.x, p.y);
        const p5force = flowfield.lookup(p5pos);
        p5force.mult(0.1); // Scale the force to a reasonable amount
        const toxiForce = new Vec2D(p5force.x, p5force.y);
        p.addForce(toxiForce);
      }
    }
  }

  // Update the physics world
  physics.update();

  let mergedIndices = new Set();
  let newSlimes = [];

  // Collision and merging logic
  for (let i = 0; i < slimes.length; i++) {
    for (let j = i + 1; j < slimes.length; j++) {
      if (mergedIndices.has(i) || mergedIndices.has(j)) {
        continue;
      }

      if (slimes[i].intersects(slimes[j])) {
        const slimeA = slimes[i];
        const slimeB = slimes[j];

        // --- BLACK HOLE CONSUMPTION LOGIC ---
        let blackHole = null;
        let otherSlime = null;
        let otherSlimeIndex = -1;

        if (slimeA instanceof BlackHoleSlime && !(slimeB instanceof BlackHoleSlime)) {
          blackHole = slimeA;
          otherSlime = slimeB;
          otherSlimeIndex = j;
        } else if (slimeB instanceof BlackHoleSlime && !(slimeA instanceof BlackHoleSlime)) {
          blackHole = slimeB;
          otherSlime = slimeA;
          otherSlimeIndex = i;
        }

        if (blackHole) {
          const areaBH = PI * pow(blackHole.r, 2);
          const areaOther = PI * pow(otherSlime.r, 2);
          const combinedArea = areaBH + areaOther;
          blackHole.r = sqrt(combinedArea / PI);

          if (otherSlime instanceof ClusterSlime) {
            otherSlime.destroy();
          }

          mergedIndices.add(otherSlimeIndex); // Mark the other slime for removal
        }
        // --- BOMB LOGIC ---
        else if (slimeA.shape === 'bomb' || slimeB.shape === 'bomb') {
          const explosionX = (slimeA.x + slimeB.x) / 2;
          const explosionY = (slimeA.y + slimeB.y) / 2;
          const splatterSize = slimeA.r + slimeB.r;
          createPaintSplatter(explosionX, explosionY, slimeA.color, slimeB.color, splatterSize);

          if (slimeA instanceof ClusterSlime) slimeA.destroy();
          if (slimeB instanceof ClusterSlime) slimeB.destroy();

          mergedIndices.add(i);
          mergedIndices.add(j);
        } else {
          // --- MERGE LOGIC ---
          const areaA = PI * pow(slimeA.r, 2);
          const areaB = PI * pow(slimeB.r, 2);
          const combinedArea = areaA + areaB;
          const newRadius = sqrt(combinedArea / PI);

          const newX = (slimeA.x * areaA + slimeB.x * areaB) / combinedArea;
          const newY = (slimeA.y * areaA + slimeB.y * areaB) / combinedArea;

          const newVel = p5.Vector.add(
            p5.Vector.mult(slimeA.vel, areaA),
            p5.Vector.mult(slimeB.vel, areaB)
          ).div(combinedArea);

          // Color merging logic
          const colorA = slimeA.color.levels;
          const colorB = slimeB.color.levels;
          const newR = (colorA[0] * areaA + colorB[0] * areaB) / combinedArea;
          const newG = (colorA[1] * areaA + colorB[1] * areaB) / combinedArea;
          const newB = (colorA[2] * areaA + colorB[2] * areaB) / combinedArea;
          const newColor = color(newR, newG, newB, colorA[3]); // Keep original alpha

          const isKiller = slimeA instanceof KillerSlime || slimeB instanceof KillerSlime;
          const isCluster = slimeA instanceof ClusterSlime || slimeB instanceof ClusterSlime;

          if (slimeA instanceof ClusterSlime) slimeA.destroy();
          if (slimeB instanceof ClusterSlime) slimeB.destroy();

          if (isKiller) {
            newSlimes.push(new KillerSlime(newX, newY, newRadius, newVel, newColor, 'killer'));
          } else if (isCluster) {
            newSlimes.push(new ClusterSlime(newX, newY, newRadius, newVel, newColor));
          } else {
            const newShape = slimeA.r > slimeB.r ? slimeA.shape : slimeB.shape;
            newSlimes.push(new Slime(newX, newY, newRadius, newVel, newColor, newShape));
          }

          mergedIndices.add(i);
          mergedIndices.add(j);
        }
      }
    }
  }

  // Create the next generation of slimes
  let nextGeneration = [];
  for (let i = 0; i < slimes.length; i++) {
    if (!mergedIndices.has(i)) {
      nextGeneration.push(slimes[i]);
    }
  }
  slimes = nextGeneration.concat(newSlimes);

  if (debugModeCheckbox.checked()) {
    flowfield.display();
  }

  // --- Black Hole Attraction Force ---
  const blackHoles = slimes.filter(s => s instanceof BlackHoleSlime);
  if (blackHoles.length > 0) {
    const G = 6; // Gravitational constant - tune for effect
    for (const bh of blackHoles) {
      for (const slime of slimes) {
        if (slime === bh || slime instanceof BlackHoleSlime) continue;

        const force = p5.Vector.sub(createVector(bh.x, bh.y), createVector(slime.x, slime.y));
        let distance = force.mag();
        distance = constrain(distance, 20, 200); // Avoid extreme forces

        // Using radius as a proxy for mass
        const strength = (G * (bh.r * slime.r)) / (distance * distance);
        force.setMag(strength);

        // Apply the force directly to velocity for a strong pull
        slime.vel.add(force);
      }
    }
  }

  for (let i = 0; i < slimes.length; i++) {
    if (slimes[i] instanceof KillerSlime) {
      slimes[i].move(slimes, flowfield);
    } else if (slimes[i] instanceof Slime) {
      slimes[i].move(flowfield);
    } else { // This will be ClusterSlime
      slimes[i].move();
    }
    slimes[i].display();
  }

  // Draw the cannon
  cannon.display();
}

function createPaintSplatter(x, y, c1, c2, splatterSize) {
  const numDroplets = floor(map(splatterSize, 20, 150, 50, 400));
  const baseRadius = splatterSize * 0.25; // The standard deviation for the splatter

  // Blend the colors of the two colliding slimes
  const splatterColor = lerpColor(c1, c2, 0.5);

  paintCanvas.push();
  paintCanvas.translate(x, y);
  for (let i = 0; i < numDroplets; i++) {
    // Use a Gaussian distribution for the distance from the center
    const distance = randomGaussian(0, baseRadius);
    const angle = random(TWO_PI);
    const dropletX = cos(angle) * distance;
    const dropletY = sin(angle) * distance;

    // Vary the size and transparency of each droplet
    const dropletSize = random(2, 10);
    const dropletAlpha = random(50, 150);

    paintCanvas.noStroke();
    paintCanvas.fill(red(splatterColor), green(splatterColor), blue(splatterColor), dropletAlpha);
    paintCanvas.ellipse(dropletX, dropletY, dropletSize, dropletSize);
  }
  paintCanvas.pop();
}


function mousePressed() {
  // Check for cannon click first
  if (cannon.isClicked(mouseX, mouseY)) {
    const radius = random(15, 30);
    const x = cannon.x;
    const y = cannon.y - cannon.h / 2; // Start at the nozzle
    const vel = createVector(random(-2, 2), -12); // Shoot upwards
    const shape = random(shapes.filter(s => s !== 'bomb' && s !== 'killer'));
    const col = color(random(100, 255), random(100, 255), random(100, 255), 60);

    if (shape === 'cluster') {
      slimes.push(new ClusterSlime(x, y, radius, vel, col));
    } else {
      slimes.push(new Slime(x, y, radius, vel, col, shape));
    }
    return; // Prevent further click checks
  }

  for (let i = slimes.length - 1; i >= 0; i--) {
    if (slimes[i].isClicked(mouseX, mouseY)) {
      if (slimes[i].r > 3.5) { // A general minimum size
        let newSlimes = slimes[i].split();
        if (newSlimes && newSlimes.length > 0) {
          slimes.push(newSlimes[0]);
          slimes.push(newSlimes[1]);
          slimes.splice(i, 1);
        }
      }
      break;
    }
  }
}

const expressions = ['default', 'happy', 'wink', 'surprised'];

// Slime class
class Slime {
  constructor(x, y, r, vel, col, shape) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.vel = vel || createVector();
    this.color = col || color(150, 255, 150, 60); // Provide a default color
    this.shape = shape || 'circle'; // Add shape property
    this.noiseSeed = random(1000);
    this.moveOffset = random(1000); // For Perlin noise-based movement
    this.expression = random(expressions);

    this.maxSpeed = 3;
    this.maxForce = 0.1;
  }

  split() {
    let newR = this.r * 0.707; // r / sqrt(2) to conserve area
    const separationSpeed = 5; // The "kick" speed

    // Create a random direction for the split
    let splitDir = p5.Vector.random2D();

    // Set opposite velocities for the two new slimes
    let newVel1 = p5.Vector.mult(splitDir, separationSpeed);
    let newVel2 = p5.Vector.mult(splitDir, -separationSpeed);

    // Position the new slimes along the split direction to prevent instant merging
    let posOffset1 = p5.Vector.mult(splitDir, newR + 1);
    let posOffset2 = p5.Vector.mult(splitDir, -newR - 1);
    
    // Accurately corrected color splitting logic to preserve color on merge.
    const parentR = red(this.color);
    const parentG = green(this.color);
    const parentB = blue(this.color);
    const parentA = alpha(this.color);

    // Calculate the valid range for the first slime's red component (r1)
    // to ensure the second component (r2) is also a valid color (0-255).
    const minR1 = max(0, 2 * parentR - 255);
    const maxR1 = min(255, 2 * parentR);
    const r1 = random(minR1, maxR1);
    const r2 = 2 * parentR - r1;

    const minG1 = max(0, 2 * parentG - 255);
    const maxG1 = min(255, 2 * parentG);
    const g1 = random(minG1, maxG1);
    const g2 = 2 * parentG - g1;

    const minB1 = max(0, 2 * parentB - 255);
    const maxB1 = min(255, 2 * parentB);
    const b1 = random(minB1, maxB1);
    const b2 = 2 * parentB - b1;

    const c1 = color(r1, g1, b1, parentA);
    const c2 = color(r2, g2, b2, parentA);

    // --- Black Hole Creation on Split ---
    const blackHoleChance = 0.1; // 10% chance
    if (this.r > 60 && random(1) < blackHoleChance) {
      let s1 = new Slime(this.x + posOffset1.x, this.y + posOffset1.y, newR, newVel1, c1, random(weightedShapes));
      // The other becomes a black hole, stationary and black
      let s2 = new BlackHoleSlime(this.x + posOffset2.x, this.y + posOffset2.y, newR, createVector(0, 0), color(0));
      return [s1, s2];
    }

    let s1 = new Slime(this.x + posOffset1.x, this.y + posOffset1.y, newR, newVel1, c1, random(weightedShapes));
    let s2 = new Slime(this.x + posOffset2.x, this.y + posOffset2.y, newR, newVel2, c2, random(weightedShapes));

    return [s1, s2];
  }

  intersects(other) {
    let d = dist(this.x, this.y, other.x, other.y);
    return (d < this.r + other.r);
  }

  isClicked(px, py) {
    let d = dist(px, py, this.x, this.y);
    return (d < this.r);
  }

  follow(flowfield) {
    let desired = flowfield.lookup(createVector(this.x, this.y));
    desired.mult(this.maxSpeed);
    let steer = p5.Vector.sub(desired, this.vel);
    steer.limit(this.maxForce);
    return steer;
  }

  move(flowfield) {
    let acc;
    if (this.shape === 'arrow') {
      // Arrow slimes move towards the mouse
      let target = createVector(mouseX, mouseY);
      acc = p5.Vector.sub(target, createVector(this.x, this.y));
      acc.setMag(0.2); // Constant acceleration towards the mouse
    } else {
      // Original Perlin noise movement for other shapes
      let angle = noise(this.moveOffset) * TWO_PI * 2;
      acc = p5.Vector.fromAngle(angle);
      acc.setMag(0.1);
    }

    if (flowfield) {
      const flowForce = this.follow(flowfield);
      acc.add(flowForce);
    }

    this.vel.add(acc);
    this.vel.limit(this.shape === 'arrow' ? 4 : this.maxSpeed);

    // Add some friction/drag to make the movement more springy
    this.vel.mult(0.99);

    // Update position with velocity
    this.x += this.vel.x;
    this.y += this.vel.y;

    this.bounceOffWalls();

    // Increment noise offset for the next frame
    this.moveOffset += 0.01;
  }

  bounceOffWalls() {
    if (this.x > width - this.r) {
      this.x = width - this.r;
      this.vel.x *= -1;
    } else if (this.x < this.r) {
      this.x = this.r;
      this.vel.x *= -1;
    }
    if (this.y > height - this.r) {
      this.y = height - this.r;
      this.vel.y *= -1;
    } else if (this.y < this.r) {
      this.y = this.r;
      this.vel.y *= -1;
    }
    
    // Increment noise offset for the next frame for non-arrow slimes
    if (this.shape !== 'arrow') {
      this.moveOffset += 0.01;
    }
  }

  display() {
    push();
    translate(this.x, this.y);

    // Squash and stretch effect
    const speed = this.vel.mag();
    const angle = this.vel.heading();
    const maxSpeed = 3; // Corresponds to vel.limit(3) in move()
    const maxStretch = 1.35;
    const stretch = map(speed, 0, maxSpeed, 1, maxStretch);
    const squash = 1 / stretch;

    rotate(angle);
    scale(stretch, squash);

    // Slime body drawing function
    const drawSlimeShape = () => {
      beginShape();
      const timeFactor = frameCount * 0.01;
      const noiseFactor = 0.4;

      switch (this.shape) {
        case 'square': {
          let corners = [
            createVector(-this.r, -this.r),
            createVector(this.r, -this.r),
            createVector(this.r, this.r),
            createVector(-this.r, this.r)
          ];
          corners.forEach(c => {
            c.x += map(noise(c.x * 0.05, c.y * 0.05, this.noiseSeed + timeFactor), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
            c.y += map(noise(c.x * 0.05, c.y * 0.05, this.noiseSeed + timeFactor + 100), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
          });
          curveVertex(corners[3].x, corners[3].y);
          for (let c of corners) {
            curveVertex(c.x, c.y);
          }
          curveVertex(corners[0].x, corners[0].y);
          curveVertex(corners[1].x, corners[1].y);
          break;
        }
        case 'triangle': {
          let points = [
            createVector(0, -this.r * 1.15),
            createVector(-this.r, this.r * 0.85),
            createVector(this.r, this.r * 0.85)
          ];
          points.forEach(p => {
            p.x += map(noise(p.x * 0.05, p.y * 0.05, this.noiseSeed + timeFactor), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
            p.y += map(noise(p.x * 0.05, p.y * 0.05, this.noiseSeed + timeFactor + 200), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
          });
          curveVertex(points[2].x, points[2].y);
          for (let p of points) {
            curveVertex(p.x, p.y);
          }
          curveVertex(points[0].x, points[0].y);
          curveVertex(points[1].x, points[1].y);
          break;
        }
        case 'arrow': {
          let points = [
            createVector(this.r * 1.3, 0),
            createVector(0, -this.r),
            createVector(-this.r * 0.4, -this.r * 0.5),
            createVector(-this.r * 0.8, -this.r * 0.5),
            createVector(-this.r * 0.8, this.r * 0.5),
            createVector(-this.r * 0.4, this.r * 0.5),
            createVector(0, this.r)
          ];
          points.forEach(p => {
            p.x += map(noise(p.x * 0.05, p.y * 0.05, this.noiseSeed + timeFactor + 300), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
            p.y += map(noise(p.x * 0.05, p.y * 0.05, this.noiseSeed + timeFactor + 400), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
          });
          curveVertex(points[points.length - 1].x, points[points.length - 1].y);
          for (let p of points) {
            curveVertex(p.x, p.y);
          }
          curveVertex(points[0].x, points[0].y);
          curveVertex(points[1].x, points[1].y);
          break;
        }
        case 'bomb':
        case 'circle':
        default: {
          const noiseMax = 0.5;
          for (let a = 0; a < TWO_PI; a += 0.1) {
            const xoff = map(cos(a), -1, 1, 0, noiseMax);
            const yoff = map(sin(a), -1, 1, 0, noiseMax);
            const r = this.r + map(noise(xoff, yoff, this.noiseSeed + timeFactor), 0, 1, -this.r * 0.2, this.r * 0.2);
            const x = r * cos(a);
            const y = r * sin(a);
            vertex(x, y);
          }
          break;
        }
      }
      endShape(CLOSE);
    };

    // Draw outline first, then fill, to prevent stroke from crossing into the shape
    const c = this.color;
    const darkerC = color(red(c) * 0.8, green(c) * 0.8, blue(c) * 0.8, alpha(c));

    // 1. Draw outline
    stroke(darkerC);
    strokeWeight(this.r * 0.1); // Thicker stroke, half will be covered by fill
    noFill();
    drawSlimeShape();

    // 2. Draw fill on top
    noStroke();
    fill(c);
    drawSlimeShape();

    // Draw bomb icon if the shape is 'bomb'
    if (this.shape === 'bomb') {
      // Bomb body
      fill(40, 40, 40);
      noStroke();
      ellipse(0, -this.r * 0.9, this.r * 0.6, this.r * 0.6);

      // Fuse
      stroke(100, 80, 40);
      strokeWeight(this.r * 0.1);
      line(0, -this.r * 1.1, this.r * 0.1, -this.r * 1.3);

      // Spark
      fill(255, 255, 0);
      noStroke();
      ellipse(this.r * 0.1, -this.r * 1.3, this.r * 0.2);
    }

    // Rounded highlight
    noFill();
    stroke(255, 255, 255, 120); // Semi-transparent white
    strokeWeight(this.r * 0.3); // Make it thick
    arc(0, 0, this.r * 1.5, this.r * 1.5, -PI * 0.8, -PI * 0.2);

    // Face - must be drawn within the transformed matrix
    const eyeSize = this.r * 0.15;
    const eyeY = -this.r * 0.1;
    const leftEyeX = -this.r * 0.25;
    const rightEyeX = this.r * 0.25;

    fill(0); // Black for eyes/mouth details

    switch (this.expression) {
      case 'happy':
        // Eyes
        ellipse(leftEyeX, eyeY, eyeSize, eyeSize);
        ellipse(rightEyeX, eyeY, eyeSize, eyeSize);
        // Smiling mouth
        noFill();
        stroke(0);
        strokeWeight(this.r * 0.05);
        arc(0, this.r * 0.1, this.r * 0.5, this.r * 0.4, 0, PI);
        noStroke();
        break;

      case 'wink':
        // Winking eye (left)
        noFill();
        stroke(0);
        strokeWeight(this.r * 0.05);
        arc(leftEyeX, eyeY, eyeSize * 0.8, eyeSize * 0.5, PI, TWO_PI);
        noStroke();
        // Open eye (right)
        fill(0);
        ellipse(rightEyeX, eyeY, eyeSize, eyeSize);
        break;

      case 'surprised':
        // Wide eyes
        ellipse(leftEyeX, eyeY, eyeSize * 1.2, eyeSize * 1.2);
        ellipse(rightEyeX, eyeY, eyeSize * 1.2, eyeSize * 1.2);
        // Open mouth
        fill(0);
        ellipse(0, this.r * 0.25, this.r * 0.25, this.r * 0.35);
        break;

      case 'default':
      default:
        // Default eyes
        ellipse(leftEyeX, eyeY, eyeSize, eyeSize);
        ellipse(rightEyeX, eyeY, eyeSize, eyeSize);
        break;
    }

    pop();
  }
}

// Particle class for the cluster slime
class ClusterParticle extends toxi.physics2d.VerletParticle2D {
  constructor(pos) {
    super(pos);
    physics.addParticle(this);
  }
}

class ClusterSlime {
  constructor(x, y, r, vel, col) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.vel = vel || createVector();
    this.color = col || color(150, 255, 150, 60);
    this.shape = 'cluster';
    this.expression = random(expressions);

    this.particles = [];
    this.springs = [];

    const numParticles = floor(map(r, 10, 50, 8, 16));
    for (let i = 0; i < numParticles; i++) {
      const angle = map(i, 0, numParticles, 0, TWO_PI);
      const px = x + cos(angle) * r * 0.8;
      const py = y + sin(angle) * r * 0.8;
      let p = new ClusterParticle(new Vec2D(px, py));
      const initialVel = new Vec2D(this.vel.x, this.vel.y);
      p.prev.set(p.sub(initialVel));
      this.particles.push(p);
    }

    const springStrength = 0.05;
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        let p1 = this.particles[i];
        let p2 = this.particles[j];
        let len = p1.distanceTo(p2);
        // Connect particles that are close to each other, plus some cross-bracing
        if (len < r * 1.5) {
            let spring = new VerletSpring2D(p1, p2, len, springStrength);
            this.springs.push(spring);
            physics.addSpring(spring);
        }
      }
    }
    // Gravity is now added once in the main setup function.
  }

  calculateProperties() {
    if (this.particles.length === 0) return;
    let com = new Vec2D(0, 0);
    let vel = new Vec2D(0, 0);
    for (let p of this.particles) {
      com.addSelf(p);
      vel.addSelf(p.getVelocity());
    }
    com.scaleSelf(1.0 / this.particles.length);
    vel.scaleSelf(1.0 / this.particles.length);
    this.x = com.x;
    this.y = com.y;
    this.vel.set(vel.x, vel.y);

    let maxDist = 0;
    for (let p of this.particles) {
      const d = p.distanceTo(com);
      if (d > maxDist) {
        maxDist = d;
      }
    }
    this.r = maxDist;
  }

  move() {
    this.calculateProperties();
  }

  display() {
    push();
    translate(this.x, this.y);

    // Draw the main body
    const c = this.color;
    const darkerC = color(red(c) * 0.8, green(c) * 0.8, blue(c) * 0.8, alpha(c));

    // Sort particles by angle to draw a smooth shape
    let center = new Vec2D(this.x, this.y);
    this.particles.sort((a, b) => {
      let angleA = a.sub(center).heading();
      if (angleA < 0) angleA += TWO_PI;
      let angleB = b.sub(center).heading();
      if (angleB < 0) angleB += TWO_PI;
      return angleA - angleB;
    });

    const drawClusterShape = () => {
        beginShape();
        if (this.particles.length > 2) {
            // Use curveVertex, which requires repeating the first and last points
            curveVertex(this.particles[this.particles.length - 1].x - this.x, this.particles[this.particles.length - 1].y - this.y);
            for (let p of this.particles) {
                curveVertex(p.x - this.x, p.y - this.y);
            }
            curveVertex(this.particles[0].x - this.x, this.particles[0].y - this.y);
            curveVertex(this.particles[1].x - this.x, this.particles[1].y - this.y);
        }
        endShape(CLOSE);
    };

    stroke(darkerC);
    strokeWeight(this.r * 0.2);
    noFill();
    drawClusterShape();

    noStroke();
    fill(c);
    drawClusterShape();

    // Rounded highlight
    noFill();
    stroke(255, 255, 255, 120);
    strokeWeight(this.r * 0.3);
    arc(0, 0, this.r * 1.5, this.r * 1.5, -PI * 0.8, -PI * 0.2);

    // Face
    const eyeSize = this.r * 0.15;
    const eyeY = -this.r * 0.1;
    const leftEyeX = -this.r * 0.25;
    const rightEyeX = this.r * 0.25;

    fill(0);

    switch (this.expression) {
      case 'happy':
        ellipse(leftEyeX, eyeY, eyeSize, eyeSize);
        ellipse(rightEyeX, eyeY, eyeSize, eyeSize);
        noFill();
        stroke(0);
        strokeWeight(this.r * 0.05);
        arc(0, this.r * 0.1, this.r * 0.5, this.r * 0.4, 0, PI);
        noStroke();
        break;
      case 'wink':
        noFill();
        stroke(0);
        strokeWeight(this.r * 0.05);
        arc(leftEyeX, eyeY, eyeSize * 0.8, eyeSize * 0.5, PI, TWO_PI);
        noStroke();
        fill(0);
        ellipse(rightEyeX, eyeY, eyeSize, eyeSize);
        break;
      case 'surprised':
        ellipse(leftEyeX, eyeY, eyeSize * 1.2, eyeSize * 1.2);
        ellipse(rightEyeX, eyeY, eyeSize * 1.2, eyeSize * 1.2);
        fill(0);
        ellipse(0, this.r * 0.25, this.r * 0.25, this.r * 0.35);
        break;
      default:
        ellipse(leftEyeX, eyeY, eyeSize, eyeSize);
        ellipse(rightEyeX, eyeY, eyeSize, eyeSize);
        break;
    }

    pop();
  }

  intersects(other) {
    let d = dist(this.x, this.y, other.x, other.y);
    return (d < this.r + other.r);
  }

  isClicked(px, py) {
    let d = dist(px, py, this.x, this.y);
    return (d < this.r);
  }

  split() {
    const newArea = (PI * this.r * this.r) / 2;
    const newR = sqrt(newArea / PI);

    if (newR < 10) return [];

    const separationSpeed = 5;
    let splitDir = p5.Vector.random2D();
    let newVel1 = p5.Vector.add(this.vel, p5.Vector.mult(splitDir, separationSpeed));
    let newVel2 = p5.Vector.add(this.vel, p5.Vector.mult(splitDir, -separationSpeed));
    let posOffset1 = p5.Vector.mult(splitDir, newR + 1);
    let posOffset2 = p5.Vector.mult(splitDir, -newR - 1);

    const parentR = red(this.color), parentG = green(this.color), parentB = blue(this.color), parentA = alpha(this.color);
    const minR1 = max(0, 2 * parentR - 255), maxR1 = min(255, 2 * parentR);
    const r1 = random(minR1, maxR1), r2 = 2 * parentR - r1;
    const minG1 = max(0, 2 * parentG - 255), maxG1 = min(255, 2 * parentG);
    const g1 = random(minG1, maxG1), g2 = 2 * parentG - g1;
    const minB1 = max(0, 2 * parentB - 255), maxB1 = min(255, 2 * parentB);
    const b1 = random(minB1, maxB1), b2 = 2 * parentB - b1;
    const c1 = color(r1, g1, b1, parentA), c2 = color(r2, g2, b2, parentA);

    let s1 = new ClusterSlime(this.x + posOffset1.x, this.y + posOffset1.y, newR, newVel1, c1);

    // --- Black Hole Creation on Split (for ClusterSlime) ---
    const blackHoleChance = 0.1;
    if (this.r > 60 && random(1) < blackHoleChance) {
      let s2 = new BlackHoleSlime(this.x + posOffset2.x, this.y + posOffset2.y, newR, createVector(0, 0), color(0));
      this.destroy();
      return [s1, s2];
    }

    let s2 = new ClusterSlime(this.x + posOffset2.x, this.y + posOffset2.y, newR, newVel2, c2);

    this.destroy();

    return [s1, s2];
  }

  destroy() {
    for (let p of this.particles) {
      physics.removeParticle(p);
    }
    for (let s of this.springs) {
      physics.removeSpring(s);
    }
    this.particles = [];
    this.springs = [];
  }
}

class KillerSlime extends Slime {
  constructor(x, y, r, vel, col, shape) {
    super(x, y, r, vel, col, shape || 'killer');
    // Killer slimes are always angry!
    this.expression = 'surprised'; // Using 'surprised' as a proxy for angry for now
    this.maxSpeed = 3; // Max speed for steering
    this.maxForce = 0.15; // Max steering force
    this.target = null; // To keep track of the hunted slime
  }

  // Method to calculate a steering force towards a target
  // Implements the "arrive" behavior
  seek(target) {
    // The 'position' is stored as separate x and y properties in the base Slime class
    const position = createVector(this.x, this.y);
    let desired = p5.Vector.sub(target, position);
    let d = desired.mag();

    // Arrive behavior: slow down as we approach the target
    if (d < 100) {
      let m = map(d, 0, 100, 0, this.maxSpeed);
      desired.setMag(m);
    } else {
      desired.setMag(this.maxSpeed);
    }

    // Steering = Desired minus Velocity
    let steer = p5.Vector.sub(desired, this.vel);
    steer.limit(this.maxForce);
    return steer;
  }

  // Method to calculate a steering force away from a target
  flee(target) {
    const position = createVector(this.x, this.y);
    let desired = p5.Vector.sub(target, position);
    // Fleeing is the opposite of seeking
    desired.mult(-1);
    desired.setMag(this.maxSpeed);

    let steer = p5.Vector.sub(desired, this.vel);
    steer.limit(this.maxForce);
    return steer;
  }

  // This method calculates the steering force based on all other slimes
  calculateSteering(slimes) {
    let separationForce = createVector();
    let seekForce = createVector();

    let closestPrey = null;
    let closestDist = Infinity;
    let predators = [];

    // 1. Separate slimes into prey and predators
    for (let other of slimes) {
      if (other === this) continue;
      let d = dist(this.x, this.y, other.x, other.y);

      if (other.r > this.r) {
        // It's a predator, flee if it's too close
        if (d < this.r + 100) { // Flee radius
          predators.push(other);
        }
      } else {
        // It's prey, find the closest one
        if (d < closestDist) {
          closestDist = d;
          closestPrey = other;
        }
      }
    }

    // 2. Calculate flee force from predators and update target
    if (predators.length > 0) {
      let fleeSum = createVector();
      for (let predator of predators) {
        fleeSum.add(this.flee(createVector(predator.x, predator.y)));
      }
      fleeSum.div(predators.length); // Average the flee forces
      separationForce = fleeSum;
      this.target = null; // Fleeing overrides hunting
    } else if (closestPrey) {
      // 3. If not fleeing, seek the closest prey
      seekForce = this.seek(createVector(closestPrey.x, closestPrey.y));
      this.target = closestPrey; // Set the target
    } else {
      // No predators and no prey
      this.target = null;
    }

    // 4. Weight the forces. Fleeing is more important.
    separationForce.mult(2.0);
    seekForce.mult(1.0);

    // 5. Combine forces
    let totalForce = createVector();
    if (separationForce.mag() > 0) {
      // If there's a predator to flee from, that's the only thing that matters
      totalForce = separationForce;
    } else if (seekForce.mag() > 0) {
      // Otherwise, seek prey
      totalForce = seekForce;
    }

    return totalForce;
  }

  // Override the move method to incorporate steering
  move(slimes, flowfield) {
    let steeringForce = this.calculateSteering(slimes);

    // If there's no specific target, add a wandering force
    if (steeringForce.mag() === 0) {
      let angle = noise(this.moveOffset) * TWO_PI * 2;
      let wanderForce = p5.Vector.fromAngle(angle);
      wanderForce.setMag(0.1);
      steeringForce.add(wanderForce);
    }

    if (flowfield) {
      const flowForce = this.follow(flowfield);
      // Give hunting/fleeing more priority than following the field
      flowForce.mult(0.5);
      steeringForce.add(flowForce);
    }

    this.vel.add(steeringForce);
    this.vel.limit(this.maxSpeed);

    // Common movement logic (from original Slime.move())
    this.vel.mult(0.99);
    this.x += this.vel.x;
    this.y += this.vel.y;
    this.bounceOffWalls();
    this.moveOffset += 0.01;
  }

  // Override the display method to add the hunter's gaze
  display() {
    // We call super.display() first to draw the slime's body and face.
    // This happens within a push/pop matrix, so our line drawing afterwards
    // won't be affected by the slime's rotation and scaling.
    super.display();

    // Now, draw the hunter's gaze line if a target exists.
    // This is drawn in the main canvas coordinate system.
    if (this.target) {
      push();
      // Style for the gaze line
      stroke(255, 0, 0, 150); // Red, semi-transparent
      strokeWeight(2);

      // Use the 2D rendering context to draw a dashed line
      drawingContext.setLineDash([8, 8]); // [dash length, gap length]

      // Draw the line from this slime's center to its target's center
      line(this.x, this.y, this.target.x, this.target.y);

      // It's crucial to reset the line dash style so it doesn't
      // affect other drawings in the sketch.
      drawingContext.setLineDash([]);

      // --- Draw Aiming Reticle on Target ---
      noFill();
      stroke(255, 0, 0, 200); // Use a more solid red for the reticle
      strokeWeight(2);

      const reticleSize = this.target.r * 1.5; // Make the reticle larger than the slime

      // Draw a circle around the target
      ellipse(this.target.x, this.target.y, reticleSize * 2);

      // Draw crosshairs
      line(this.target.x - reticleSize, this.target.y, this.target.x + reticleSize, this.target.y);
      line(this.target.x, this.target.y - reticleSize, this.target.x, this.target.y + reticleSize);

      pop();
    }
  }
}

class BlackHoleSlime extends Slime {
  constructor(x, y, r, vel, col) {
    super(x, y, r, vel, col, 'blackhole');
    this.vel = createVector(0, 0); // Black holes don't move
    this.particles = [];
    this.initParticles();
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        angle: random(TWO_PI),
        dist: random(this.r, this.r * 2.5),
        speed: random(0.01, 0.03)
      });
    }
  }

  // Override the move method to do nothing, keeping it stationary
  move() {
    // Black holes are immutable movers.
    // We can update particle positions here though.
    for (let p of this.particles) {
      p.angle += p.speed;
      // As the black hole grows, check if particles need to be reset
      if (p.dist < this.r) {
        p.dist = random(this.r, this.r * 2.5);
      }
    }
  }

  display() {
    // Draw orbiting particles first, so they are behind the core
    push();
    translate(this.x, this.y);
    for (let p of this.particles) {
      const x = cos(p.angle) * p.dist;
      const y = sin(p.angle) * p.dist;
      fill(200, 200, 255, 180);
      noStroke();
      ellipse(x, y, 3, 3);
    }
    pop();

    push();
    translate(this.x, this.y);

    const pulse = sin(frameCount * 0.05) * (this.r * 0.1);

    // Event horizon glow
    noStroke();
    for (let i = 15; i > 0; i--) {
      const radius = this.r + i * 2 + pulse;
      const alpha = map(i, 15, 0, 0, 100);
      fill(120, 100, 255, alpha);
      ellipse(0, 0, radius * 2);
    }

    // Black core
    fill(0);
    noStroke();
    ellipse(0, 0, this.r * 2);
    pop();
  }
}

// FlowField class
class FlowField {
  constructor(r) {
    this.resolution = r;
    this.cols = floor(width / this.resolution);
    this.rows = floor(height / this.resolution);
    this.field = new Array(this.cols);
    for (let i = 0; i < this.cols; i++) {
      this.field[i] = new Array(this.rows);
    }
    this.init();
  }

  init() {
    noiseSeed(random(10000));
    let xoff = 0;
    for (let i = 0; i < this.cols; i++) {
      let yoff = 0;
      for (let j = 0; j < this.rows; j++) {
        let angle = noise(xoff, yoff) * TWO_PI * 4;
        this.field[i][j] = p5.Vector.fromAngle(angle);
        yoff += 0.1;
      }
      xoff += 0.1;
    }
  }

  display() {
    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        this.drawVector(this.field[i][j], i * this.resolution, j * this.resolution, this.resolution - 2);
      }
    }
  }

  drawVector(v, x, y, scayl) {
    push();
    translate(x, y);
    stroke(150, 100);
    rotate(v.heading());
    let len = v.mag() * scayl;
    line(0, 0, len, 0);
    pop();
  }

  lookup(lookup) {
    let column = floor(constrain(lookup.x / this.resolution, 0, this.cols - 1));
    let row = floor(constrain(lookup.y / this.resolution, 0, this.rows - 1));
    return this.field[column][row].copy();
  }
}

// Cannon class
class Cannon {
  constructor() {
    this.w = 100;
    this.h = 60;
    this.x = width / 2;
    this.y = height - this.h / 2;
  }

  display() {
    push();
    translate(this.x, this.y);

    // Barrel
    fill(80);
    noStroke();
    rect(-this.w / 2, -this.h / 2, this.w, this.h, 10, 10, 0, 0);

    // Base
    fill(60);
    arc(0, this.h / 2, this.w * 1.2, this.h, PI, TWO_PI);

    pop();
  }

  isClicked(px, py) {
    // A generous rectangular bounding box for the whole cannon
    const cannonTop = this.y - this.h / 2;
    const cannonBottom = this.y + this.h; // Bottom of the arc base
    const cannonLeft = this.x - (this.w * 1.2) / 2;
    const cannonRight = this.x + (this.w * 1.2) / 2;

    return (px > cannonLeft && px < cannonRight && py > cannonTop && py < cannonBottom);
  }
}

function keyPressed() {
  if (keyCode === 32) { // Spacebar
    flowfield.init();
  }
}
