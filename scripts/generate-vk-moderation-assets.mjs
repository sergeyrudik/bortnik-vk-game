import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "moderation", "assets");
await mkdir(output, { recursive: true });

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9ec9e0"/>
      <stop offset=".55" stop-color="#8fbf6a"/>
      <stop offset="1" stop-color="#2f5d3a"/>
    </linearGradient>
    <linearGradient id="honey" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset=".5" stop-color="#e6a512"/>
      <stop offset="1" stop-color="#9a6a12"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <path d="M512 140l250 144v288L512 716 262 572V284L512 140z" fill="url(#honey)" stroke="#fff8e7" stroke-width="28"/>
  <circle cx="512" cy="430" r="110" fill="#fff8e7"/>
  <text x="512" y="480" text-anchor="middle" fill="#2f5d3a"
        font-family="Georgia, serif" font-size="160" font-weight="700">Б</text>
</svg>`;

const iconBase = sharp(Buffer.from(iconSvg));
for (const [filename, size] of [
  ["icon-universal-576.png", 576],
  ["icon-catalog-278.png", 278],
  ["icon-small-150.png", 150],
  ["favicon-32.png", 32],
]) {
  await iconBase.clone().resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(output, filename));
}

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9ec9e0"/>
      <stop offset=".5" stop-color="#8fbf6a"/>
      <stop offset="1" stop-color="#2f5d3a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <path d="M220 180l160 92v184L220 548 60 456V272L220 180z" fill="#e6a512" stroke="#ffe9a8" stroke-width="10"/>
  <path d="M420 140l200 115v230L420 600 220 485V255L420 140z" fill="#f3c65a" stroke="#fff8e7" stroke-width="12"/>
  <text x="680" y="280" fill="#fff8e7" font-family="Georgia, serif" font-size="92" font-weight="700">Бортник</text>
  <text x="680" y="360" fill="#1c2e24" font-family="Trebuchet MS, sans-serif" font-size="42" font-weight="700">Золотые соты</text>
  <text x="680" y="430" fill="#1c2e24" font-family="Trebuchet MS, sans-serif" font-size="28">Наполни улей!</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toFile(resolve(root, "public", "og.png"));
await sharp(Buffer.from(ogSvg))
  .resize(1120, 630, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9 })
  .toFile(resolve(output, "big-snippet-1120x630.png"));

const shotTitles = {
  start: { title: "Бортник", subtitle: "Золотые соты — наполни улей!" },
  campaign: { title: "Улей", subtitle: "Соты, банка мёда и ходы" },
  camp: { title: "Пасека", subtitle: "Улучшения сот, медогонки и дымаря" },
  quests: { title: "Задания", subtitle: "Ежедневный сбор нектара" },
};

for (const [name, copy] of Object.entries(shotTitles)) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200" viewBox="0 0 600 1200">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9ec9e0"/>
        <stop offset=".45" stop-color="#8fbf6a"/>
        <stop offset="1" stop-color="#2f5d3a"/>
      </linearGradient>
      <linearGradient id="honey" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffe9a8"/>
        <stop offset="1" stop-color="#e6a512"/>
      </linearGradient>
    </defs>
    <rect width="600" height="1200" fill="url(#bg)"/>
    <path d="M70 80h36l18 30-18 30h-36l-18-30z" fill="#e6a512" opacity=".35"/>
    <path d="M510 80h36l18 30-18 30h-36l-18-30z" fill="#e6a512" opacity=".35"/>
    <rect x="40" y="220" width="520" height="760" rx="32" fill="#fff8e7" stroke="#8a6a28" stroke-width="6"/>
    <rect x="210" y="280" width="180" height="180" rx="90" fill="url(#honey)" stroke="#fff8e7" stroke-width="4"/>
    <text x="300" y="395" text-anchor="middle" fill="#2f5d3a" font-family="Georgia, serif" font-size="72" font-weight="700">Б</text>
    <text x="300" y="520" text-anchor="middle" fill="#1c2e24" font-family="Georgia, serif" font-size="52" font-weight="700">${copy.title}</text>
    <text x="300" y="575" text-anchor="middle" fill="#2f5d3a" font-family="Trebuchet MS, sans-serif" font-size="22" font-weight="700">${copy.subtitle}</text>
    <text x="300" y="625" text-anchor="middle" fill="#5a6d5f" font-family="Trebuchet MS, sans-serif" font-size="18">Бортник — золотые соты</text>
    <circle cx="140" cy="740" r="28" fill="#f4e27a"/>
    <circle cx="220" cy="740" r="28" fill="#8b5a2b"/>
    <circle cx="300" cy="740" r="28" fill="#4caf6a"/>
    <circle cx="380" cy="740" r="28" fill="#f0a500"/>
    <circle cx="460" cy="740" r="28" fill="#d45d8c"/>
    <text x="300" y="830" text-anchor="middle" fill="#1c2e24" font-family="Trebuchet MS, sans-serif" font-size="22" font-weight="700">Нектар · мёд · осы</text>
    <text x="300" y="870" text-anchor="middle" fill="#5a6d5f" font-family="Trebuchet MS, sans-serif" font-size="16">VK Mini App · 600×1200 · «${copy.title}»</text>
  </svg>`;
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(resolve(output, `screenshot-${name}-600x1200.jpg`));
}


await writeFile(
  resolve(root, "moderation", "texts.txt"),
  `НАЗВАНИЕ
Бортник — золотые соты

ОПИСАНИЕ
«Бортник — золотые соты» — казуальная головоломка в жанре три в ряд. Игрок меняет местами соты с нектаром, собирает матчи, наполняет банку мёда и отгоняет ос. На лужайках появляются восковые печати и осы, спецфишки — пчела, матка и горшок мёда. Прогресс, улучшения пасеки, ежедневные задания и награды сохраняются между сессиями.

КРАТКОЕ ОПИСАНИЕ
Собирай нектар в сотах, вари мёд и отгоняй ос.

СЛОГАН
Наполни улей!

КАТЕГОРИЯ
Игры → Головоломки

ВОЗРАСТНОЕ ОГРАНИЧЕНИЕ
6+

КОММЕНТАРИЙ МОДЕРАТОРУ
Игра не требует специальных прав доступа. Новый пользователь проходит короткое обучение: меняет соседние соты, узнаёт о спецфишке-пчеле и цели банки мёда. Реклама за награду показывается только по инициативе пользователя; внутриигровая награда начисляется только после подтверждённого просмотра. Межстраничная реклама ограничена по частоте. Прогресс сохраняется автоматически локально и через VK Storage при доступности VK Bridge.

Проверка основного сценария:
1. Нажать «В улей».
2. Поменять две соседние соты и собрать матч из трёх.
3. Наполнить банку мёда или открыть вкладки «Пасека», «Задания» и «Итоги».
`,
);

console.log(`VK moderation assets generated in ${output}`);
