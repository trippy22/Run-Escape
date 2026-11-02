import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { adminDirectory, createAdminControl, sendAdminCommand } from "./relay-admin.mjs";

describe("local operator control", () => {
    let directory: string;
    let control: ReturnType<typeof createAdminControl> | undefined;
    let state: {
        draining: boolean;
        ready: boolean;
        activeRuns: number;
        endlessRuns: number;
        pendingPlayers: number;
    };
    let commands: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), "run-escape-admin-test-"));
        state = { draining: false, ready: false, activeRuns: 1, endlessRuns: 1, pendingPlayers: 2 };
        commands = {
            status: vi.fn(() => state),
            drain: vi.fn(() => (state = { ...state, draining: true })),
            cancel: vi.fn(() => (state = { ...state, draining: false })),
        };
    });
    afterEach(() => {
        control?.close();
        control = undefined;
        // Only the exact directory created for this test, inside the OS temp directory.
        expect(
            resolve(directory).startsWith(resolve(tmpdir()) + "/") ||
                resolve(directory).startsWith(resolve(tmpdir()) + "\\"),
        ).toBe(true);
        rmSync(directory, { recursive: true, force: true });
    });

    async function start() {
        control = createAdminControl(commands, { directory });
        return control.ready;
    }

    async function raw(text: string): Promise<string> {
        const { endpoint } = JSON.parse(readFileSync(join(directory, "control.json"), "utf8"));
        return new Promise((resolveResponse, reject) => {
            const socket = createConnection(
                endpoint.path
                    ? { path: endpoint.path }
                    : { host: "127.0.0.1", port: endpoint.port },
            );
            let response = "";
            socket.setEncoding("utf8");
            socket.on("connect", () => socket.write(text));
            socket.on("data", (data) => (response += data));
            socket.on("error", reject);
            socket.on("close", () => resolveResponse(response));
        });
    }

    it("requires the protected key and rejects HTTP, malformed, unknown, and oversized commands", async () => {
        await start();
        const credentials = JSON.parse(readFileSync(join(directory, "control.json"), "utf8"));
        for (const request of [
            { command: "drain" },
            { command: "drain", token: "0".repeat(64) },
            { command: "restart", token: credentials.token },
        ]) {
            expect(JSON.parse(await raw(JSON.stringify(request) + "\n")).ok).toBe(false);
        }
        expect(JSON.parse(await raw("POST /drain HTTP/1.1\r\n\r\n")).ok).toBe(false);
        expect(JSON.parse(await raw("null\n")).ok).toBe(false);
        expect(await raw("x".repeat(1025))).toBe("");
        expect(commands.drain).not.toHaveBeenCalled();
        expect(
            (await sendAdminCommand("drain", { directory, options: { endlessGraceSeconds: 300 } }))
                .status.draining,
        ).toBe(true);
        expect(commands.drain).toHaveBeenCalledWith({ endlessGraceSeconds: 300 });
        expect((await sendAdminCommand("cancel", { directory })).status.draining).toBe(false);
        expect((await sendAdminCommand("status", { directory })).status.ready).toBe(false);
    });

    it("protects credentials with owner permissions and denies Windows network access", async () => {
        await start();
        if (process.platform === "win32") {
            const script =
                "$a = [System.IO.Directory]::GetAccessControl($args[0]); [pscustomobject]@{ protected = $a.AreAccessRulesProtected; rules = @($a.Access | ForEach-Object { [pscustomobject]@{ sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; type = $_.AccessControlType.ToString() } }); owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value } | ConvertTo-Json -Depth 4";
            // Script path avoids shell interpolation of the temporary directory.
            const scriptFile = join(directory, "check-acl.ps1");
            writeFileSync(scriptFile, script);
            const acl = JSON.parse(
                execFileSync(
                    "powershell.exe",
                    ["-NoProfile", "-NonInteractive", "-File", scriptFile, directory],
                    { encoding: "utf8", windowsHide: true },
                ),
            );
            expect(acl.protected).toBe(true);
            expect(acl.rules).toContainEqual({ sid: "S-1-5-2", type: "Deny" });
            expect(
                acl.rules
                    .filter((r: { type: string }) => r.type === "Allow")
                    .map((r: { sid: string }) => r.sid)
                    .sort(),
            ).toEqual([acl.owner, "S-1-5-18"].sort());
        } else {
            for (const path of [
                directory,
                join(directory, "control.json"),
                join(directory, "control.sock"),
            ]) {
                expect(lstatSync(path).mode & 0o077).toBe(0);
                expect(lstatSync(path).uid).toBe(process.getuid!());
            }
        }
    });

    it("does not replace a live instance and cleans up idempotently", async () => {
        await start();
        const before = readFileSync(join(directory, "control.json"), "utf8");
        expect(() => createAdminControl(commands, { directory })).toThrow(/already exists/);
        expect(readFileSync(join(directory, "control.json"), "utf8")).toBe(before);
        control!.close();
        control!.close();
        expect(existsSync(join(directory, "control.json"))).toBe(false);
        await start();
        expect(readFileSync(join(directory, "control.json"), "utf8")).not.toBe(before);
    });

    it("settles readiness if closed during startup", async () => {
        control = createAdminControl(commands, { directory });
        const rejected = expect(control.ready).rejects.toThrow(/closed/);
        control.close();
        await rejected;
        expect(existsSync(join(directory, "control.json"))).toBe(false);
    });

    it("recovers a stopped process's descriptor but refuses ambiguous credentials", async () => {
        await start();
        control!.close();
        const file = join(directory, "control.json");
        writeFileSync(file, "", { mode: 0o600 });
        expect(() => createAdminControl(commands, { directory })).toThrow(/already exists/);
        const pid = Number(
            execFileSync(process.execPath, ["-e", "console.log(process.pid)"], {
                encoding: "utf8",
                windowsHide: true,
            }),
        );
        writeFileSync(file, JSON.stringify({ version: 1, pid }));
        await start();
        expect((await sendAdminCommand("status", { directory })).status.draining).toBe(false);
    });

    it("CLI waits for readiness and fails on cancellation without restarting anything", async () => {
        rmSync(directory, { recursive: true });
        const env = { ...process.env, MULTIPLAYER_ADMIN_ID: randomUUID() };
        directory = adminDirectory(env);
        await start();
        const cli = resolve("server/admin-cli.mjs");
        const run = (...args: string[]) =>
            promisify(execFile)(process.execPath, [cli, ...args], { env, windowsHide: true });
        expect(JSON.parse((await run("status", "--json")).stdout).draining).toBe(false);
        const waiting = run("drain", "--wait", "--endless-grace=300");
        await vi.waitFor(() => expect(commands.drain).toHaveBeenCalled());
        state = { ...state, ready: true, activeRuns: 0, pendingPlayers: 0 };
        expect((await waiting).stdout).toContain("Ready to restart");
        expect(commands.drain).toHaveBeenCalledWith({ endlessGraceSeconds: 300 });
        state = { ...state, ready: false };
        commands.drain.mockClear();
        const cancelled = expect(run("drain", "--wait")).rejects.toMatchObject({
            stderr: expect.stringContaining("Drain cancelled"),
        });
        await vi.waitFor(() => expect(commands.drain).toHaveBeenCalled());
        await run("cancel");
        await cancelled;
        await expect(run("drain", "--endless-grace=0")).rejects.toMatchObject({
            stderr: expect.stringContaining("Usage:"),
        });
    }, 15_000);
});
