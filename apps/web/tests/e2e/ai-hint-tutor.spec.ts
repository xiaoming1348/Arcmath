import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "playwright/test";

async function fillLoginForm(page: Page, email: string, password: string) {
  const emailField = page.getByLabel("Email");
  const passwordField = page.getByLabel("Password");

  await expect(emailField).toBeVisible();
  await emailField.click();
  await emailField.fill(email);
  await expect(emailField).toHaveValue(email);

  await passwordField.click();
  await passwordField.fill(password);
  await expect(passwordField).toHaveValue(password);
}

async function openProblemFromSeededSet(page: Page, problemNumber: number, options?: { direct?: boolean }) {
  const problemCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: `Problem ${problemNumber} of 6` })
  });
  const openTutorLink = problemCard.getByRole("link", { name: "Open Tutor" });

  await expect(problemCard).toBeVisible();
  if (options?.direct) {
    const href = await openTutorLink.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
  } else {
    await openTutorLink.click();
  }
  await expect(page.getByRole("heading", { name: `Problem ${problemNumber}` })).toBeVisible();
}

async function openProblemFromSet(
  page: Page,
  problemNumber: number,
  totalProblems: number,
  options?: { direct?: boolean }
) {
  const problemCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: `Problem ${problemNumber} of ${totalProblems}` })
  });
  const openTutorLink = problemCard.getByRole("link", { name: "Open Tutor" });

  await expect(problemCard).toBeVisible();
  if (options?.direct) {
    const href = await openTutorLink.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
  } else {
    await openTutorLink.click();
  }
  await expect(page.getByRole("heading", { name: `Problem ${problemNumber}` })).toBeVisible();
}

function getRunIdFromPage(page: Page): string | null {
  return new URL(page.url()).searchParams.get("runId");
}

async function openSeededSet(page: Page, setId: string) {
  const availableSetsSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Available sets" })
  });
  const setLink = availableSetsSection.locator(`a[href="/problems/set/${setId}"]`);

  await expect(availableSetsSection).toBeVisible();
  await expect(setLink).toBeVisible();
  await Promise.all([page.waitForURL(new RegExp(`/problems/set/${setId}$`)), setLink.click()]);
}

async function returnToSeededSet(page: Page) {
  await page.goto("/problems/set/seed_hint_tutor_set_v1");
  await expect(page.getByRole("heading", { name: "Hint Tutor Foundations" })).toBeVisible();
}

test("student can complete the seeded AI Hint Tutor MVP flow and generate a report", async ({ page, request }) => {
  const password = "Student12345!";
  const email = `e2e+hints-${randomUUID()}@arcmath.local`;

  const registerResponse = await request.post("/api/register", {
    data: {
      email,
      name: "Playwright E2E Student",
      password
    }
  });

  expect(registerResponse.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Modern math practice, built for focus\./i })).toBeVisible();

  await page.goto("/login?callbackUrl=%2Fproblems");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fproblems$/);
  await page.waitForLoadState("networkidle");

  await fillLoginForm(page, email, password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/problems");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Practice Sets" })).toBeVisible();
  await expect(page.locator('a[href="/problems/set/seed_hint_tutor_set_v1"]')).toBeVisible();
  await page.goto("/problems/set/seed_hint_tutor_set_v1");

  await expect(page).toHaveURL(/\/problems\/set\/seed_hint_tutor_set_v1$/);
  await expect(page.getByRole("heading", { name: "Hint Tutor Foundations" })).toBeVisible();

  await openProblemFromSeededSet(page, 1, { direct: true });
  const runId = getRunIdFromPage(page);
  expect(runId).toBeTruthy();
  await expect(page.getByText("If 2x + 3 = 11, what is the value of x?")).toBeVisible();
  await expect(page.getByText("Problem 1 of 6", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Set" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice Progression" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Problem" })).toBeVisible();
  await expect(page.getByText("Next up: Problem 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await expect(page.getByPlaceholder("Type your answer")).toHaveCount(0);
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Submit Answer" }).click();
  await expect(page.getByText("Post-attempt explanation")).toBeVisible();
  await expect(page.getByText(/Expected answer:/)).toHaveCount(0);

  await page.getByRole("link", { name: "Next Problem" }).click();
  await expect(page).toHaveURL(new RegExp(`/problems/seed_hint_tutor_p2\\?runId=${runId}$`));
  await expect(page.getByRole("heading", { name: "Problem 2" })).toBeVisible();
  await expect(page.getByText("Problem 2 of 6", { exact: true })).toBeVisible();
  await expect(page.getByText("What is the remainder when 17 is divided by 5?")).toBeVisible();

  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 1/i)).toBeVisible();
  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 2/i)).toBeVisible();

  await page.getByLabel("Your Answer").fill(" 002 ");
  await page.getByRole("button", { name: "Submit Answer" }).click();

  await expect(page.getByText("Post-attempt explanation")).toBeVisible();
  await expect(page.getByText(/Expected answer:/)).toHaveCount(0);

  await returnToSeededSet(page);
  await openProblemFromSeededSet(page, 3);
  await expect(page).toHaveURL(new RegExp(`/problems/seed_hint_tutor_p3\\?runId=${runId}$`));
  await expect(page.getByText("Simplify 3(a + 2) - a.")).toBeVisible();
  await page.getByLabel("Your Answer").fill(" ( 2A + 6 ) ");
  await page.getByRole("button", { name: "Submit Answer" }).click();
  await expect(page.getByText("Post-attempt explanation")).toBeVisible();
  await expect(page.getByText(/Expected answer:/)).toHaveCount(0);

  await page.goto(`/problems/seed_hint_tutor_p6?runId=${runId}`);
  await expect(page.getByRole("heading", { name: "Problem 6" })).toBeVisible();
  await expect(page.getByText("Problem 6 of 6", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice Progression" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Problem" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View Report" })).toBeVisible();
  await expect(
    page.getByText("You reached the end of this set. Review your latest report to continue practicing.", {
      exact: true
    })
  ).toBeVisible();

  await page.getByRole("link", { name: "View Report" }).click();
  await expect(page).toHaveURL(new RegExp(`/reports\\?runId=${runId}$`));
  await expect(page.getByRole("heading", { name: "Set Report" })).toBeVisible();
  await expect(page.getByText(/Based on your completed run for Hint Tutor Foundations/i)).toBeVisible();
  await expect(page.getByText("Problems attempted", { exact: true })).toBeVisible();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await expect(page.getByText(/Complete a few Hint Tutor attempts/i)).toHaveCount(0);

  const summarySection = page.getByRole("heading", { name: "Summary" }).locator("..");
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(summarySection.locator("p")).toContainText(/\S+/);

  const learningPatternSection = page.getByRole("heading", { name: "Learning pattern" }).locator("..");
  await expect(page.getByRole("heading", { name: "Learning pattern" })).toBeVisible();
  await expect(learningPatternSection.locator("p")).toContainText(/\S+/);

  const continuePracticeSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Continue Practice" })
  });
  await expect(page.getByRole("heading", { name: "Continue Practice" })).toBeVisible();

  const recommendedProblemLink = continuePracticeSection.getByRole("link", { name: "Continue" }).first();
  await expect(recommendedProblemLink).toBeVisible();

  const reinforcementSection = page.getByRole("heading", { name: "Topics needing reinforcement" }).locator("..");
  await expect(page.getByRole("heading", { name: "Topics needing reinforcement" })).toBeVisible();
  await expect(reinforcementSection.locator("p, li").first()).toContainText(/\S+/);

  const highHintSection = page.getByRole("heading", { name: "Problems with high hint usage" }).locator("..");
  await expect(page.getByRole("heading", { name: "Problems with high hint usage" })).toBeVisible();
  await expect(highHintSection.locator("p, li").first()).toContainText(/\S+/);

  const nextPracticeSection = page.getByRole("heading", { name: "Next practice suggestions" }).locator("..");
  await expect(page.getByRole("heading", { name: "Next practice suggestions" })).toBeVisible();
  await expect(nextPracticeSection.getByRole("listitem").first()).toBeVisible();

  await recommendedProblemLink.click();
  await expect(page).toHaveURL(/\/problems\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /Problem \d+/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hint Tutor" })).toBeVisible();
  await expect(page.getByText("Problem Prompt")).toBeVisible();
  await expect(page.getByText(/Answer format:/)).toBeVisible();
});

test("student sees reinforcement and easier follow-up after weak performance on mixed practice", async ({
  page,
  request
}) => {
  const password = "Student12345!";
  const email = `e2e-mixed-${randomUUID()}@arcmath.local`;

  const registerResponse = await request.post("/api/register", {
    data: {
      email,
      name: "Playwright Weak Path Student",
      password
    }
  });

  expect(registerResponse.ok()).toBeTruthy();

  await page.goto("/login?callbackUrl=%2Fproblems");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fproblems$/);
  await page.waitForLoadState("networkidle");

  await fillLoginForm(page, email, password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/problems");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Practice Sets" })).toBeVisible();
  await openSeededSet(page, "seed_hint_tutor_set_v2");

  await expect(page).toHaveURL(/\/problems\/set\/seed_hint_tutor_set_v2$/);
  await expect(page.getByRole("heading", { name: "Hint Tutor Mixed Practice" })).toBeVisible();

  await openProblemFromSeededSet(page, 1);
  await expect(page.getByText("If 5x - 7 = 18, what is the value of x?")).toBeVisible();
  await expect(page.getByText("Problem 1 of 6", { exact: true })).toBeVisible();
  await expect(page.getByText("Answer format: Multiple choice", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 1/i)).toBeVisible();
  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 2/i)).toBeVisible();
  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 3/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Max hints reached" })).toBeDisabled();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Submit Answer" }).click();
  await expect(page.getByText("Post-attempt explanation")).toBeVisible();
  await expect(page.getByText("Expected answer: B")).toBeVisible();

  await page.goto("/problems/set/seed_hint_tutor_set_v2");
  await expect(page.getByRole("heading", { name: "Hint Tutor Mixed Practice" })).toBeVisible();
  await openProblemFromSeededSet(page, 5);
  await expect(page.getByText("If 3x + 5 = 2x + 11, what is the value of x?")).toBeVisible();
  await expect(page.getByText("Problem 5 of 6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 1/i)).toBeVisible();
  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 2/i)).toBeVisible();
  await page.getByLabel("Your Answer").fill("5");
  await page.getByRole("button", { name: "Submit Answer" }).click();
  await expect(page.getByText("Post-attempt explanation")).toBeVisible();
  await expect(page.getByText("Expected answer: 6")).toBeVisible();

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "Your latest report" })).toBeVisible();
  await expect(page.getByText("Problems attempted", { exact: true })).toBeVisible();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await expect(page.getByText(/Complete a few Hint Tutor attempts/i)).toHaveCount(0);

  const primaryReinforcementSection = page.locator("section").filter({
    has: page.getByText("Primary reinforcement focus", { exact: true })
  });
  await expect(page.getByText("Primary reinforcement focus", { exact: true })).toBeVisible();
  await expect(primaryReinforcementSection).toContainText("Algebra / Linear equations");

  const learningPatternSection = page.getByRole("heading", { name: "Learning pattern" }).locator("..");
  await expect(page.getByRole("heading", { name: "Learning pattern" })).toBeVisible();
  await expect(learningPatternSection.locator("p")).toContainText(/\S+/);

  const reinforcementSection = page.getByRole("heading", { name: "Topics needing reinforcement" }).locator("..");
  await expect(page.getByRole("heading", { name: "Topics needing reinforcement" })).toBeVisible();
  await expect(reinforcementSection.getByRole("listitem").first()).toBeVisible();
  await expect(reinforcementSection).toContainText("Algebra / Linear equations");

  const highHintSection = page.getByRole("heading", { name: "Problems with high hint usage" }).locator("..");
  await expect(page.getByRole("heading", { name: "Problems with high hint usage" })).toBeVisible();
  await expect(highHintSection.getByRole("listitem").first()).toBeVisible();

  const nextPracticeSection = page.getByRole("heading", { name: "Next practice suggestions" }).locator("..");
  await expect(page.getByRole("heading", { name: "Next practice suggestions" })).toBeVisible();
  await expect(nextPracticeSection.getByRole("listitem").first()).toBeVisible();

  const continuePracticeSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Continue Practice" })
  });
  await expect(page.getByRole("heading", { name: "Continue Practice" })).toBeVisible();
  await expect(continuePracticeSection.getByRole("link", { name: "Continue" }).first()).toBeVisible();
  await expect(continuePracticeSection.getByText("Algebra / Linear equations", { exact: true }).first()).toBeVisible();
  await expect(continuePracticeSection.getByText("EASY", { exact: true }).first()).toBeVisible();
});

test("student can move through AMC 10A 2013 in one run and continue practicing from the report", async ({
  page,
  request
}) => {
  const password = "Student12345!";
  const email = `e2e-real-${randomUUID()}@arcmath.local`;

  const registerResponse = await request.post("/api/register", {
    data: {
      email,
      name: "Playwright Real Set Student",
      password
    }
  });

  expect(registerResponse.ok()).toBeTruthy();

  await page.goto("/login?callbackUrl=%2Fproblems");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fproblems$/);
  await page.waitForLoadState("networkidle");

  await fillLoginForm(page, email, password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/problems");
  await page.waitForLoadState("networkidle");

  const realSetCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "AMC 10A 2013" })
  });
  await expect(page.getByRole("heading", { name: "Practice Sets" })).toBeVisible();
  await expect(realSetCard).toBeVisible();

  const realSetLink = realSetCard.getByRole("link", { name: "Open Set" });
  const realSetHref = await realSetLink.getAttribute("href");
  expect(realSetHref).toMatch(/^\/problems\/set\/[^/]+$/);
  await Promise.all([page.waitForURL(new RegExp(`${realSetHref}$`)), realSetLink.click()]);
  await expect(page.getByRole("heading", { name: "AMC 10A 2013" })).toBeVisible();

  const startPracticeLink = page.getByRole("link", { name: "Start Practice" });
  await expect(startPracticeLink).toHaveAttribute("href", /runId=/);

  await openProblemFromSet(page, 1, 25, { direct: true });
  const runId = getRunIdFromPage(page);
  expect(runId).toBeTruthy();

  await expect(page.getByText(/taxi ride/i)).toBeVisible();
  await expect(page.getByText("Problem 1 of 25", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Set" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice Progression" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(5);

  await page.getByRole("button", { name: "I'm stuck" }).click();
  await expect(page.getByText(/Hint Level 1/i)).toBeVisible();

  const problem2Href = await page.getByRole("link", { name: "Next Problem" }).getAttribute("href");
  expect(problem2Href).toContain(`runId=${runId}`);
  await page.goto(problem2Href!);
  await expect(page).toHaveURL(new RegExp(`/problems/[^?]+\\?runId=${runId}$`));
  await expect(page.getByRole("heading", { name: "Problem 2" })).toBeVisible();
  await expect(page.getByText(/batch of cookies/i)).toBeVisible();
  await expect(page.getByText("Problem 2 of 25", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice Progression" })).toBeVisible();
  await page.getByRole("radio").nth(1).check({ force: true });
  await page.getByRole("button", { name: "Submit Answer" }).click();
  await expect(page.getByText("Post-attempt explanation", { exact: true })).toBeVisible();

  const problem3Href = await page.getByRole("link", { name: "Next Problem" }).getAttribute("href");
  expect(problem3Href).toContain(`runId=${runId}`);
  await page.goto(problem3Href!);
  await expect(page).toHaveURL(new RegExp(`/problems/[^?]+\\?runId=${runId}$`));
  await expect(page.getByRole("heading", { name: "Problem 3" })).toBeVisible();
  await expect(page.getByText(/Square/i)).toBeVisible();
  await expect(page.getByText("Problem 3 of 25", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice Progression" })).toBeVisible();
  await page.getByRole("radio").nth(4).check({ force: true });
  await page.getByRole("button", { name: "Submit Answer" }).click();
  await expect(page.getByText("Post-attempt explanation", { exact: true })).toBeVisible();

  await page.goto(realSetHref!);
  await expect(page.getByRole("heading", { name: "AMC 10A 2013" })).toBeVisible();
  const lastProblemCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Problem 25 of 25" })
  });
  const lastProblemLink = lastProblemCard.getByRole("link", { name: "Open Tutor" });
  await expect(lastProblemLink).toHaveAttribute("href", new RegExp(`runId=${runId}`));
  await page.goto((await lastProblemLink.getAttribute("href"))!);
  await expect(page.getByText("Problem 25 of 25", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Practice Progression" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Problem" })).toHaveCount(0);

  const viewReportLink = page.getByRole("link", { name: "View Report" });
  await expect(viewReportLink).toHaveAttribute("href", `/reports?runId=${runId}`);
  await viewReportLink.click();

  await expect(page).toHaveURL(new RegExp(`/reports\\?runId=${runId}$`));
  await expect(page.getByRole("heading", { name: "Set Report" })).toBeVisible();
  await expect(page.getByText(/AMC 10A 2013/)).toBeVisible();

  const continuePracticeSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Continue Practice" })
  });
  const continueLink = continuePracticeSection.getByRole("link", { name: "Continue" }).first();
  await expect(page.getByRole("heading", { name: "Continue Practice" })).toBeVisible();
  await expect(continueLink).toBeVisible();

  await continueLink.click();
  await expect(page).toHaveURL(/\/problems\/[^/?]+(?:\?runId=.*)?$/);
  await expect(page.getByRole("heading", { name: /Problem \d+/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hint Tutor" })).toBeVisible();
  await expect(page.getByText("Problem Prompt")).toBeVisible();
});
