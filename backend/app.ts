import express from "express";
import { createClient, defineScript } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function connect() {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);

    const client = createClient({ url,
        scripts: {
            charge: defineScript({
              NUMBER_OF_KEYS: 1,
              SCRIPT:
              `
              local balance = tonumber(redis.call("get", KEYS[1]))
              if balance >= tonumber(ARGV[1]) then
                  local remainingBalance = balance - tonumber(ARGV[1])
                  redis.call("set", KEYS[1], remainingBalance)
                  return {1, remainingBalance}
              else
                  return {0, balance}
              end
          `,
              transformArguments(key: string, toAdd: number): Array<string> {
                return [key, toAdd.toString()];
              },
              transformReply(reply: Array<number>): Array<number> {
                return reply;
              }
            })
          }
        });
    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    try {
         const res = await client.charge(`${account}/balance`, charges);
         const [success, remainingBalance] = res;
         const balanceReduction = success === 1 ? charges : 0;

        return { isAuthorized: success === 1, remainingBalance, charges: balanceReduction };
    } finally {
        await client.disconnect();
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
