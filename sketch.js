let slimes = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  // Start with one large slime
  slimes.push(new Slime(width / 2, height / 2, 180));
}

function draw() {
  background(230, 240, 255);

  // Collision and merging logic
  for (let i = slimes.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
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

        slimes.push(new Slime(newX, newY, newRadius, newVel));

        slimes.splice(i, 1);
        slimes.splice(j, 1);
        return;
      }
    }
  }

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
  constructor(x, y, r, vel) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.vel = vel || p5.Vector.random2D().mult(random(2, 4));
    this.color = color(150, 255, 150, 180); // 연두색 베이스에 투명도 적용
    this.noiseSeed = random(1000);
  }

  split() {
    let newR = this.r * 0.707;
    // Create new random velocities for the split slimes
    let newVel1 = p5.Vector.random2D().mult(this.vel.mag() * 1.2);
    let newVel2 = p5.Vector.random2D().mult(this.vel.mag() * 1.2);

    // Position the new slimes slightly apart to prevent instant merging
    // Add a small epsilon (1) for robustness
    let s1 = new Slime(this.x - newR - 1, this.y, newR, newVel1);
    let s2 = new Slime(this.x + newR + 1, this.y, newR, newVel2);

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
    this.x += this.vel.x;
    this.y += this.vel.y;

    if (this.x > width - this.r || this.x < this.r) this.vel.x *= -1;
    if (this.y > height - this.r || this.y < this.r) this.vel.y *= -1;
  }

  display() {
    push();
    translate(this.x, this.y);

    // Slime body
    noStroke();
    fill(this.color);
    beginShape();
    const noiseMax = 0.5;
    for (let a = 0; a < TWO_PI; a += 0.1) {
      const xoff = map(cos(a), -1, 1, 0, noiseMax);
      const yoff = map(sin(a), -1, 1, 0, noiseMax);
      const r = this.r + map(noise(xoff, yoff, this.noiseSeed + frameCount * 0.01), 0, 1, -this.r * 0.1, this.r * 0.1);
      const x = r * cos(a);
      const y = r * sin(a);
      vertex(x, y);
    }
    endShape(CLOSE);

    // Highlight
    fill(255, 255, 255, 100);
    noStroke();
    arc(
      -this.r * 0.2, // x
      -this.r * 0.2, // y
      this.r * 1.2,   // width
      this.r * 1.2,   // height
      PI + QUARTER_PI * 1.5, // start angle
      TWO_PI - QUARTER_PI * 0.5 // end angle
    );

    // Eyes
    fill(0);
    const eyeSize = this.r * 0.15;
    ellipse(-this.r * 0.25, -this.r * 0.1, eyeSize, eyeSize); // Left eye
    ellipse(this.r * 0.25, -this.r * 0.1, eyeSize, eyeSize);  // Right eye

    pop();
  }
}
