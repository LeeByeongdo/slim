let slimes = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  // Start with one large slime
  slimes.push(new Slime(width / 2, height / 2, 60));
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
    this.color = color(100, 150, 255, 200);
    this.noiseSeed = random(1000);
  }

  split() {
    let newR = this.r * 0.707;
    let newVel1 = this.vel.copy().rotate(random(-0.5, 0.5)).mult(1.1);
    let newVel2 = this.vel.copy().rotate(random(-0.5, 0.5)).mult(1.1);
    let s1 = new Slime(this.x, this.y, newR, newVel1);
    let s2 = new Slime(this.x, this.y, newR, newVel2);
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
    noStroke();
    fill(this.color);

    push();
    translate(this.x, this.y);
    beginShape();
    let noiseMax = 0.5;
    for (let a = 0; a < TWO_PI; a += 0.1) {
      let xoff = map(cos(a), -1, 1, 0, noiseMax);
      let yoff = map(sin(a), -1, 1, 0, noiseMax);
      let r = this.r + map(noise(xoff, yoff, this.noiseSeed + frameCount * 0.01), 0, 1, -this.r * 0.1, this.r * 0.1);
      let x = r * cos(a);
      let y = r * sin(a);
      vertex(x, y);
    }
    endShape(CLOSE);
    pop();
  }
}
