let slimes = [];
let explosions = [];
const shapes = ['circle', 'square', 'triangle', 'bomb', 'arrow', 'killer'];

// Create a weighted list of shapes to make bombs 10x less likely
const weightedShapes = [];
for (const shape of shapes) {
  if (shape === 'bomb' || shape === 'killer') {
    weightedShapes.push(shape);
  } else {
    for (let i = 0; i < 10; i++) {
      weightedShapes.push(shape);
    }
  }
}

// Cannon properties
let cannon;

function setup() {
  createCanvas(windowWidth, windowHeight);
  cannon = new Cannon(); // Create the cannon instance
  const numSlimes = 15;
  for (let i = 0; i < numSlimes; i++) {
    const radius = random(20, 50);
    const x = random(radius, width - radius);
    const y = random(radius, height - radius);
    const shape = random(weightedShapes);
    const col = color(random(100, 255), random(100, 255), random(100, 255), 100);

    if (shape === 'killer') {
      slimes.push(new KillerSlime(x, y, radius, p5.Vector.random2D().mult(2), col, shape));
    } else {
      slimes.push(new Slime(x, y, radius, p5.Vector.random2D().mult(2), col, shape));
    }
  }
}

function draw() {
  background(230, 240, 255);

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

        // --- BOMB LOGIC ---
        if (slimeA.shape === 'bomb' || slimeB.shape === 'bomb') {
          const explosionX = (slimeA.x + slimeB.x) / 2;
          const explosionY = (slimeA.y + slimeB.y) / 2;
          explosions.push(new Explosion(explosionX, explosionY));

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

          const newShape = slimeA.r > slimeB.r ? slimeA.shape : slimeB.shape;
          const isKiller = slimeA instanceof KillerSlime || slimeB instanceof KillerSlime;

          if (isKiller) {
            newSlimes.push(new KillerSlime(newX, newY, newRadius, newVel, newColor, 'killer'));
          } else {
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

  for (let i = 0; i < slimes.length; i++) {
    if (slimes[i] instanceof KillerSlime) {
      slimes[i].move(slimes);
    } else {
      slimes[i].move();
    }
    slimes[i].display();
  }

  // Update and display explosions
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].update();
    explosions[i].display();
    if (explosions[i].isFinished()) {
      explosions.splice(i, 1);
    }
  }

  // Draw the cannon
  cannon.display();
}

function mousePressed() {
  // Check for cannon click first
  if (cannon.isClicked(mouseX, mouseY)) {
    const radius = random(15, 30);
    const x = cannon.x;
    const y = cannon.y - cannon.h / 2; // Start at the nozzle
    const vel = createVector(random(-2, 2), -12); // Shoot upwards
    const shape = random(shapes.filter(s => s !== 'bomb')); // Don't shoot bombs for now
    const col = color(random(100, 255), random(100, 255), random(100, 255), 100);

    slimes.push(new Slime(x, y, radius, vel, col, shape));
    return; // Prevent further click checks
  }

  for (let i = slimes.length - 1; i >= 0; i--) {
    if (slimes[i].isClicked(mouseX, mouseY)) {
      if (slimes[i].r > 3.5) {
        let newSlimes = slimes[i].split();
        slimes.push(newSlimes[0]);
        slimes.push(newSlimes[1]);
        slimes.splice(i, 1);
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
    this.color = col || color(150, 255, 150, 100); // Provide a default color
    this.shape = shape || 'circle'; // Add shape property
    this.noiseSeed = random(1000);
    this.moveOffset = random(1000); // For Perlin noise-based movement
    this.expression = random(expressions);
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

  move() {
    if (this.shape === 'arrow') {
      // Arrow slimes move towards the mouse
      let target = createVector(mouseX, mouseY);
      let acc = p5.Vector.sub(target, createVector(this.x, this.y));
      acc.setMag(0.2); // Constant acceleration towards the mouse
      this.vel.add(acc);
      this.vel.limit(4); // Limit max speed
    } else {
      // Original Perlin noise movement for other shapes
      let angle = noise(this.moveOffset) * TWO_PI * 2;
      let acc = p5.Vector.fromAngle(angle);
      acc.setMag(0.1);
      this.vel.add(acc);
      this.vel.limit(3);
    }

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

    // Slime body
    noStroke();
    fill(this.color);
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
        // A more detailed shape with a distinct head and body
        let points = [
          createVector(this.r * 1.3, 0),             // Tip
          createVector(0, -this.r),                  // Right head corner
          createVector(-this.r * 0.4, -this.r * 0.5),  // Right neck
          createVector(-this.r * 0.8, -this.r * 0.5),  // Right tail
          createVector(-this.r * 0.8, this.r * 0.5),   // Left tail
          createVector(-this.r * 0.4, this.r * 0.5),   // Left neck
          createVector(0, this.r)                    // Left head corner
        ];

        points.forEach(p => {
          p.x += map(noise(p.x * 0.05, p.y * 0.05, this.noiseSeed + timeFactor + 300), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
          p.y += map(noise(p.x * 0.05, p.y * 0.05, this.noiseSeed + timeFactor + 400), 0, 1, -this.r * noiseFactor, this.r * noiseFactor);
        });

        // Using curveVertex for a rounder, cuter arrow shape
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

    // Highlight - must be drawn within the transformed matrix
    fill(255, 255, 255, 100);
    noStroke();
    arc(
      -this.r * 0.2,
      -this.r * 0.2,
      this.r * 1.2,
      this.r * 1.2,
      PI + QUARTER_PI * 1.5,
      TWO_PI - QUARTER_PI * 0.5
    );

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

// Explosion class to manage particles
class Explosion {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.particles = [];
    // Create a burst of particles
    for (let i = 0; i < 30; i++) {
      this.particles.push(new Particle(this.x, this.y));
    }
  }

  update() {
    for (let particle of this.particles) {
      particle.update();
    }
  }

  display() {
    for (let particle of this.particles) {
      particle.display();
    }
  }

  // Check if the explosion animation is finished
  isFinished() {
    return this.particles.every(p => p.isFinished());
  }
}

// Particle class for the explosion effect
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vel = p5.Vector.random2D().mult(random(2, 6));
    this.lifespan = 255; // Alpha value
    this.r = random(3, 8);
    // Explosion colors (oranges, yellows, reds)
    this.color = color(random(200, 255), random(50, 150), 0);
  }

  isFinished() {
    return this.lifespan < 0;
  }

  update() {
    this.x += this.vel.x;
    this.y += this.vel.y;
    this.vel.mult(0.95); // Apply friction to slow down
    this.lifespan -= 5; // Fade out
  }

  display() {
    noStroke();
    // Use lifespan for alpha to fade out
    fill(this.color.levels[0], this.color.levels[1], this.color.levels[2], this.lifespan);
    ellipse(this.x, this.y, this.r * 2);
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
  move(slimes) {
    const steeringForce = this.calculateSteering(slimes);

    // If there's a specific target (prey or predator), use the steering force.
    // Otherwise, use the default wandering behavior.
    if (steeringForce.mag() > 0) {
      this.vel.add(steeringForce);
      this.vel.limit(this.maxSpeed);
    } else {
      // Wander behavior (from original Slime.move())
      let angle = noise(this.moveOffset) * TWO_PI * 2;
      let acc = p5.Vector.fromAngle(angle);
      acc.setMag(0.1);
      this.vel.add(acc);
      this.vel.limit(3); // Keep original wander speed limit
    }

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
