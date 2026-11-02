// Operator control never goes through HTTP, WebSocket, or the metrics listener.
// Unix uses an owner-only socket directory. Windows uses loopback TCP plus an
// access key in an ACL-protected directory (Windows pipes can be reached over SMB).
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
    chmodSync,
    closeSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_REQUEST = 1024;
const MAX_RESPONSE = 4096;
const REPO = resolve(fileURLToPath(import.meta.url), "../..");

export function adminDirectory(env = process.env) {
    const id = env.MULTIPLAYER_ADMIN_ID ?? "default";
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new Error("Invalid MULTIPLAYER_ADMIN_ID");
    const owner = process.getuid?.() ?? userInfo().username;
    const key = createHash("sha256").update(`${owner}:${REPO}:${id}`).digest("hex").slice(0, 16);
    return join(tmpdir(), `run-escape-admin-${key}`);
}

function checkDirectory(directory) {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("Admin directory must be a real directory");
    if (
        process.platform !== "win32" &&
        (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
    ) {
        throw new Error("Admin directory must belong to the server account with mode 0700");
    }
}

function prepareDirectory(directory) {
    try {
        mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
    }
    checkDirectory(directory);
    if (process.platform === "win32") {
        // Set a fresh DACL before writing any key; never trust inherited access.
        execFileSync(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                join(REPO, "server", "secure-admin-directory.ps1"),
                directory,
            ],
            { windowsHide: true, stdio: "pipe", timeout: 10_000 },
        );
    }
}

function removeStaleControl(directory, credentialPath) {
    // Recover after a service manager stops the process without running cleanup.
    // Never replace a live instance, an ambiguous file, or a reused PID.
    const stat = lstatSync(credentialPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RESPONSE) return false;
    let previous;
    try {
        previous = JSON.parse(readFileSync(credentialPath, "utf8"));
    } catch {
        return false;
    }
    if (previous.version !== 1 || !Number.isInteger(previous.pid) || previous.pid <= 0)
        return false;
    try {
        process.kill(previous.pid, 0);
        return false;
    } catch (error) {
        if (error.code !== "ESRCH") return false;
    }
    const socketPath = join(directory, "control.sock");
    if (process.platform !== "win32") {
        try {
            if (!lstatSync(socketPath).isSocket()) return false;
            unlinkSync(socketPath);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
    unlinkSync(credentialPath);
    return true;
}

export function createAdminControl(commands, { directory = adminDirectory() } = {}) {
    prepareDirectory(directory);
    const credentialPath = join(directory, "control.json");
    // Exclusive creation prevents one relay instance from replacing another's control channel.
    let fd;
    try {
        fd = openSync(credentialPath, "wx", 0o600);
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const lockPath = join(directory, "recovery.lock");
        const lock = openSync(lockPath, "wx", 0o600);
        try {
            if (!removeStaleControl(directory, credentialPath)) {
                throw new Error(
                    `Admin control already exists at ${credentialPath}. Verify its process is stopped before removing that file and control.sock. Use MULTIPLAYER_ADMIN_ID for another instance.`,
                );
            }
            fd = openSync(credentialPath, "wx", 0o600);
        } finally {
            closeSync(lock);
            unlinkSync(lockPath);
        }
    }
    const token = randomBytes(32).toString("hex");
    const secret = Buffer.from(token, "hex");
    const instance = randomBytes(16).toString("hex");
    const sockets = new Set();
    let closed = false;
    const server = createServer((socket) => {
        if (sockets.size >= 16) {
            socket.destroy();
            return;
        }
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.on("error", () => socket.destroy());
        socket.setTimeout(5000, () => socket.destroy());
        let buffer = Buffer.alloc(0);
        let answered = false;
        socket.on("data", (chunk) => {
            if (answered) return;
            if (buffer.length + chunk.length > MAX_REQUEST) {
                socket.destroy();
                return;
            }
            buffer = Buffer.concat([buffer, chunk]);
            const newline = buffer.indexOf(10);
            if (newline < 0) return;
            answered = true;
            let response;
            try {
                if (
                    buffer
                        .subarray(newline + 1)
                        .toString()
                        .trim()
                )
                    throw new Error("Invalid request");
                const request = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
                const supplied =
                    typeof request?.token === "string" && /^[a-f0-9]{64}$/.test(request.token)
                        ? Buffer.from(request.token, "hex")
                        : Buffer.alloc(0);
                if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) {
                    throw new Error("Unauthorized");
                }
                if (!["drain", "cancel", "status"].includes(request.command))
                    throw new Error("Unknown command");
                response = {
                    ok: true,
                    instance,
                    status: commands[request.command](request.options),
                };
            } catch (error) {
                response = { ok: false, error: error.message };
            }
            socket.end(JSON.stringify(response) + "\n");
        });
    });
    const abort = new AbortController();
    let ownsCredential = true;
    const cleanup = () => {
        process.off("exit", cleanup);
        if (!ownsCredential) return;
        ownsCredential = false;
        if (fd !== undefined) {
            closeSync(fd);
            fd = undefined;
        }
        try {
            unlinkSync(credentialPath);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    };
    process.once("exit", cleanup);
    let rejectReady;
    const ready = new Promise((resolveReady, reject) => {
        rejectReady = reject;
        server.once("error", (error) => {
            cleanup();
            reject(error);
        });
        server.once("listening", () => {
            if (closed) return;
            try {
                const address = server.address();
                const endpoint =
                    typeof address === "string" ? { path: address } : { port: address.port };
                if (endpoint.path) chmodSync(endpoint.path, 0o600);
                writeFileSync(
                    fd,
                    JSON.stringify({ version: 1, pid: process.pid, token, instance, endpoint }),
                );
                closeSync(fd);
                fd = undefined;
                resolveReady({ directory, endpoint, instance });
            } catch (error) {
                abort.abort();
                cleanup();
                reject(error);
            }
        });
    });
    server.listen(
        process.platform === "win32"
            ? { host: "127.0.0.1", port: 0, signal: abort.signal }
            : { path: join(directory, "control.sock"), signal: abort.signal },
    );
    server.unref();
    return {
        ready,
        close() {
            if (closed) return;
            closed = true;
            rejectReady(new Error("Admin control closed"));
            abort.abort();
            for (const socket of sockets) socket.destroy();
            cleanup();
        },
    };
}

export function sendAdminCommand(command, { directory = adminDirectory(), options } = {}) {
    checkDirectory(directory);
    const file = join(directory, "control.json");
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RESPONSE)
        throw new Error("Invalid admin credentials file");
    if (
        process.platform !== "win32" &&
        (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
    ) {
        throw new Error("Admin credentials must belong to the server account with mode 0600");
    }
    const credentials = JSON.parse(readFileSync(file, "utf8"));
    if (credentials.version !== 1 || typeof credentials.token !== "string")
        throw new Error("Invalid admin credentials");
    const endpoint = credentials.endpoint;
    let target;
    if (
        process.platform === "win32" &&
        Number.isInteger(endpoint?.port) &&
        endpoint.port > 0 &&
        endpoint.port <= 65535
    ) {
        target = { host: "127.0.0.1", port: endpoint.port };
    } else if (process.platform !== "win32" && endpoint?.path === join(directory, "control.sock")) {
        target = { path: endpoint.path };
    } else throw new Error("Admin endpoint must be local");
    return new Promise((resolveResponse, reject) => {
        const socket = createConnection(target);
        let buffer = "";
        socket.setEncoding("utf8");
        socket.setTimeout(5000, () => socket.destroy(new Error("Admin command timed out")));
        socket.on("error", reject);
        socket.on("close", () => reject(new Error("Admin connection closed before a response")));
        socket.on("connect", () =>
            socket.write(JSON.stringify({ token: credentials.token, command, options }) + "\n"),
        );
        socket.on("data", (chunk) => {
            buffer += chunk;
            if (Buffer.byteLength(buffer) > MAX_RESPONSE)
                socket.destroy(new Error("Admin response too large"));
        });
        socket.on("end", () => {
            try {
                const response = JSON.parse(buffer);
                if (!response.ok) throw new Error(response.error || "Admin command failed");
                if (response.instance !== credentials.instance)
                    throw new Error("Relay instance changed");
                resolveResponse(response);
            } catch (error) {
                reject(error);
            }
        });
    });
}
