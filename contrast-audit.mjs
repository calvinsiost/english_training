import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, 'contrast-audit');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// WCAG contrast ratio calculation
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = luminance(...rgb1);
  const l2 = luminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function rgbaToRgb(rgba, bgRgb) {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return bgRgb;
  const [, r, g, b, a = '1'] = match;
  const alpha = parseFloat(a);
  return [
    Math.round(parseInt(r) * alpha + bgRgb[0] * (1 - alpha)),
    Math.round(parseInt(g) * alpha + bgRgb[1] * (1 - alpha)),
    Math.round(parseInt(b) * alpha + bgRgb[2] * (1 - alpha))
  ];
}

function parseColor(color, bgRgb = [20, 24, 33]) {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  if (color.startsWith('#')) return hexToRgb(color);
  if (color.startsWith('rgb')) return rgbaToRgb(color, bgRgb);
  return null;
}

function wcagLevel(ratio, fontSize, fontWeight) {
  const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
  if (isLarge) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3) return 'AA';
    return 'FAIL';
  }
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'FAIL';
}

async function auditView(page, viewName, hash) {
  // Navigate to view
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(400);

  // Screenshot
  await page.screenshot({ path: join(SCREENSHOTS_DIR, `${viewName}.png`), fullPage: true });

  // Collect all visible text elements and their computed styles
  const elements = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    function getEffectiveBg(el) {
      let current = el;
      while (current && current !== document.documentElement) {
        const style = getComputedStyle(current);
        const bg = style.backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          return bg;
        }
        current = current.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor || 'rgb(20, 24, 33)';
    }

    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      // Skip hidden elements
      if (el.offsetParent === null && el.tagName !== 'BODY') continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      // Get direct text content (not from children)
      const hasDirectText = Array.from(el.childNodes).some(n =>
        n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0
      );
      if (!hasDirectText) continue;

      const textContent = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .join(' ')
        .trim();
      if (!textContent || textContent.length === 0) continue;

      // Deduplicate
      const key = `${textContent}|${style.color}|${style.fontSize}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const bg = getEffectiveBg(el);

      results.push({
        tag: el.tagName.toLowerCase(),
        class: el.className?.toString().split(' ').slice(0, 2).join(' ') || '',
        text: textContent.slice(0, 40),
        color: style.color,
        bgColor: bg,
        fontSize: parseFloat(style.fontSize),
        fontWeight: parseInt(style.fontWeight) || 400,
      });
    }
    return results;
  });

  return elements;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // Serve via file protocol
  const indexPath = `file:///${__dirname.replace(/\\/g, '/')}/index.html`;
  await page.goto(indexPath);
  await page.waitForTimeout(1000);

  // Init Lucide icons
  await page.evaluate(() => {
    if (window.lucide) window.lucide.createIcons();
  });
  await page.waitForTimeout(300);

  const views = [
    { name: 'dashboard', hash: '#/' },
    { name: 'study', hash: '#/study' },
    { name: 'settings', hash: '#/settings' },
    { name: 'exam', hash: '#/exam' },
    { name: 'review', hash: '#/review' },
    { name: 'analytics', hash: '#/analytics' },
  ];

  const allResults = {};
  const issues = [];

  for (const view of views) {
    console.log(`\nAuditing: ${view.name}...`);
    const elements = await auditView(page, view.name, view.hash);

    const viewResults = [];
    for (const el of elements) {
      const bgRgb = parseColor(el.bgColor) || [20, 24, 33];
      const fgRgb = parseColor(el.color, bgRgb);
      if (!fgRgb) continue;

      const ratio = contrastRatio(fgRgb, bgRgb);
      const level = wcagLevel(ratio, el.fontSize, el.fontWeight);

      const entry = {
        element: `<${el.tag}> .${el.class}`,
        text: el.text,
        fg: el.color,
        bg: el.bgColor,
        fontSize: `${el.fontSize}px`,
        fontWeight: el.fontWeight,
        ratio: ratio.toFixed(2),
        level,
      };

      viewResults.push(entry);

      if (level === 'FAIL') {
        issues.push({ view: view.name, ...entry });
      }
    }

    allResults[view.name] = viewResults;
  }

  // Generate report
  let report = '# Contrast Audit Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;

  // Summary
  const totalElements = Object.values(allResults).flat().length;
  const failCount = issues.length;
  const aaCount = Object.values(allResults).flat().filter(e => e.level === 'AA').length;
  const aaaCount = Object.values(allResults).flat().filter(e => e.level === 'AAA').length;

  report += `## Summary\n\n`;
  report += `- Total text elements audited: **${totalElements}**\n`;
  report += `- AAA (>=7:1 / >=4.5:1 large): **${aaaCount}** ✓\n`;
  report += `- AA (>=4.5:1 / >=3:1 large): **${aaCount}** ✓\n`;
  report += `- FAIL (<4.5:1 / <3:1 large): **${failCount}** ✗\n\n`;

  // Issues
  if (issues.length > 0) {
    report += `## ✗ Contrast Failures\n\n`;
    report += `| View | Element | Text | Ratio | Size | FG | BG |\n`;
    report += `|------|---------|------|-------|------|----|----|\n`;
    for (const i of issues) {
      report += `| ${i.view} | ${i.element} | ${i.text.slice(0, 25)} | ${i.ratio}:1 | ${i.fontSize} | ${i.fg} | ${i.bg} |\n`;
    }
    report += '\n';
  }

  // Detail per view
  for (const [viewName, results] of Object.entries(allResults)) {
    report += `## ${viewName}\n\n`;
    if (results.length === 0) {
      report += `No visible text elements found.\n\n`;
      continue;
    }
    report += `| Level | Ratio | Text | Element | FG | BG | Size |\n`;
    report += `|-------|-------|------|---------|----|----|------|\n`;
    for (const r of results) {
      const icon = r.level === 'FAIL' ? '✗' : r.level === 'AAA' ? '✓✓' : '✓';
      report += `| ${icon} ${r.level} | ${r.ratio}:1 | ${r.text.slice(0, 25)} | ${r.element.slice(0, 30)} | ${r.fg} | ${r.bg} | ${r.fontSize} |\n`;
    }
    report += '\n';
  }

  // CSS variable analysis
  report += `## CSS Variable Contrast Analysis\n\n`;
  const bgPrimary = [20, 24, 33];     // #141821
  const bgSecondary = [28, 32, 48];   // #1c2030
  const bgTertiary = [37, 42, 58];    // #252a3a
  const textPrimary = [232, 234, 237]; // #e8eaed
  const textSecondary = [160, 168, 184]; // #a0a8b8
  const textMuted = [107, 114, 128];  // #6b7280
  const accent = [91, 141, 239];      // #5b8def

  const combos = [
    ['--text-primary', textPrimary, '--bg-primary', bgPrimary],
    ['--text-primary', textPrimary, '--bg-secondary', bgSecondary],
    ['--text-primary', textPrimary, '--bg-tertiary', bgTertiary],
    ['--text-secondary', textSecondary, '--bg-primary', bgPrimary],
    ['--text-secondary', textSecondary, '--bg-secondary', bgSecondary],
    ['--text-secondary', textSecondary, '--bg-tertiary', bgTertiary],
    ['--text-muted', textMuted, '--bg-primary', bgPrimary],
    ['--text-muted', textMuted, '--bg-secondary', bgSecondary],
    ['--text-muted', textMuted, '--bg-tertiary', bgTertiary],
    ['--accent', accent, '--bg-primary', bgPrimary],
    ['--accent', accent, '--bg-secondary', bgSecondary],
    ['--accent', accent, '--bg-tertiary', bgTertiary],
  ];

  report += `| FG Variable | BG Variable | Ratio | AA Normal | AA Large | AAA Normal |\n`;
  report += `|-------------|-------------|-------|-----------|----------|------------|\n`;
  for (const [fgName, fg, bgName, bg] of combos) {
    const r = contrastRatio(fg, bg);
    report += `| ${fgName} | ${bgName} | ${r.toFixed(2)}:1 | ${r >= 4.5 ? '✓' : '✗'} | ${r >= 3 ? '✓' : '✗'} | ${r >= 7 ? '✓' : '✗'} |\n`;
  }
  report += '\n';

  writeFileSync(join(SCREENSHOTS_DIR, 'report.md'), report);
  console.log(`\n${'='.repeat(50)}`);
  console.log(report);
  console.log(`Screenshots and report saved to: ${SCREENSHOTS_DIR}`);

  await browser.close();
}

main().catch(console.error);
