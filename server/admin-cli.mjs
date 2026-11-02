import { setTimeout as delay } from "node:timers/promises";

import { sendAdminCommand } from "./relay-admin.mjs";

const [command, ...flags] = process.argv.slice(2);
const graceFlag = flags.find((flag) => flag.startsWith("--endless-grace="));
const grace =
    graceFlag === undefined ? undefined : Number(graceFlag.slice("--endless-grace=".length));
if (
    !["drain", "cancel", "status"].includes(command) ||
    flags.some((flag) => !["--wait", "--json"].includes(flag) && flag !== graceFlag) ||
    ((flags.includes("--wait") || graceFlag) && command !== "drain") ||
    (grace !== undefined && (!Number.isInteger(grace) || grace < 1 || grace > 86400))
) {
    console.error(
        "Usage: node server/admin-cli.mjs drain [--wait] [--endless-grace=SECONDS] [--json] | cancel [--json] | status [--json]",
    );
    process.exitCode = 1;
} else {
    try {
        const first = await sendAdminCommand(command, { options: { endlessGraceSeconds: grace } });
        let response = first;
        let previous = "";
        for (;;) {
            if (response.instance !== first.instance)
                throw new Error("Relay restarted while waiting; check status again");
            const state = response.status;
            const text = flags.includes("--json")
                ? JSON.stringify(state)
                : !state.draining
                  ? `Accepting games: ${state.activeRuns} runs active`
                  : state.ready
                    ? "Ready to restart. Drain mode remains enabled; restart with your process manager."
                    : `Draining: ${state.activeRuns} runs (${state.endlessRuns} endless), ${state.pendingPlayers} players still finishing` +
                      (state.endlessDeadline
                          ? `; endless maintenance exit at ${new Date(state.endlessDeadline).toISOString()}`
                          : "");
            if (text !== previous) console.log(text);
            previous = text;
            if (!flags.includes("--wait") || state.ready) break;
            if (!state.draining) throw new Error("Drain cancelled; no restart requested");
            await delay(1000);
            response = await sendAdminCommand("status");
        }
    } catch (error) {
        console.error(
            `Relay admin: ${error.message}. Run this command on the server as its service account, using the same MULTIPLAYER_ADMIN_ID.`,
        );
        process.exitCode = 1;
    }
}
