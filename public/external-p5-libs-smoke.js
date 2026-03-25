(function (global) {
  global.externalP5LibSmoke = {
    version: 'smoke-1',
    drawBadge(p, label) {
      const text = label || 'external-p5-libs ok';
      p.background(14, 18, 28);
      p.noStroke();
      p.fill(94, 234, 212);
      p.rect(16, 16, p.width - 32, p.height - 32, 12);
      p.fill(14, 18, 28);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(18);
      p.text(text, p.width / 2, p.height / 2);
    },
  };
})(window);
