let slimes = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  const shapes = ['circle', 'square', 'triangle'];
  const numSlimes = 15;
  for (let i = 0; i < numSlimes; i++) {
    const radius = random(20, 50);
    const x = random(radius, width - radius);
    const y = random(radius, height - radius);
    const shape = random(shapes);
    const col = color(random(100, 255), random(100, 255), random(100, 255), 180);
    slimes.push(new Slime(x, y, radius, p5.Vector.random2D().mult(2), col, shape));
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
        newSlimes.push(new Slime(newX, newY, newRadius, newVel, newColor, newShape));

        mergedIndices.add(i);
        mergedIndices.add(j);
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
    slimes[i].move();
    slimes[i].display();
  }
}

function mousePressed() {
  for (let i = slimes.length - 1; i >= 0; i--) {
    if (slimes[i].isClicked(mouseX, mouseY)) {
      if (slimes[i].r > 10) {
        let newSlimes = slimes[i].split();
        slimes.push(newSlimes[0]);
        slimes.push(newSlimes[1]);
        slimes.splice(i, 1);
      }
      break;
    }
  }
}

// Slime class
class Slime {
  constructor(x, y, r, vel, col, shape) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.vel = vel || createVector();
    this.color = col || color(150, 255, 150, 180); // Provide a default color
    this.shape = shape || 'circle'; // Add shape property
    this.noiseSeed = random(1000);
    this.moveOffset = random(1000); // For Perlin noise-based movement
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

    let s1 = new Slime(this.x + posOffset1.x, this.y + posOffset1.y, newR, newVel1, c1, this.shape);
    let s2 = new Slime(this.x + posOffset2.x, this.y + posOffset2.y, newR, newVel2, c2, this.shape);

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
    // Generate a smoothly changing angle from Perlin noise
    let angle = noise(this.moveOffset) * TWO_PI * 2;
    let acc = p5.Vector.fromAngle(angle);
    acc.setMag(0.1); // Acceleration magnitude

    // Update velocity with acceleration
    this.vel.add(acc);
    this.vel.limit(3); // Limit max speed

    // Add some friction/drag to make the movement more springy
    this.vel.mult(0.99);

    // Update position with velocity
    this.x += this.vel.x;
    this.y += this.vel.y;

    // Bounce off walls
    if (this.x > width - this.r || this.x < this.r) {
      this.vel.x *= -1;
    }
    if (this.y > height - this.r || this.y < this.r) {
      this.vel.y *= -1;
    }

    // Increment noise offset for the next frame
    this.moveOffset += 0.01;
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
    const noiseFactor = 0.2;

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
      case 'circle':
      default: {
        const noiseMax = 0.5;
        for (let a = 0; a < TWO_PI; a += 0.1) {
          const xoff = map(cos(a), -1, 1, 0, noiseMax);
          const yoff = map(sin(a), -1, 1, 0, noiseMax);
          const r = this.r + map(noise(xoff, yoff, this.noiseSeed + timeFactor), 0, 1, -this.r * 0.1, this.r * 0.1);
          const x = r * cos(a);
          const y = r * sin(a);
          vertex(x, y);
        }
        break;
      }
    }
    endShape(CLOSE);

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

    // Eyes - must be drawn within the transformed matrix
    fill(0);
    const eyeSize = this.r * 0.15;
    ellipse(-this.r * 0.25, -this.r * 0.1, eyeSize, eyeSize);
    ellipse(this.r * 0.25, -this.r * 0.1, eyeSize, eyeSize);

    pop();
  }
}
