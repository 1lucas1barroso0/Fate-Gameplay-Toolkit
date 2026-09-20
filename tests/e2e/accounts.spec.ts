import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createCharacter } from "../../lib/fate";
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "--experimental-test-module-mocks", "tests/helpers/account-http.mjs"], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Account test server did not start")), 25000);
    server.stdout?.on("data", data => { if (String(data).includes("Account test server ready")) { clearTimeout(timer); resolve(); } });
    server.on("exit", code => { clearTimeout(timer); reject(Error("Account test server exited: " + code)); });
  });
});
test.afterAll(async () => { if (server?.exitCode === null) { const closed = new Promise(resolve => server.once("exit", resolve)); server.kill("SIGTERM"); await closed; } });
async function connect(context: BrowserContext) {
  await context.route(/\/api\/(?:account|auth)(?:\/|\?|$)/, async route => {
    const request = route.request(), url = new URL(request.url());
    const response = await context.request.fetch("http://127.0.0.1:3401" + url.pathname + url.search, {
      method: request.method(), headers: request.headers(), data: request.postDataBuffer() ?? undefined,
    });
    await route.fulfill({ response });
  });
}
async function signIn(page: Page, email: string, password: string) {
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail", { exact: true }).fill(email);
  await dialog.getByLabel("Senha", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Minha conta", exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
}
async function sync(page: Page) {
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
  await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
  await expect(page.getByText("Tudo salvo na sua conta.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
test("optional accounts work across devices; signing out keeps data and deletion revokes the other device", async ({ browser, context, page }, info) => {
  test.setTimeout(110000);
  await connect(context);
  const secondContext = await browser.newContext({ viewport: info.project.use.viewport });
  await connect(secondContext);
  const second = await secondContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); second.on("pageerror", error => errors.push(error.message));
  const guest = createCharacter("Ficha só deste dispositivo");
  await page.addInitScript(sheet => {
    if (!localStorage.getItem("e2e-account-guest")) {
      localStorage.setItem("fate-gameplay-toolkit.characters.v1", JSON.stringify({ version: 1, activeId: sheet.id, characters: [sheet] }));
      localStorage.setItem("e2e-account-guest", "1");
    }
  }, guest);
  const email = `browser-${info.project.name}@example.test`, password = "Uma senha longa para testar 123";
  try {
    await page.goto("/");
    await expect(page.locator(".sheet-name-field")).toHaveValue(guest.name);
    for (const dark of [true,false]) {
      await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      await page.locator('.app-header').screenshot({path:`test-results/header-${info.project.name}-${dark?'dark':'light'}.png`});
    }
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Como quer ser chamado?", { exact: true }).fill("Narrador");
    await dialog.getByLabel("E-mail", { exact: true }).fill(email);
    await dialog.getByLabel("Senha", { exact: true }).fill(password);
    await dialog.getByLabel("Repita a senha", { exact: true }).fill(password);
    await dialog.getByLabel("Levar os dados deste dispositivo para a conta", { exact: true }).check();
    await dialog.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Baixar chave", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Já guardei", exact: true }).click();
    await expect(dialog.getByText("Tudo salvo na sua conta.", { exact: true })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `test-results/account-${info.project.name}.png`, fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.locator(".sheet-name-field").fill("Ficha da conta"); await sync(page);
    await second.goto("/"); await signIn(second, email, password);
    await expect(second.locator(".sheet-name-field")).toHaveValue("Ficha da conta");
    await second.locator(".sheet-name-field").fill("Mudança no segundo dispositivo"); await sync(second); await sync(page);
    await expect(page.locator(".sheet-name-field")).toHaveValue("Mudança no segundo dispositivo");
    await page.getByRole("button", { name: "Minha conta", exact: true }).click();
    await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.locator(".sheet-name-field")).toHaveValue(guest.name);
    await signIn(page, email, password);
    await expect(page.locator(".sheet-name-field")).toHaveValue("Mudança no segundo dispositivo");
    const sameBrowserTab=await context.newPage();
    await sameBrowserTab.goto('/');
    await expect(sameBrowserTab.getByRole('button',{name:'Minha conta',exact:true})).toBeVisible();
    const offlineRoute=async (route: import('@playwright/test').Route)=>route.abort('internetdisconnected');
    const accountRoutes=/\/api\/(?:account|auth)(?:\/|\?|$)/;
    await context.route(accountRoutes,offlineRoute);
    await context.setOffline(true);
    await page.locator('.sheet-name-field').fill('Mudança guardada sem conexão');
    await page.getByRole('button',{name:'Minha conta',exact:true}).click();
    await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.sheet-name-field')).toHaveValue(guest.name);
    const cachedName=()=>page.evaluate(()=>{
      const key=Object.keys(localStorage).find(key=>key.startsWith('fate-gameplay-toolkit.account-cache.'))!;
      const cache=JSON.parse(localStorage.getItem(key)!);
      return JSON.parse(cache.data['fate-gameplay-toolkit.characters.v1']).characters[0].name;
    });
    await expect.poll(cachedName).toBe('Mudança guardada sem conexão');
    await expect(sameBrowserTab.getByRole('button',{name:'Entrar',exact:true}).first()).toBeVisible();
    await sameBrowserTab.close();
    // Reload the document while only the account service remains unreachable.
    await context.setOffline(false); await page.reload();
    await expect(page.locator('.sheet-name-field')).toHaveValue(guest.name);
    expect(await page.evaluate(()=>Boolean(localStorage.getItem('fate-gameplay-toolkit.account-signed-out.v1')))).toBe(true);
    await expect.poll(cachedName).toBe('Mudança guardada sem conexão');
    await context.unroute(accountRoutes,offlineRoute);
    await signIn(page,email,password); await sync(page);
    await expect(page.locator('.sheet-name-field')).toHaveValue('Mudança guardada sem conexão');
    await sync(second);
    await expect(second.locator('.sheet-name-field')).toHaveValue('Mudança guardada sem conexão');
    await second.getByRole("button", { name: "Minha conta", exact: true }).click();
    await second.getByRole("button", { name: "Apagar cadastro", exact: true }).click();
    await second.getByLabel("Sua senha", { exact: true }).fill(password);
    await second.getByLabel("Quero apagar meu cadastro e os dados da conta.", { exact: true }).check();
    await second.getByRole("button", { name: "Apagar cadastro e dados", exact: true }).click();
    await expect(second.getByText("Cadastro e dados da conta apagados.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Minha conta", exact: true }).click();
    await page.getByRole("button", { name: "Sincronizar agora", exact: true }).click();
    await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
    await expect(page.locator(".sheet-name-field")).toHaveValue(guest.name);
    expect(errors).toEqual([]);
  } finally { await secondContext.close(); }
});
