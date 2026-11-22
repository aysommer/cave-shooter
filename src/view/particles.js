// Short-lived visual particles. Some of them (shell casings, blood drops)
// fall to the floor and turn into decals when they land.

export function createParticles(renderer) {
  const list = [];

  function add(p) {
    if (list.length < 1500) list.push(p);
  }

  return {
    add,
    clear() {
      list.length = 0;
    },

    burst(x, y, n, colors, speed, life) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (0.3 + Math.random()) * speed;
        add({ kind: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: Math.round(life * (0.5 + Math.random() * 0.5)), color: colors[i % colors.length] });
      }
    },

    /** Drops that fly up and land on the floor as stains. */
    drops(x, y, n, color, stain, speed = 1.4) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (0.2 + Math.random()) * speed;
        add({ kind: "drop", x, y, z: 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: 0.6 + Math.random() * 1.2, color, stain, life: 120 });
      }
    },

    /** A shell casing ejected sideways from the gun. */
    casing(x, y, angle, color) {
      const side = angle + (Math.cos(angle) >= 0 ? -Math.PI / 2 : Math.PI / 2);
      const s = 0.8 + Math.random() * 0.6;
      add({
        kind: "casing",
        x,
        y,
        z: 4,
        vx: Math.cos(side) * s - Math.cos(angle) * 0.4,
        vy: Math.sin(side) * s * 0.6,
        vz: 1 + Math.random() * 0.8,
        color,
        bounced: false,
        life: 200,
      });
    },

    /** Advances one simulation tick. */
    tick(decals) {
      for (const p of list) {
        p.life--;
        if (p.kind === "spark" || p.kind === "smoke") {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.85;
          p.vy *= 0.85;
        } else if (p.kind === "dust") {
          p.y -= 0.1;
        } else if (p.kind === "drop" || p.kind === "casing") {
          p.x += p.vx;
          p.y += p.vy;
          p.vz -= 0.15;
          p.z += p.vz;
          if (p.z <= 0) {
            if (p.kind === "casing" && !p.bounced) {
              // One small bounce, then it rests on the floor.
              p.bounced = true;
              p.z = 0;
              p.vz = 0.7;
              p.vx *= 0.5;
              p.vy *= 0.5;
            } else {
              if (p.kind === "casing") decals.pixel(p.x, p.y, p.color, 1), decals.pixel(p.x + 1, p.y, p.color);
              else decals.splat(p.x, p.y, p.stain, 3, 1.5);
              p.life = 0;
            }
          }
        }
      }
      for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
    },

    draw(cam) {
      const r = renderer;
      for (const p of list) {
        const x = p.x - cam.x;
        const y = p.y - cam.y;
        switch (p.kind) {
          case "flash": {
            // Muzzle flash pointing along the shot.
            const len = p.life >= 2 ? p.size : p.size * 0.6;
            const ux = Math.cos(p.angle);
            const uy = Math.sin(p.angle);
            for (let d = 0; d <= len; d++) {
              const w = Math.max(0, (1 - d / len) * (p.size * 0.5));
              r.rect(x + ux * d - w / 2, y + uy * d - w / 2, Math.max(1, Math.round(w)), Math.max(1, Math.round(w)), d < len * 0.4 ? "#ffffff" : "#ffcf5a");
            }
            break;
          }
          case "spark":
            r.pixel(x, y, p.color);
            break;
          case "puff":
            r.pixel(x, y, p.life > 3 ? "#8a8296" : "#4d4659");
            break;
          case "dust": {
            const rad = p.life > 10 ? 1 : 2;
            renderer.ctx.globalAlpha = Math.min(1, p.life / 12) * 0.6;
            r.rect(x - rad, y - rad, rad * 2, rad, "#8a8296");
            renderer.ctx.globalAlpha = 1;
            break;
          }
          case "smoke": {
            renderer.ctx.globalAlpha = Math.min(1, p.life / 20) * 0.5;
            r.rect(x - p.size / 2, y - p.size / 2, p.size, p.size, "#4d4659");
            renderer.ctx.globalAlpha = 1;
            break;
          }
          case "ring": {
            const rad = p.r * (1 - p.life / p.max) + 2;
            const n = Math.max(8, Math.round(rad * 2));
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2;
              r.pixel(x + Math.cos(a) * rad, y + Math.sin(a) * rad, p.color);
            }
            break;
          }
          case "drop":
            r.pixel(x, y - p.z, p.color);
            break;
          case "beam": {
            // Laser: bright core, fading glow.
            const x2 = x + Math.cos(p.angle) * p.len;
            const y2 = y + Math.sin(p.angle) * p.len;
            renderer.ctx.globalAlpha = p.life / p.max;
            r.line(x, y + 1, x2, y2 + 1, "#2f8fb0");
            r.line(x, y - 1, x2, y2 - 1, "#2f8fb0");
            r.line(x, y, x2, y2, p.life > p.max / 2 ? "#ffffff" : "#5fe6f0");
            renderer.ctx.globalAlpha = 1;
            break;
          }
          case "slash": {
            // Melee swing: an arc of white pixels fading out.
            const n = 14;
            for (let i = 0; i <= n; i++) {
              const a = p.angle - p.arc / 2 + (p.arc * i) / n;
              const k = p.life / p.max;
              r.pixel(x + Math.cos(a) * p.radius, y + Math.sin(a) * p.radius, k > 0.5 ? "#ffffff" : "#c8c0d8");
              if (k > 0.5) r.pixel(x + Math.cos(a) * (p.radius - 2), y + Math.sin(a) * (p.radius - 2), "#c8c0d8");
            }
            break;
          }
          case "text": {
            const m = r.measureText(p.text);
            r.text(p.text, Math.round(x - m.w / 2), Math.round(y - (p.max - p.life) * 0.3), p.color);
            break;
          }
          case "casing":
            r.rect(x, y - p.z, 2, 1, p.color);
            break;
        }
      }
    },
  };
}
