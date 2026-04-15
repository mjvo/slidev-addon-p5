function setup() {
  createCanvas(400, 400);
  pixelDensity(1);
  noLoop();
}

function draw() {
  loadPixels();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (x + y * width) * 4;
      pixels[i] = x % 256;
      pixels[i + 1] = y % 256;
      pixels[i + 2] = 180;
      pixels[i + 3] = 255;
    }
  }
  updatePixels();
}
