import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { adminDirectory, createAdminControl, sendAdminCommand } from "./relay-admin.mjs";

it("rejects an empty grace flag instead of silently disabling maintenance exits", async () => {
    await expect(
        promisify(execFile)(
            process.execPath,
            [resolve("server/admin-cli.mjs"), "drain", "--endless-grace="],
            { windowsHide: true },
        ),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("Usage:") });
});

it.runIf(process.platform === "win32")(
    "rejects admin control on Windows before accessing files",
    () => {
        expect(() => adminDirectory()).toThrow(/Windows is not supported/);
        const directory = join(tmpdir(), `run-escape-admin-unsupported-${randomUUID()}`);
        expect(() => createAdminControl({}, { directory })).toThrow(/Windows is not supported/);
        expect(() => sendAdminCommand("status", { directory })).toThrow(/Windows is not supported/);
        expect(existsSync(directory)).toBe(false);
    },
);

describe.skipIf(process.platform === "win32")("local Unix operator control", () => {
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
        expect(resolve(directory).startsWith(resolve(tmpdir()) + "/")).toBe(true);
        rmSync(directory, { recursive: true, force: true });
    });

    async function start() {
        control = createAdminControl(commands, { directory });
        return control.ready;
    }

    async function raw(text: string): Promise<string> {
        const { endpoint } = JSON.parse(readFileSync(join(directory, "control.json"), "utf8"));
        return new Promise((resolveResponse, reject) => {
            const socket = createConnection({ path: endpoint.path });
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

    it("protects the socket and credentials with owner-only permissions", async () => {
        await start();
        for (const path of [
            directory,
            join(directory, "control.json"),
            join(directory, "control.sock"),
        ]) {
            expect(lstatSync(path).mode & 0o077).toBe(0);
            expect(lstatSync(path).uid).toBe(process.getuid!());
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
        await run("drain", "--endless-grace=0");
        expect(commands.drain).toHaveBeenLastCalledWith({ endlessGraceSeconds: 0 });
        await expect(run("drain", "--endless-grace=-1")).rejects.toMatchObject({
            stderr: expect.stringContaining("Usage:"),
        });
    }, 15_000);
});
