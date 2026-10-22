import { emitKeypressEvents } from "node:readline";
import { auth, bootstrapAdmin } from "../lib/auth.ts";

function readHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = input.isRaw;
    let value = "";

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    output.write(label);

    function finish(error) {
      input.off("keypress", onKeypress);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onKeypress(text, key = {}) {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Cancelled."));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }
      if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }
      if (!key.ctrl && !key.meta && text) {
        value += text;
        output.write("*".repeat([...text].length));
      }
    }

    input.on("keypress", onKeypress);
  });
}

async function askForConfirmedPassword({ minPasswordLength, maxPasswordLength }) {
  while (true) {
    const password = await readHidden("Password: ");
    const confirmation = await readHidden("Confirm password: ");

    if (password !== confirmation) {
      console.error("Passwords did not match. Try again.");
      continue;
    }
    if (password.length < minPasswordLength) {
      console.error(`Password must be at least ${minPasswordLength} characters. Try again.`);
      continue;
    }
    if (password.length > maxPasswordLength) {
      console.error(`Password must be no more than ${maxPasswordLength} characters. Try again.`);
      continue;
    }
    return password;
  }
}

async function main() {
  const admin = bootstrapAdmin();
  if (!admin) throw new Error("Set GATEY_ADMIN_EMAIL and GATEY_ADMIN_USERNAME in .env first.");
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(admin.email);

  console.log(existing
    ? `Resetting the password for ${admin.username} (${admin.email}).`
    : `Creating ${admin.username} (${admin.email}) as the Gatey administrator.`);

  const password = await askForConfirmedPassword(context.password.config);

  if (!existing) {
    await auth.api.createUser({
      body: {
        email: admin.email,
        password,
        name: admin.name,
        role: "admin",
        data: {
          username: admin.username,
          emailVerified: true,
        },
      },
    });
    console.log("Administrator created. You can now sign in with the username or email above.");
    return;
  }

  const credentialAccount = await context.internalAdapter.findCredentialAccount(existing.user.id);
  if (!credentialAccount) {
    throw new Error(`${admin.username} exists without a password account. Refusing to modify an unexpected account shape.`);
  }

  const passwordHash = await context.password.hash(password);
  await context.internalAdapter.updatePassword(existing.user.id, passwordHash);
  await context.internalAdapter.deleteUserSessions(existing.user.id);
  console.log("Password reset. Existing sessions were revoked; you can sign in with the new password.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not bootstrap the administrator.");
  process.exitCode = 1;
});
