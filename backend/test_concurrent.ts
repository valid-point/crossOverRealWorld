import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";

const app = supertest(buildApp());

//
async function testConcurrentRequests() {
    await app.post("/reset").expect(204);
    const start = performance.now();

    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(app.post("/charge").expect(200));
    }
    await Promise.all(promises);

    const res = await app.post("/charge").expect(200);
    console.log(res.body);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function runTests() {
    await testConcurrentRequests();
}

runTests().catch(console.error);
