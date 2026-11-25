import { expect, test } from "@playwright/test";
import { seedAgentMessages } from "../../fixtures/agentMessage";
import { loginViaApi } from "../../fixtures/auth";
import { waitForSeedState } from "../../fixtures/seedState";
import { dismissOwnerOnboarding } from "../../fixtures/session";

test("channel settings, member actions, and avatar menu share the individual mute state", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  const seed = await waitForSeedState();
  const { accessToken } = await loginViaApi(request, seed);
  await dismissOwnerOnboarding(request, seed, accessToken);
  const headers = { Authorization: `Bearer ${accessToken}`, "X-Server-Id": seed.server.id };
  const name = `delivery-${Date.now().toString(36)}`;
  const created = await request.post(`${seed.urls.api}/api/channels`, { headers, data: { name } });
  expect(created.ok()).toBeTruthy();
  const channel = await created.json() as { id: string; name: string };
  const added = await request.post(`${seed.urls.api}/api/channels/${channel.id}/members`, {
    headers, data: { agentId: seed.externalAgent.id },
  });
  expect(added.ok()).toBeTruthy();
  await seedAgentMessages(seed, seed.externalAgent.id, accessToken, `#${channel.name}`, ["Agent delivery fixture"]);

  await page.context().addInitScript(() => {
    localStorage.setItem("slock-theme-preferences-v2", JSON.stringify({ mode: "dark" }));
  });
  await page.goto(`/s/${seed.server.slug}/channel/${channel.id}`);
  const avatar = page.locator('button[data-avatar-kind="agent"]');
  await expect(avatar).toBeVisible({ timeout: 30_000 });
  const viewer = await page.context().newPage();
  await viewer.goto(page.url());
  const viewerAvatar = viewer.locator('button[data-avatar-kind="agent"]');
  await expect(viewerAvatar).toBeVisible({ timeout: 30_000 });
  const viewerDetails = viewer.getByTestId("channel-overflow-trigger");
  await viewerDetails.press("Enter");
  const viewerSwitch = viewer.getByRole("switch", { name: "Mute all agents" });
  await expect(viewerSwitch).not.toBeChecked();
  await page.bringToFront();

  const credential = await fetch(`${seed.urls.api}/api/agents/${seed.externalAgent.id}/credentials`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ scopes: ["channels"], name: "e2e-agent-self-mute" }),
  });
  expect(credential.ok).toBeTruthy();
  const { apiKey } = await credential.json() as { apiKey: string };
  const selfMute = await fetch(`${seed.urls.api}/internal/agent-api/channels/${channel.id}/mute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  expect(selfMute.ok).toBeTruthy();
  await expect(avatar.getByRole("img", { name: "Muted" })).toBeVisible();
  await expect(viewerAvatar.getByRole("img", { name: "Muted" })).toBeVisible();

  const details = page.getByTestId("channel-overflow-trigger");
  await details.press("Enter");
  await page.getByTestId("channel-overflow-members-entry").press("Enter");
  const bell = page.getByTestId("channel-agent-delivery-member-action");
  await expect(bell).toHaveAccessibleName(/Unmute agent/);
  await bell.press("Enter");
  await expect(bell).toHaveAccessibleName(/Mute agent/);
  await page.getByTestId("member-page-back").press("Enter");
  const all = page.getByRole("switch", { name: "Mute all agents" });
  await expect(all).toBeVisible();
  await expect(all).not.toBeChecked();
  await all.press("Space");
  await expect(all).toBeChecked();
  await expect(viewerSwitch).toBeChecked();
  await all.press("Space");
  await expect(all).not.toBeChecked();
  await expect(viewerSwitch).not.toBeChecked();
  await details.press("Enter");
  await expect(details).toHaveAttribute("aria-pressed", "false");

  await avatar.click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Mute agent", exact: true }).press("Enter");
  const mutedBadge = avatar.getByRole("img", { name: "Muted" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(mutedBadge).toBeVisible();
    await expect.poll(() => mutedBadge.evaluate(badge => {
      const avatarFrame = badge.parentElement!;
      const frame = avatarFrame.getBoundingClientRect();
      const border = getComputedStyle(avatarFrame);
      const box = badge.getBoundingClientRect();
      return {
        x: Math.round(box.left - frame.left - parseFloat(border.borderLeftWidth)),
        y: Math.round(box.top - frame.top - parseFloat(border.borderTopWidth)),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    })).toEqual({ x: -4, y: -4, width: 18, height: 18 });
    await page.screenshot({ path: testInfo.outputPath(`muted-avatar-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await avatar.click({ button: "right", force: true });
  await page.getByRole("menuitem", { name: "Unmute agent", exact: true }).press("Enter");
  await expect(avatar.getByRole("img", { name: "Muted" })).toHaveCount(0);

  await details.press("Enter");
  await expect(all).not.toBeChecked();
  await page.getByTestId("channel-overflow-members-entry").press("Enter");
  await expect(bell).toHaveAccessibleName(/Mute agent/);
});
