"use client";
import { useEffect, useRef } from "react";
export default function Office({ step = 0, active = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const g = ref.current.getContext("2d");
    function rect(x, y, w, h, c) {
      g.fillStyle = c;
      g.fillRect(x, y, w, h);
    }
    const ink = "#263e3b",
      wood = "#ad7652",
      light = "#e8bf89";
    function plant(x, y) {
      rect(x - 5, y, 10, 8, "#c78057");
      rect(x - 7, y - 2, 14, 3, "#e8a87b");
      rect(x - 1, y - 19, 2, 18, ink);
      for (let j = 0; j < 4; j++) {
        rect(
          x - 7 + (j % 2) * 7,
          y - 7 - j * 4,
          8,
          4,
          j % 2 ? "#52795b" : "#779163",
        );
      }
    }
    function desk(x, y) {
      rect(x + 2, y + 8, 46, 4, "#927e68");
      rect(x, y, 49, 9, wood);
      rect(x, y, 49, 5, light);
      rect(x + 3, y + 9, 3, 9, ink);
      rect(x + 42, y + 9, 3, 9, ink);
      rect(x + 16, y - 11, 18, 12, ink);
      rect(x + 18, y - 9, 14, 8, "#95b4a6");
      rect(x + 24, y, 3, 3, ink);
      rect(x + 18, y + 3, 15, 2, "#5a6256");
    }
    function person(x, y, color) {
      rect(x - 5, y + 17, 11, 2, "#a08d76");
      rect(x - 4, y + 12, 3, 6, ink);
      rect(x + 2, y + 12, 3, 6, ink);
      rect(x - 5, y + 5, 11, 8, color);
      rect(x - 7, y + 7, 2, 6, "#e2af8a");
      rect(x + 6, y + 7, 2, 6, "#e2af8a");
      rect(x - 4, y - 2, 9, 8, "#eac09f");
      rect(x - 5, y - 4, 10, 4, ink);
      rect(x - 5, y - 1, 2, 4, ink);
      rect(x + 2, y + 1, 1, 1, ink);
    }
    function draw(pos) {
      rect(0, 0, 288, 134, "#e2d6b7");
      rect(0, 46, 288, 88, "#d0b995");
      for (let y = 47; y < 134; y += 10) {
        rect(0, y, 288, 1, "#bca581");
        for (let x = y % 20 ? 12 : 35; x < 288; x += 48)
          rect(x, y, 1, 10, "#bca581");
      }
      for (let x = 9; x < 219; x += 52) {
        rect(x, 5, 47, 32, ink);
        rect(x + 2, 7, 43, 28, step === 3 ? "#eac19a" : "#abcac4");
        for (let j = 0; j < 6; j++) {
          let h = 4 + ((j * 7 + x) % 12);
          rect(x + 3 + j * 7, 33 - h, 6, h, "#8bafa5");
        }
        rect(x + 22, 6, 2, 30, ink);
        rect(x, 36, 47, 3, wood);
      }
      rect(231, 9, 45, 28, "#987156");
      for (let j = 0; j < 9; j++) {
        rect(
          234 + j * 4,
          12 + (j % 3),
          3,
          11 - (j % 3),
          ["#819878", "#d4af83", "#b87960"][j % 3],
        );
      }
      rect(232, 24, 43, 2, light);
      plant(15, 49);
      plant(273, 93);
      desk(34, 64);
      desk(114, 64);
      desk(201, 64);
      desk(17, 112);
      desk(97, 112);
      rect(179, 103, 64, 16, wood);
      rect(178, 101, 66, 12, light);
      rect(184, 119, 3, 6, ink);
      rect(238, 119, 3, 6, ink);
      person(146, 50, "#ac6551");
      person(221, 88, "#637fa0");
      person(61, 97, "#a27858");
      const [x, y] = pos;
      person(Math.round(x), Math.round(y), "#277e66");
      rect(Math.round(x) - 2, Math.round(y) - 13, 5, 3, "#f5cd5c");
      rect(Math.round(x) - 1, Math.round(y) - 10, 3, 2, "#f5cd5c");
    }
    const points = [
      [80, 77],
      [160, 76],
      [200, 88],
      [80, 77],
    ];
    const start = active && step ? points[step - 1] : points[step],
      end = points[step];
    let frame;
    let t0 = performance.now();
    function animate(t) {
      let f = Math.min(1, (t - t0) / 600);
      draw(start.map((v, i) => v + (end[i] - v) * f));
      if (f < 1) frame = requestAnimationFrame(animate);
    }
    animate(t0);
    return () => cancelAnimationFrame(frame);
  }, [step, active]);
  return (
    <canvas
      ref={ref}
      width="288"
      height="134"
      aria-label="窓辺のデスクと会議スペースが並ぶドット絵のオフィス。黄色い目印があなたのアバターです。"
      role="img"
    />
  );
}
