/**
 * Génère le Manuel Utilisateur ARE en PDF paysage (A4).
 * Usage: node docs/manuel-utilisateur/generate-manual.mjs
 * Optionnel: ARE_MANUAL_EMAIL + ARE_MANUAL_PASSWORD pour captures authentifiées.
 */
import { chromium } from "playwright";
import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");
const APP_URL = "https://are-app.cloud";
const OUTPUT_PDF = path.join(__dirname, "Manuel_Utilisateur_ARE.pdf");
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

const SCREENSHOT_TARGETS = [
  { id: "b01-login", url: "/auth", name: "Page de connexion", needsAuth: false },
  { id: "b02-forgot-password", url: "/forgot-password", name: "Mot de passe oublié", needsAuth: false },
  { id: "b03-inbox", url: "/inbox", name: "Boîte de réception", needsAuth: true },
  { id: "b04-profile", url: "/profile", name: "Mon Profil", needsAuth: true },
  { id: "b05-account", url: "/account", name: "Menu Compte", needsAuth: true },
  { id: "b06-history", url: "/history", name: "Historique", needsAuth: true },
];

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function tryLogin(page) {
  const email = process.env.ARE_MANUAL_EMAIL;
  const password = process.env.ARE_MANUAL_PASSWORD;
  if (!email || !password) return false;

  try {
    await page.goto(`${APP_URL}/auth`, { waitUntil: "networkidle", timeout: 60000 });
    await page.fill('input[name="email"], input[type="email"]', email);
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log("  ✓ Connexion réussie");
    return true;
  } catch (err) {
    console.warn(`  ✗ Connexion échouée: ${err.message}`);
    return false;
  }
}

async function captureScreenshots(context, loggedIn) {
  await ensureDir(SCREENSHOTS_DIR);
  const captured = [];

  // Pages publiques — contexte vierge (pas de session)
  const publicCtx = await context.browser().newContext({
    viewport: { width: 1600, height: 900 },
    locale: "fr-FR",
  });
  const publicPage = await publicCtx.newPage();
  for (const target of SCREENSHOT_TARGETS.filter((t) => !t.needsAuth)) {
    try {
      await publicPage.goto(`${APP_URL}${target.url}`, { waitUntil: "networkidle", timeout: 60000 });
      await publicPage.waitForTimeout(2000);
      const filePath = path.join(SCREENSHOTS_DIR, `${target.id}.png`);
      await publicPage.screenshot({ path: filePath, fullPage: false });
      captured.push({ ...target, filePath });
      console.log(`  ✓ ${target.id}`);
    } catch (err) {
      console.warn(`  ✗ ${target.id}: ${err.message}`);
    }
  }
  await publicCtx.close();

  if (!loggedIn) return captured;

  const page = await context.newPage();
  for (const target of SCREENSHOT_TARGETS.filter((t) => t.needsAuth)) {
    try {
      await page.goto(`${APP_URL}${target.url}`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(2000);
      if (page.url().includes("/auth")) {
        console.warn(`  ⚠ ${target.id}: redirection login — ignoré`);
        continue;
      }
      const filePath = path.join(SCREENSHOTS_DIR, `${target.id}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      captured.push({ ...target, filePath });
      console.log(`  ✓ ${target.id}`);
    } catch (err) {
      console.warn(`  ✗ ${target.id}: ${err.message}`);
    }
  }

  {
    try {
      await page.goto(`${APP_URL}/inbox`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(2500);
      for (const locator of [
        page.locator("table tbody tr").first(),
        page.locator('[class*="cursor-pointer"]').nth(4),
      ]) {
        if (await locator.count()) {
          await locator.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2500);
          break;
        }
      }
      const filePath = path.join(SCREENSHOTS_DIR, "b07-mail-dossier.png");
      await page.screenshot({ path: filePath, fullPage: false });
      captured.push({ id: "b07-mail-dossier", name: "Dossier courrier", filePath });
      console.log("  ✓ b07-mail-dossier");
    } catch (err) {
      console.warn(`  ✗ b07-mail-dossier: ${err.message}`);
    }
  }
  await page.close();

  return captured;
}

async function generateTextPdf(browser) {
  const htmlPath = path.join(__dirname, "manual-text.html");
  const page = await browser.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
  const pdfPath = path.join(__dirname, "_text-temp.pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  await page.close();
  return pdfPath;
}

async function generateScreenshotPdf(captured) {
  const pdfDoc = await PDFDocument.create();

  const divider = pdfDoc.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height]);
  const { height } = divider.getSize();
  divider.drawRectangle({ x: 0, y: 0, width: A4_LANDSCAPE.width, height, color: rgb(0.055, 0.647, 0.914) });
  divider.drawText("Partie II", { x: 60, y: height / 2 + 30, size: 14, color: rgb(1, 1, 1) });
  divider.drawText("Captures d'écran", { x: 60, y: height / 2, size: 32, color: rgb(1, 1, 1) });
  divider.drawText("https://are-app.cloud", { x: 60, y: height / 2 - 40, size: 14, color: rgb(1, 1, 1) });

  for (const shot of captured) {
    if (!fs.existsSync(shot.filePath)) continue;

    const imgBytes = await fs.promises.readFile(shot.filePath);
    const image = await pdfDoc.embedPng(imgBytes);
    const page = pdfDoc.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height]);
    const { width: pw, height: ph } = page.getSize();
    const margin = 24;
    const maxW = pw - margin * 2;
    const maxH = ph - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }

  const pdfPath = path.join(__dirname, "_screenshots-temp.pdf");
  await fs.promises.writeFile(pdfPath, await pdfDoc.save());
  return pdfPath;
}

async function mergePdfs(textPdfPath, screenshotPdfPath) {
  const merged = await PDFDocument.create();

  const textDoc = await PDFDocument.load(await fs.promises.readFile(textPdfPath));
  (await merged.copyPages(textDoc, textDoc.getPageIndices())).forEach((p) => merged.addPage(p));

  if (screenshotPdfPath && fs.existsSync(screenshotPdfPath)) {
    const shotDoc = await PDFDocument.load(await fs.promises.readFile(screenshotPdfPath));
    (await merged.copyPages(shotDoc, shotDoc.getPageIndices())).forEach((p) => merged.addPage(p));
  }

  await fs.promises.writeFile(OUTPUT_PDF, await merged.save());
}

async function main() {
  console.log("Génération du Manuel Utilisateur ARE (A4 paysage)…\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    locale: "fr-FR",
  });
  const page = await context.newPage();

  console.log("Connexion (optionnelle)…");
  const loggedIn = await tryLogin(page);

  console.log("\nCaptures d'écran sur are-app.cloud…");
  const captured = await captureScreenshots(context, loggedIn);
  console.log(`  → ${captured.length} capture(s)`);

  await context.close();

  console.log("\nGénération PDF texte…");
  const textPdf = await generateTextPdf(browser);

  let screenshotPdf = null;
  if (captured.length > 0) {
    console.log("Assemblage pages captures…");
    screenshotPdf = await generateScreenshotPdf(captured);
  }

  console.log("Fusion finale…");
  await mergePdfs(textPdf, screenshotPdf);
  await browser.close();

  for (const f of [textPdf, screenshotPdf]) {
    if (f) await fs.promises.unlink(f).catch(() => {});
  }

  console.log(`\n✅ PDF généré : ${OUTPUT_PDF}`);
  if (!loggedIn) {
    console.log("\n💡 Pour ajouter des captures authentifiées (inbox, profil…), relancez avec :");
    console.log("   $env:ARE_MANUAL_EMAIL=\"votre@email\"; $env:ARE_MANUAL_PASSWORD=\"***\"; node docs/manuel-utilisateur/generate-manual.mjs");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
