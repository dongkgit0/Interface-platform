/* 登录页左侧深空背景：星星 + 星尘粒子 + 太阳系自适应缩放 + 行星名称定位 */
(function () {
  "use strict";

  var space = document.querySelector(".space");

  /* 1. 闪烁星星 */
  var starsEl = document.getElementById("stars");
  if (starsEl) {
    var count = 100;
    for (var i = 0; i < count; i++) {
      var s = document.createElement("div");
      s.className = "star";
      var size = Math.random() * 1.8 + 0.6;
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.animationDelay = (Math.random() * 3.5) + "s";
      starsEl.appendChild(s);
    }
  }

  /* 2. 细腻星尘 + 柔和光斑粒子 */
  if (space) {
    for (var i = 0; i < 36; i++) {
      var d = document.createElement("div");
      d.className = "stardust";
      var size = Math.random() * 1.6 + 0.5;
      d.style.width = size + "px";
      d.style.height = size + "px";
      d.style.left = Math.random() * 100 + "%";
      d.style.top = Math.random() * 100 + "%";
      d.style.animationDelay = (Math.random() * 6) + "s";
      space.appendChild(d);
    }
    for (var i = 0; i < 14; i++) {
      var p = document.createElement("div");
      p.className = "nebula-particle";
      var size = Math.random() * 4 + 2.5;
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = Math.random() * 100 + "%";
      p.style.top = Math.random() * 100 + "%";
      p.style.opacity = (Math.random() * 0.35 + 0.15).toFixed(2);
      space.appendChild(p);
    }
  }

  /* 3. 太阳系尺寸自适应：宽屏放大、窄屏收缩 */
  var sys = document.querySelector(".orbit-system");
  function resizeOrbitSystem() {
    if (!space || !sys) return;
    var w = space.clientWidth;
    /* 目标直径：左侧区域宽度的 74%，上限 760px，下限 390px */
    var target = Math.min(760, Math.max(390, Math.round(w * 0.74)));
    sys.style.setProperty("--sys", target + "px");
    sys.style.setProperty("--scale", (target / 560).toFixed(4));
  }

  /* 4. 行星名称标签：移到 space 下，逐帧定位到行星正下方 */
  var labels = [];
  if (space) {
    document.querySelectorAll(".orbit-planet").forEach(function (p) {
      var label = p.querySelector(".planet-label");
      if (!label) return;
      var ly = parseFloat(p.style.getPropertyValue("--ly")) || 16;
      var planet = p.querySelector(".planet");
      labels.push({ label: label, planet: planet, ly: ly });
      space.appendChild(label); /* 移出轨道容器，便于屏幕坐标定位 */
      label.style.position = "absolute";
    });
  }

  var sunEl = document.querySelector(".sun");

  function syncLabels() {
    if (!space) return;
    var sp = space.getBoundingClientRect();
    var sr = sunEl.getBoundingClientRect();
    var sunCx = sr.left + sr.width / 2;
    var sunCy = sr.top + sr.height / 2;
    /* 避让半径：行星距太阳中心小于该值时，标签放到背离太阳一侧 */
    var avoid = sr.width * 0.75;
    for (var i = 0; i < labels.length; i++) {
      var o = labels[i];
      var pr = o.planet.getBoundingClientRect();
      var w = o.label.offsetWidth;
      var h = o.label.offsetHeight;
      var pcx = pr.left + pr.width / 2;
      var pcy = pr.top + pr.height / 2;
      var dx = pcx - sunCx;
      var dy = pcy - sunCy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < avoid) {
        /* 靠近太阳：标签放在行星背离太阳的一侧，永不与太阳重叠 */
        var nx = dx / dist, ny = dy / dist;
        var off = o.ly + h;
        o.label.style.left = (pcx + nx * off - sp.left - w / 2) + "px";
        o.label.style.top = (pcy + ny * off - sp.top) + "px";
      } else {
        /* 远离太阳：标签保持在行星正下方 */
        o.label.style.left = (pcx - sp.left - w / 2) + "px";
        o.label.style.top = (pcy - sp.top + o.ly) + "px";
      }
    }
    requestAnimationFrame(syncLabels);
  }

  resizeOrbitSystem();
  window.addEventListener("resize", resizeOrbitSystem);
  syncLabels();
})();
