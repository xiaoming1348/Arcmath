/**
 * Throwaway visual verification for the proof-workspace UI changes
 * (milestone-coverage checklist). Registers a fresh student, logs in,
 * opens USAMO 1974 P2, adds the WRONG benchmark submission (short — 2
 * steps), submits, and screenshots the SubmittedReview area.
 *
 * Run with:
 *   bash scripts/with-env-local.sh node --import tsx \
 *     apps/web/src/scripts/screenshot-proof-ui.ts
 *
 * Requires the dev server to already be running at BASE_URL (default
 * http://localhost:3000). Writes screenshots to /tmp/arcmath-*.png.
 */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const BASE_URL = process.env.ARCMATH_BASE_URL ?? "http://localhost:3000";
const PROBLEM_ID = "cmo8qdnk3000ky99yr6idjgr8"; // USAMO 1974 P2
const WRONG_STEPS = [
  "\\text{By AM-GM, } a + b + c \\geq 3\\sqrt[3]{abc}.",
  "\\text{Therefore } a^a b^b c^c \\geq (\\sqrt[3]{abc})^{a+b+c} = (abc)^{(a+b+c)/3}. \\blacksquare"
];

async function main() {
  const email = `ui-proof-${randomUUID()}@arcmath.local`;
  const password = "Student12345!";
  console.log(`[screenshot] registering ${email}`);

  // Register via REST so we don't depend on UI registration flow.
  const registerResp = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, name: "UI Proof Screenshot", password })
  });
  if (!registerResp.ok) {
    throw new Error(`register failed: ${registerResp.status} ${await registerResp.text()}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[page error]", err));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console.error]", msg.text());
  });

  try {
    // Login
    console.log("[screenshot] logging in");
    await page.goto(`${BASE_URL}/login?callbackUrl=%2Fproblems`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/problems", { timeout: 15000 });

    // Open the proof problem directly. Use domcontentloaded (not load)
    // because MathLive may keep fetching fonts/assets and trip
    // ERR_NETWORK_IO_SUSPENDED.
    console.log("[screenshot] navigating to USAMO 1974 P2");
    await page.goto(`${BASE_URL}/problems/${PROBLEM_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await page.waitForSelector("text=/Proof Workspace/i", { timeout: 60000 });

    await page.screenshot({ path: "/tmp/arcmath-01-problem-page.png", fullPage: true });
    console.log("[screenshot] /tmp/arcmath-01-problem-page.png");

    // Start a proof attempt. Click and wait for the composer section
    // ("Add step 1") to appear — math-field alone might not be visible
    // yet if mathlive hasn't loaded.
    const startBtn = page.getByRole("button", { name: /Start proof attempt/i });
    if (await startBtn.count()) {
      await startBtn.click();
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll("p")).some(
            (p) => p.textContent?.trim() === "Add step 1"
          ),
        { timeout: 60000 }
      );
      // And then for mathlive to upgrade the math-field element.
      await page.waitForFunction(
        () => {
          const f = document.querySelector("math-field") as
            | (HTMLElement & { setValue?: (v: string) => void })
            | null;
          return !!f && typeof f.setValue === "function";
        },
        { timeout: 30000 }
      );
    }

    // Add each step by programmatically setting the math-field value
    // and clicking "Add step". MathLive upgrades <math-field> lazily
    // (dynamic import in useEffect), so we poll until setValue is
    // available AND the React component's input listener is attached
    // before we set content.
    for (let i = 0; i < WRONG_STEPS.length; i += 1) {
      const latex = WRONG_STEPS[i];
      console.log(`[screenshot] adding step ${i + 1}/${WRONG_STEPS.length}`);
      // Each Add-step click remounts the composer with a new
      // composerKey, so the previous math-field is gone and a new one
      // is re-initializing.
      await page.waitForFunction(
        () => {
          const f = document.querySelector("math-field") as
            | (HTMLElement & { setValue?: (v: string) => void })
            | null;
          return !!f && typeof f.setValue === "function";
        },
        { timeout: 20000 }
      );
      await page.waitForTimeout(300); // let the React input-listener effect run
      await page.evaluate((v) => {
        const field = document.querySelector("math-field") as HTMLElement & {
          value: string;
          setValue?: (v: string, opts?: unknown) => void;
        };
        if (typeof field.setValue === "function") {
          field.setValue(v, { suppressChangeNotifications: false });
        } else {
          field.value = v;
        }
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }, latex);
      await page.waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Add step"
          );
          return btn instanceof HTMLButtonElement && !btn.disabled;
        },
        { timeout: 10000 }
      );
      await page.getByRole("button", { name: "Add step" }).click();
      // Wait for the new composer header ("Add step <i+2>") to appear.
      // This means the tRPC addStep finished, state invalidated, and
      // a fresh MathFieldEditor mounted with composerKey incremented.
      await page.waitForFunction(
        (n) => {
          const headers = Array.from(document.querySelectorAll("p")).map(
            (p) => p.textContent?.trim() ?? ""
          );
          return headers.includes(`Add step ${n}`);
        },
        i + 2,
        { timeout: 20000 }
      );
    }

    await page.screenshot({ path: "/tmp/arcmath-02-before-submit.png", fullPage: true });
    console.log("[screenshot] /tmp/arcmath-02-before-submit.png");

    // Submit for review. Grading runs step-by-step classify + judge +
    // overall review, so give it up to 3 minutes. Wait for the
    // post-submit SubmittedReview (the "Start a new attempt" button
    // only appears once locked) rather than for a substring that also
    // appears in the pre-submit copy.
    console.log("[screenshot] submitting — this takes ~30-90s for a 2-step proof");
    await page.getByRole("button", { name: /Submit for review/i }).click();
    await page.waitForSelector("button:has-text('Start a new attempt')", {
      timeout: 240000
    });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: "/tmp/arcmath-03-submitted.png", fullPage: true });
    console.log("[screenshot] /tmp/arcmath-03-submitted.png");

    // A tighter crop showing just the milestone-coverage checklist.
    const coverageHandle = await page.evaluateHandle(() => {
      const h = Array.from(document.querySelectorAll("p")).find((p) =>
        /Milestone coverage/i.test(p.textContent ?? "")
      );
      return h?.closest("div") ?? null;
    });
    const elem = coverageHandle.asElement();
    if (elem) {
      await elem.scrollIntoViewIfNeeded();
      await elem.screenshot({ path: "/tmp/arcmath-04-coverage-closeup.png" });
      console.log("[screenshot] /tmp/arcmath-04-coverage-closeup.png");
    }

    // Also extract the visible coverage labels for terminal verification.
    const coverageText = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll("p")).find((p) =>
        /Milestone coverage/i.test(p.textContent ?? "")
      );
      if (!h) return "(no 'Milestone coverage' header found)";
      const container = h.closest("div");
      return container?.textContent?.slice(0, 2000) ?? "(no container)";
    });
    console.log("\n=== Milestone coverage (extracted) ===\n" + coverageText + "\n");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
